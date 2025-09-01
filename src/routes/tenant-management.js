/**
 * Rutas de Gestión de Tenants
 * 
 * Endpoints para administración completa de tenants en el sistema SAAS
 */

import express from 'express'
import { tenantIsolationMiddleware, requireResourceAccess, checkPlanLimits } from '../middleware/tenant-isolation-v2.js'
import { requirePermission, requireRole } from '../middleware/rbac.js'
import AuthServiceV2 from '../services/auth-service-v2.js'
import { createSupabaseClient } from '../config/supabase.js'
import { AppConfig } from '../config/app-config.js'
import { logger } from '../utils/logger.js'
import { v4 as uuidv4 } from 'uuid'

const router = express.Router()

/**
 * @route POST /api/tenants/register
 * @desc Registrar nuevo tenant con usuario owner
 * @access Public
 */
router.post('/register', async (req, res) => {
    try {
        const {
            email,
            password,
            fullName,
            tenantName,
            tenantSlug,
            plan = 'free'
        } = req.body

        // Validar datos requeridos
        if (!email || !password || !fullName || !tenantName) {
            return res.status(400).json({
                error: 'Datos requeridos faltantes',
                code: 'MISSING_REQUIRED_FIELDS',
                required: ['email', 'password', 'fullName', 'tenantName']
            })
        }

        // Validar plan
        if (!AppConfig.plans[plan]) {
            return res.status(400).json({
                error: 'Plan inválido',
                code: 'INVALID_PLAN',
                availablePlans: Object.keys(AppConfig.plans)
            })
        }

        const result = await AuthServiceV2.register({
            email,
            password,
            fullName,
            tenantName,
            tenantSlug,
            plan
        })

        res.status(201).json({
            success: true,
            message: 'Tenant registrado exitosamente',
            data: result
        })

    } catch (error) {
        logger.error('Error en registro de tenant:', error)
        res.status(400).json({
            error: error.message,
            code: 'REGISTRATION_ERROR'
        })
    }
})

/**
 * @route POST /api/tenants/login
 * @desc Login de usuario
 * @access Public
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body

        if (!email || !password) {
            return res.status(400).json({
                error: 'Email y contraseña requeridos',
                code: 'MISSING_CREDENTIALS'
            })
        }

        const result = await AuthServiceV2.login(email, password)

        res.json({
            success: true,
            message: 'Login exitoso',
            data: result
        })

    } catch (error) {
        logger.error('Error en login:', error)
        res.status(401).json({
            error: error.message,
            code: 'LOGIN_ERROR'
        })
    }
})

/**
 * @route POST /api/tenants/logout
 * @desc Logout de usuario
 * @access Private
 */
router.post('/logout', tenantIsolationMiddleware, async (req, res) => {
    try {
        const token = req.headers.authorization?.substring(7)
        await AuthServiceV2.logout(token)

        res.json({
            success: true,
            message: 'Logout exitoso'
        })

    } catch (error) {
        logger.error('Error en logout:', error)
        res.status(500).json({
            error: 'Error interno en logout',
            code: 'LOGOUT_ERROR'
        })
    }
})

/**
 * @route POST /api/tenants/refresh
 * @desc Refrescar tokens
 * @access Public
 */
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body

        if (!refreshToken) {
            return res.status(400).json({
                error: 'Token de refresco requerido',
                code: 'MISSING_REFRESH_TOKEN'
            })
        }

        const result = await AuthServiceV2.refreshTokens(refreshToken)

        res.json({
            success: true,
            message: 'Tokens refrescados exitosamente',
            data: result
        })

    } catch (error) {
        logger.error('Error refrescando tokens:', error)
        res.status(401).json({
            error: error.message,
            code: 'REFRESH_ERROR'
        })
    }
})

/**
 * @route GET /api/tenants/profile
 * @desc Obtener perfil del usuario actual
 * @access Private
 */
router.get('/profile', tenantIsolationMiddleware, async (req, res) => {
    try {
        const profile = await AuthServiceV2.getUserProfile(req.tenant.userId)

        res.json({
            success: true,
            data: profile
        })

    } catch (error) {
        logger.error('Error obteniendo perfil:', error)
        res.status(500).json({
            error: error.message,
            code: 'PROFILE_ERROR'
        })
    }
})

/**
 * @route PUT /api/tenants/profile
 * @desc Actualizar perfil del usuario
 * @access Private
 */
router.put('/profile', tenantIsolationMiddleware, async (req, res) => {
    try {
        const { fullName, preferences } = req.body
        const supabase = req.supabase

        // Actualizar metadata del usuario
        const { error: updateError } = await supabase.auth.admin.updateUserById(
            req.tenant.userId,
            {
                user_metadata: {
                    full_name: fullName,
                    preferences: preferences || {}
                }
            }
        )

        if (updateError) {
            throw new Error(`Error actualizando perfil: ${updateError.message}`)
        }

        res.json({
            success: true,
            message: 'Perfil actualizado exitosamente'
        })

    } catch (error) {
        logger.error('Error actualizando perfil:', error)
        res.status(500).json({
            error: error.message,
            code: 'PROFILE_UPDATE_ERROR'
        })
    }
})

