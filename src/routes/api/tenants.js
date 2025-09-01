import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { tenantIsolationMiddleware } from '../../middleware/tenant-isolation-v2.js'
import { requirePermission, requireRole } from '../../middleware/rbac.js'
import { logger } from '../../utils/logger.js'
import { AppConfig } from '../../config/app.js'
import bcrypt from 'bcrypt'

const router = Router()

/**
 * GET /api/tenants
 * Obtener lista de tenants (solo para administradores de plataforma)
 */
router.get('/',
    requireRole('PLATFORM_ADMIN'),
    async (req, res) => {
        try {
            const { page = 1, limit = 20, search, status, plan } = req.query
            const offset = (page - 1) * limit

            let query = supabase
                .from('tenants')
                .select(`
                    *,
                    tenant_users!inner(
                        id,
                        role,
                        users!inner(
                            id,
                            email,
                            full_name
                        )
                    )
                `, { count: 'exact' })
                .eq('tenant_users.role', 'owner')

            // Aplicar filtros
            if (search) {
                query = query.or(`name.ilike.%${search}%,domain.ilike.%${search}%`)
            }

            if (status) {
                query = query.eq('subscription_status', status)
            }

            if (plan) {
                query = query.eq('plan_type', plan)
            }

            // Aplicar paginación
            query = query
                .range(offset, offset + limit - 1)
                .order('created_at', { ascending: false })

            const { data: tenants, error, count } = await query

            if (error) {
                logger.error('Error obteniendo lista de tenants:', error)
                return res.status(500).json({
                    success: false,
                    error: 'Error obteniendo tenants'
                })
            }

            // Obtener estadísticas adicionales para cada tenant
            const tenantsWithStats = await Promise.all(
                tenants.map(async (tenant) => {
                    // Contar chatbots
                    const { count: chatbotCount } = await supabase
                        .from('chatbots')
                        .select('id', { count: 'exact', head: true })
                        .eq('tenant_id', tenant.id)

                    // Contar usuarios del tenant
                    const { count: userCount } = await supabase
                        .from('tenant_users')
                        .select('id', { count: 'exact', head: true })
                        .eq('tenant_id', tenant.id)

                    return {
                        ...tenant,
                        stats: {
                            chatbot_count: chatbotCount || 0,
                            user_count: userCount || 0
                        }
                    }
                })
            )

            res.json({
                success: true,
                data: tenantsWithStats,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: count,
                    pages: Math.ceil(count / limit)
                }
            })

        } catch (error) {
            logger.error('Error en GET /tenants:', error)
            res.status(500).json({
                success: false,
                error: 'Error interno del servidor'
            })
        }
    }
)

/**
 * GET /api/tenants/:id
 * Obtener detalles de un tenant específico
 */
router.get('/:id',
    requireRole('PLATFORM_ADMIN'),
    async (req, res) => {
        try {
            const { id } = req.params

            const { data: tenant, error } = await supabase
                .from('tenants')
                .select(`
                    *,
                    tenant_users(
                        id,
                        role,
                        created_at,
                        users(
                            id,
                            email,
                            full_name,
                            created_at,
                            last_sign_in_at
                        )
                    )
                `)
                .eq('id', id)
                .single()

            if (error) {
                logger.error('Error obteniendo tenant:', error)
                return res.status(500).json({
                    success: false,
                    error: 'Error obteniendo tenant'
                })
            }

            if (!tenant) {
                return res.status(404).json({
                    success: false,
                    error: 'Tenant no encontrado'
                })
            }

            // Obtener estadísticas detalladas
            const [chatbotStats, conversationStats, messageStats] = await Promise.all([
                // Estadísticas de chatbots
                supabase
                    .from('chatbots')
                    .select('id, status, created_at')
                    .eq('tenant_id', id),
                
                // Estadísticas de conversaciones (últimos 30 días)
                supabase
                    .from('conversations')
                    .select('id, status, created_at')
                    .eq('tenant_id', id)
                    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
                
                // Estadísticas de mensajes (últimos 30 días)
                supabase
                    .from('messages')
                    .select('id, type, created_at')
                    .eq('tenant_id', id)
                    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
            ])

            const stats = {
                chatbots: {
                    total: chatbotStats.data?.length || 0,
                    active: chatbotStats.data?.filter(c => c.status === 'active').length || 0,
                    inactive: chatbotStats.data?.filter(c => c.status === 'inactive').length || 0
                },
                conversations: {
                    total: conversationStats.data?.length || 0,
                    active: conversationStats.data?.filter(c => c.status === 'active').length || 0
                },
                messages: {
                    total: messageStats.data?.length || 0,
                    incoming: messageStats.data?.filter(m => m.type === 'incoming').length || 0,
                    outgoing: messageStats.data?.filter(m => m.type === 'outgoing').length || 0
                }
            }

            res.json({
                success: true,
                data: {
                    ...tenant,
                    stats
                }
            })

        } catch (error) {
            logger.error('Error en GET /tenants/:id:', error)
            res.status(500).json({
                success: false,
                error: 'Error interno del servidor'
            })
        }
    }
)