/**
 * @route POST /api/tenants/change-password
 * @desc Cambiar contraseña del usuario
 * @access Private
 */
router.post('/change-password', tenantIsolationMiddleware, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                error: 'Contraseña actual y nueva requeridas',
                code: 'MISSING_PASSWORDS'
            })
        }

        await AuthServiceV2.changePassword(req.tenant.userId, currentPassword, newPassword)

        res.json({
            success: true,
            message: 'Contraseña cambiada exitosamente'
        })

    } catch (error) {
        logger.error('Error cambiando contraseña:', error)
        res.status(400).json({
            error: error.message,
            code: 'PASSWORD_CHANGE_ERROR'
        })
    }
})

/**
 * @route GET /api/tenants/info
 * @desc Obtener información del tenant actual
 * @access Private
 */
router.get('/info', tenantIsolationMiddleware, async (req, res) => {
    try {
        const supabase = req.supabase
        
        const { data: tenant, error } = await supabase
            .from('tenants')
            .select(`
                id,
                name,
                slug,
                plan,
                subscription_status,
                created_at,
                settings,
                owner_id
            `)
            .eq('id', req.tenant.id)
            .single()

        if (error) {
            throw new Error(`Error obteniendo información del tenant: ${error.message}`)
        }

        // Obtener estadísticas de uso
        const [chatbotsCount, conversationsCount, messagesCount, teamMembersCount] = await Promise.all([
            supabase.from('chatbots').select('*', { count: 'exact', head: true }).eq('tenant_id', req.tenant.id),
            supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', req.tenant.id),
            supabase.from('messages').select('*', { count: 'exact', head: true }).eq('tenant_id', req.tenant.id),
            supabase.from('tenant_users').select('*', { count: 'exact', head: true }).eq('tenant_id', req.tenant.id).eq('is_active', true)
        ])

        const planLimits = AppConfig.plans[tenant.plan] || AppConfig.plans.free

        res.json({
            success: true,
            data: {
                ...tenant,
                usage: {
                    chatbots: chatbotsCount.count || 0,
                    conversations: conversationsCount.count || 0,
                    messages: messagesCount.count || 0,
                    teamMembers: teamMembersCount.count || 0
                },
                limits: planLimits
            }
        })

    } catch (error) {
        logger.error('Error obteniendo información del tenant:', error)
        res.status(500).json({
            error: error.message,
            code: 'TENANT_INFO_ERROR'
        })
    }
})

/**
 * @route PUT /api/tenants/settings
 * @desc Actualizar configuración del tenant
 * @access Private - Requiere rol admin o owner
 */
router.put('/settings', 
    tenantIsolationMiddleware,
    requireRole(['owner', 'admin']),
    async (req, res) => {
        try {
            const { settings } = req.body
            const supabase = req.supabase

            if (!settings || typeof settings !== 'object') {
                return res.status(400).json({
                    error: 'Configuración inválida',
                    code: 'INVALID_SETTINGS'
                })
            }

            const { error } = await supabase
                .from('tenants')
                .update({ 
                    settings,
                    updated_at: new Date().toISOString()
                })
                .eq('id', req.tenant.id)

            if (error) {
                throw new Error(`Error actualizando configuración: ${error.message}`)
            }

            res.json({
                success: true,
                message: 'Configuración actualizada exitosamente'
            })

        } catch (error) {
            logger.error('Error actualizando configuración del tenant:', error)
            res.status(500).json({
                error: error.message,
                code: 'SETTINGS_UPDATE_ERROR'
            })
        }
    }
)

/**
 * @route GET /api/tenants/team
 * @desc Obtener miembros del equipo
 * @access Private
 */
router.get('/team', tenantIsolationMiddleware, async (req, res) => {
    try {
        const supabase = req.supabase
        
        const { data: teamMembers, error } = await supabase
            .from('tenant_users')
            .select(`
                user_id,
                role,
                is_active,
                joined_at,
                last_login,
                invited_by,
                invited_at
            `)
            .eq('tenant_id', req.tenant.id)
            .order('joined_at', { ascending: false })

        if (error) {
            throw new Error(`Error obteniendo equipo: ${error.message}`)
        }

        // Obtener información adicional de usuarios
        const enrichedMembers = await Promise.all(
            teamMembers.map(async (member) => {
                try {
                    const { data: user } = await supabase.auth.admin.getUserById(member.user_id)
                    return {
                        ...member,
                        email: user.user?.email,
                        fullName: user.user?.user_metadata?.full_name,
                        createdAt: user.user?.created_at
                    }
                } catch (error) {
                    logger.warn(`Error obteniendo datos del usuario ${member.user_id}:`, error)
                    return member
                }
            })
        )

        res.json({
            success: true,
            data: enrichedMembers
        })

    } catch (error) {
        logger.error('Error obteniendo equipo:', error)
        res.status(500).json({
            error: error.message,
            code: 'TEAM_ERROR'
        })
    }
})