/**
 * POST /api/tenants
 * Crear un nuevo tenant
 */
router.post('/',
    requireRole('PLATFORM_ADMIN'),
    async (req, res) => {
        try {
            const {
                name,
                domain,
                plan_type = 'basic',
                plan_limits,
                owner_email,
                owner_name,
                owner_password,
                settings = {}
            } = req.body

            // Validaciones básicas
            if (!name || !domain || !owner_email || !owner_password) {
                return res.status(400).json({
                    success: false,
                    error: 'Campos requeridos: name, domain, owner_email, owner_password'
                })
            }

            // Verificar que el dominio no esté en uso
            const { data: existingTenant } = await supabase
                .from('tenants')
                .select('id')
                .eq('domain', domain)
                .single()

            if (existingTenant) {
                return res.status(400).json({
                    success: false,
                    error: 'El dominio ya está en uso'
                })
            }

            // Verificar que el email no esté en uso
            const { data: existingUser } = await supabase.auth.admin.getUserByEmail(owner_email)
            
            if (existingUser.user) {
                return res.status(400).json({
                    success: false,
                    error: 'El email ya está registrado'
                })
            }

            // Crear usuario owner
            const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
                email: owner_email,
                password: owner_password,
                email_confirm: true,
                user_metadata: {
                    full_name: owner_name || owner_email.split('@')[0]
                }
            })

            if (authError) {
                logger.error('Error creando usuario owner:', authError)
                return res.status(500).json({
                    success: false,
                    error: 'Error creando usuario owner'
                })
            }

            // Crear tenant
            const { data: tenant, error: tenantError } = await supabase
                .from('tenants')
                .insert({
                    name,
                    domain,
                    plan_type,
                    plan_limits: plan_limits || AppConfig.plans[plan_type] || AppConfig.plans.basic,
                    subscription_status: 'active',
                    settings,
                    created_at: new Date().toISOString()
                })
                .select()
                .single()

            if (tenantError) {
                logger.error('Error creando tenant:', tenantError)
                
                // Limpiar usuario creado si falla la creación del tenant
                await supabase.auth.admin.deleteUser(authUser.user.id)
                
                return res.status(500).json({
                    success: false,
                    error: 'Error creando tenant'
                })
            }

            // Crear relación tenant-user
            const { error: relationError } = await supabase
                .from('tenant_users')
                .insert({
                    tenant_id: tenant.id,
                    user_id: authUser.user.id,
                    role: 'owner',
                    created_at: new Date().toISOString()
                })

            if (relationError) {
                logger.error('Error creando relación tenant-user:', relationError)
                
                // Limpiar datos creados
                await supabase.from('tenants').delete().eq('id', tenant.id)
                await supabase.auth.admin.deleteUser(authUser.user.id)
                
                return res.status(500).json({
                    success: false,
                    error: 'Error creando relación tenant-user'
                })
            }

            logger.info(`Nuevo tenant creado: ${tenant.id}`, {
                tenantId: tenant.id,
                tenantName: name,
                domain,
                ownerEmail: owner_email,
                planType: plan_type
            })

            res.status(201).json({
                success: true,
                data: {
                    tenant,
                    owner: {
                        id: authUser.user.id,
                        email: authUser.user.email,
                        full_name: authUser.user.user_metadata?.full_name
                    }
                },
                message: 'Tenant creado exitosamente'
            })

        } catch (error) {
            logger.error('Error en POST /tenants:', error)
            res.status(500).json({
                success: false,
                error: 'Error interno del servidor'
            })
        }
    }
)

/**
 * PUT /api/tenants/:id
 * Actualizar un tenant
 */
router.put('/:id',
    requireRole('PLATFORM_ADMIN'),
    async (req, res) => {
        try {
            const { id } = req.params
            const {
                name,
                domain,
                plan_type,
                plan_limits,
                subscription_status,
                settings
            } = req.body

            // Verificar que el tenant existe
            const { data: existingTenant, error: checkError } = await supabase
                .from('tenants')
                .select('id, domain')
                .eq('id', id)
                .single()

            if (checkError || !existingTenant) {
                return res.status(404).json({
                    success: false,
                    error: 'Tenant no encontrado'
                })
            }

            // Si se está cambiando el dominio, verificar que no esté en uso
            if (domain && domain !== existingTenant.domain) {
                const { data: domainInUse } = await supabase
                    .from('tenants')
                    .select('id')
                    .eq('domain', domain)
                    .neq('id', id)
                    .single()

                if (domainInUse) {
                    return res.status(400).json({
                        success: false,
                        error: 'El dominio ya está en uso'
                    })
                }
            }

            // Actualizar tenant
            const updateData = {
                updated_at: new Date().toISOString()
            }

            if (name) updateData.name = name
            if (domain) updateData.domain = domain
            if (plan_type) updateData.plan_type = plan_type
            if (plan_limits) updateData.plan_limits = plan_limits
            if (subscription_status) updateData.subscription_status = subscription_status
            if (settings) updateData.settings = settings

            const { data: updatedTenant, error } = await supabase
                .from('tenants')
                .update(updateData)
                .eq('id', id)
                .select()
                .single()

            if (error) {
                logger.error('Error actualizando tenant:', error)
                return res.status(500).json({
                    success: false,
                    error: 'Error actualizando tenant'
                })
            }

            logger.info(`Tenant actualizado: ${id}`, {
                tenantId: id,
                changes: updateData
            })

            res.json({
                success: true,
                data: updatedTenant,
                message: 'Tenant actualizado exitosamente'
            })

        } catch (error) {
            logger.error('Error en PUT /tenants/:id:', error)
            res.status(500).json({
                success: false,
                error: 'Error interno del servidor'
            })
        }
    }
)

/**
 * DELETE /api/tenants/:id
 * Eliminar un tenant (soft delete)
 */