/**
 * @route POST /api/tenants/team/invite
 * @desc Invitar usuario al equipo
 * @access Private - Requiere rol admin o owner
 */
router.post('/team/invite',
    tenantIsolationMiddleware,
    requireRole(['owner', 'admin']),
    checkPlanLimits('team_members'),
    async (req, res) => {
        try {
            const { email, role = 'member' } = req.body

            if (!email) {
                return res.status(400).json({
                    error: 'Email requerido',
                    code: 'MISSING_EMAIL'
                })
            }

            const validRoles = ['member', 'editor', 'admin']
            if (!validRoles.includes(role)) {
                return res.status(400).json({
                    error: 'Rol inválido',
                    code: 'INVALID_ROLE',
                    validRoles
                })
            }

            const result = await AuthServiceV2.inviteUser(
                req.tenant.id,
                req.tenant.userId,
                email,
                role
            )

            res.status(201).json({
                success: true,
                message: 'Usuario invitado exitosamente',
                data: result
            })

        } catch (error) {
            logger.error('Error invitando usuario:', error)
            res.status(400).json({
                error: error.message,
                code: 'INVITE_ERROR'
            })
        }
    }
)

/**
 * @route DELETE /api/tenants/team/:userId
 * @desc Remover usuario del equipo
 * @access Private - Requiere rol admin o owner
 */
router.delete('/team/:userId',
    tenantIsolationMiddleware,
    requireRole(['owner', 'admin']),
    async (req, res) => {
        try {
            const { userId } = req.params
            const supabase = req.supabase

            // No permitir que el owner se remueva a sí mismo
            if (userId === req.tenant.userId) {
                return res.status(400).json({
                    error: 'No puedes removerte a ti mismo',
                    code: 'CANNOT_REMOVE_SELF'
                })
            }

            // Verificar que el usuario existe en el tenant
            const { data: member, error: memberError } = await supabase
                .from('tenant_users')
                .select('role')
                .eq('tenant_id', req.tenant.id)
                .eq('user_id', userId)
                .single()

            if (memberError || !member) {
                return res.status(404).json({
                    error: 'Usuario no encontrado en el equipo',
                    code: 'USER_NOT_FOUND'
                })
            }

            // Solo el owner puede remover admins
            if (member.role === 'admin' && req.tenant.role !== 'owner') {
                return res.status(403).json({
                    error: 'Solo el propietario puede remover administradores',
                    code: 'INSUFFICIENT_PERMISSIONS'
                })
            }

            // Remover usuario del tenant
            const { error } = await supabase
                .from('tenant_users')
                .delete()
                .eq('tenant_id', req.tenant.id)
                .eq('user_id', userId)

            if (error) {
                throw new Error(`Error removiendo usuario: ${error.message}`)
            }

            res.json({
                success: true,
                message: 'Usuario removido del equipo exitosamente'
            })

        } catch (error) {
            logger.error('Error removiendo usuario del equipo:', error)
            res.status(500).json({
                error: error.message,
                code: 'REMOVE_USER_ERROR'
            })
        }
    }
)

/**
 * @route PUT /api/tenants/team/:userId/role
 * @desc Cambiar rol de usuario en el equipo
 * @access Private - Requiere rol owner
 */
router.put('/team/:userId/role',
    tenantIsolationMiddleware,
    requireRole(['owner']),
    async (req, res) => {
        try {
            const { userId } = req.params
            const { role } = req.body
            const supabase = req.supabase

            const validRoles = ['member', 'editor', 'admin']
            if (!validRoles.includes(role)) {
                return res.status(400).json({
                    error: 'Rol inválido',
                    code: 'INVALID_ROLE',
                    validRoles
                })
            }

            // No permitir cambiar el rol del owner
            if (userId === req.tenant.userId) {
                return res.status(400).json({
                    error: 'No puedes cambiar tu propio rol',
                    code: 'CANNOT_CHANGE_OWN_ROLE'
                })
            }

            const { error } = await supabase
                .from('tenant_users')
                .update({ 
                    role,
                    updated_at: new Date().toISOString()
                })
                .eq('tenant_id', req.tenant.id)
                .eq('user_id', userId)

            if (error) {
                throw new Error(`Error cambiando rol: ${error.message}`)
            }

            res.json({
                success: true,
                message: 'Rol actualizado exitosamente'
            })

        } catch (error) {
            logger.error('Error cambiando rol de usuario:', error)
            res.status(500).json({
                error: error.message,
                code: 'CHANGE_ROLE_ERROR'
            })
        }
    }
)

/**
 * @route GET /api/tenants/plans
 * @desc Obtener planes disponibles
 * @access Public
 */
router.get('/plans', (req, res) => {
    try {
        const plans = Object.entries(AppConfig.plans).map(([key, plan]) => ({
            id: key,
            ...plan
        }))

        res.json({
            success: true,
            data: plans
        })

    } catch (error) {
        logger.error('Error obteniendo planes:', error)
        res.status(500).json({
            error: 'Error interno obteniendo planes',
            code: 'PLANS_ERROR'
        })
    }
})

export default router