router.delete('/:id',
    requireRole('PLATFORM_ADMIN'),
    async (req, res) => {
        try {
            const { id } = req.params
            const { force = false } = req.query

            // Verificar que el tenant existe
            const { data: tenant, error: checkError } = await supabase
                .from('tenants')
                .select('id, name, subscription_status')
                .eq('id', id)
                .single()

            if (checkError || !tenant) {
                return res.status(404).json({
                    success: false,
                    error: 'Tenant no encontrado'
                })
            }

            if (force === 'true') {
                // Eliminación completa (hard delete)
                // ADVERTENCIA: Esto eliminará todos los datos relacionados
                
                // Eliminar en orden para respetar las foreign keys
                await supabase.from('messages').delete().eq('tenant_id', id)
                await supabase.from('conversations').delete().eq('tenant_id', id)
                await supabase.from('chatbot_configs').delete().eq('chatbot_id', id)
                await supabase.from('chatbots').delete().eq('tenant_id', id)
                await supabase.from('tenant_users').delete().eq('tenant_id', id)
                
                const { error: deleteError } = await supabase
                    .from('tenants')
                    .delete()
                    .eq('id', id)

                if (deleteError) {
                    logger.error('Error eliminando tenant (hard delete):', deleteError)
                    return res.status(500).json({
                        success: false,
                        error: 'Error eliminando tenant'
                    })
                }

                logger.warn(`Tenant eliminado permanentemente: ${id}`, {
                    tenantId: id,
                    tenantName: tenant.name,
                    type: 'hard_delete'
                })

                res.json({
                    success: true,
                    message: 'Tenant eliminado permanentemente'
                })

            } else {
                // Soft delete - solo cambiar el estado
                const { data: updatedTenant, error } = await supabase
                    .from('tenants')
                    .update({
                        subscription_status: 'deleted',
                        deleted_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', id)
                    .select()
                    .single()

                if (error) {
                    logger.error('Error eliminando tenant (soft delete):', error)
                    return res.status(500).json({
                        success: false,
                        error: 'Error eliminando tenant'
                    })
                }

                logger.info(`Tenant eliminado (soft delete): ${id}`, {
                    tenantId: id,
                    tenantName: tenant.name,
                    type: 'soft_delete'
                })

                res.json({
                    success: true,
                    data: updatedTenant,
                    message: 'Tenant desactivado exitosamente'
                })
            }

        } catch (error) {
            logger.error('Error en DELETE /tenants/:id:', error)
            res.status(500).json({
                success: false,
                error: 'Error interno del servidor'
            })
        }
    }
)

/**
 * POST /api/tenants/:id/suspend
 * Suspender un tenant
 */
router.post('/:id/suspend',
    requireRole('PLATFORM_ADMIN'),
    async (req, res) => {
        try {
            const { id } = req.params
            const { reason } = req.body

            const { data: updatedTenant, error } = await supabase
                .from('tenants')
                .update({
                    subscription_status: 'suspended',
                    suspension_reason: reason,
                    suspended_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .select()
                .single()

            if (error) {
                logger.error('Error suspendiendo tenant:', error)
                return res.status(500).json({
                    success: false,
                    error: 'Error suspendiendo tenant'
                })
            }

            if (!updatedTenant) {
                return res.status(404).json({
                    success: false,
                    error: 'Tenant no encontrado'
                })
            }

            logger.warn(`Tenant suspendido: ${id}`, {
                tenantId: id,
                reason
            })

            res.json({
                success: true,
                data: updatedTenant,
                message: 'Tenant suspendido exitosamente'
            })

        } catch (error) {
            logger.error('Error en POST /tenants/:id/suspend:', error)
            res.status(500).json({
                success: false,
                error: 'Error interno del servidor'
            })
        }
    }
)

/**
 * POST /api/tenants/:id/reactivate
 * Reactivar un tenant suspendido
 */
router.post('/:id/reactivate',
    requireRole('PLATFORM_ADMIN'),
    async (req, res) => {
        try {
            const { id } = req.params

            const { data: updatedTenant, error } = await supabase
                .from('tenants')
                .update({
                    subscription_status: 'active',
                    suspension_reason: null,
                    suspended_at: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .select()
                .single()

            if (error) {
                logger.error('Error reactivando tenant:', error)
                return res.status(500).json({
                    success: false,
                    error: 'Error reactivando tenant'
                })
            }

            if (!updatedTenant) {
                return res.status(404).json({
                    success: false,
                    error: 'Tenant no encontrado'
                })
            }

            logger.info(`Tenant reactivado: ${id}`, {
                tenantId: id
            })

            res.json({
                success: true,
                data: updatedTenant,
                message: 'Tenant reactivado exitosamente'
            })

        } catch (error) {
            logger.error('Error en POST /tenants/:id/reactivate:', error)
            res.status(500).json({
                success: false,
                error: 'Error interno del servidor'
            })
        }
    }
)

export default router