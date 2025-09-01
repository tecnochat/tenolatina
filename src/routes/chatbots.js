/**
 * API REST para Gestión de Chatbots Multi-Tenant
 * 
 * Endpoints para CRUD de chatbots con aislamiento por tenant
 */

import express from 'express'
import { tenantIsolationMiddleware, requireResourceAccess, checkPlanLimits } from '../middleware/tenant-isolation-v2.js'
import { logger } from '../utils/logger.js'
import supabase from '../config/supabase.js'

const router = express.Router()

// Aplicar middleware de tenant isolation a todas las rutas
router.use(tenantIsolationMiddleware)

/**
 * @route GET /api/chatbots
 * @desc Obtener todos los chatbots del tenant
 * @access Private
 */
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 10, search, status } = req.query
        const tenantId = req.tenant.id
        
        let query = supabase
            .from('chatbots')
            .select(`
                id,
                name_chatbot,
                description,
                is_active,
                created_at,
                updated_at,
                tenant_id,
                user_id
            `, { count: 'exact' })
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
        
        // Filtros opcionales
        if (search) {
            query = query.or(`name_chatbot.ilike.%${search}%,description.ilike.%${search}%`)
        }
        
        if (status !== undefined) {
            query = query.eq('is_active', status === 'active')
        }
        
        // Paginación
        const offset = (page - 1) * limit
        query = query.range(offset, offset + limit - 1)
        
        const { data: chatbots, error, count } = await query
        
        if (error) {
            logger.error('Error obteniendo chatbots:', error)
            throw error
        }
        
        // Obtener estadísticas del tenant
        const { data: stats } = await supabase
            .from('chatbots')
            .select('is_active', { count: 'exact' })
            .eq('tenant_id', tenantId)
        
        const totalChatbots = count || 0
        const activeChatbots = chatbots?.filter(bot => bot.is_active).length || 0
        
        res.json({
            success: true,
            data: {
                chatbots: chatbots || [],
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: totalChatbots,
                    pages: Math.ceil(totalChatbots / limit)
                },
                stats: {
                    total_chatbots: totalChatbots,
                    active_chatbots: activeChatbots,
                    inactive_chatbots: totalChatbots - activeChatbots
                }
            }
        })
        
    } catch (error) {
        logger.error('Error en GET /chatbots:', error)
        res.status(500).json({
            success: false,
            error: 'Error obteniendo chatbots',
            message: error.message
        })
    }
})

/**
 * @route GET /api/chatbots/:id
 * @desc Obtener un chatbot específico
 * @access Private
 */
router.get('/:id', 
    requireResourceAccess('chatbot'),
    async (req, res) => {
        try {
            const { id } = req.params
            const tenantId = req.tenant.id
            
            const { data: chatbot, error } = await supabase
                .from('chatbots')
                .select(`
                    id,
                    name_chatbot,
                    description,
                    is_active,
                    created_at,
                    updated_at,
                    tenant_id,
                    user_id
                `)
                .eq('id', id)
                .eq('tenant_id', tenantId)
                .single()
            
            if (error) {
                logger.error('Error obteniendo chatbot:', error)
                throw error
            }
            
            if (!chatbot) {
                return res.status(404).json({
                    success: false,
                    error: 'Chatbot no encontrado',
                    message: 'El chatbot solicitado no existe o no tienes acceso a él'
                })
            }
            
            res.json({
                success: true,
                data: { chatbot }
            })
            
        } catch (error) {
            logger.error('Error en GET /chatbots/:id:', error)
            res.status(500).json({
                success: false,
                error: 'Error obteniendo chatbot',
                message: error.message
            })
        }
    }
)

/**
 * @route POST /api/chatbots
 * @desc Crear nuevo chatbot
 * @access Private
 */
router.post('/', 
    checkPlanLimits('chatbots'),
    async (req, res) => {
        try {
            const { name_chatbot, description } = req.body
            const tenantId = req.tenant.id
            const userId = req.tenant.userId
            
            // Validaciones básicas
            if (!name_chatbot || name_chatbot.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Nombre requerido',
                    message: 'El nombre del chatbot es requerido'
                })
            }
            
            if (name_chatbot.length > 100) {
                return res.status(400).json({
                    success: false,
                    error: 'Nombre muy largo',
                    message: 'El nombre no puede exceder 100 caracteres'
                })
            }
            
            // Verificar que el nombre no esté duplicado para este tenant
            const { data: existing } = await supabase
                .from('chatbots')
                .select('id')
                .eq('name_chatbot', name_chatbot.trim())
                .eq('tenant_id', tenantId)
                .single()
            
            if (existing) {
                return res.status(409).json({
                    success: false,
                    error: 'Nombre duplicado',
                    message: 'Ya tienes un chatbot con este nombre'
                })
            }
            
            // Crear el chatbot
            const { data: chatbot, error } = await supabase
                .from('chatbots')
                .insert({
                    name_chatbot: name_chatbot.trim(),
                    description: description?.trim() || null,
                    tenant_id: tenantId,
                    user_id: userId,
                    is_active: true
                })
                .select()
                .single()
            
            if (error) {
                logger.error('Error creando chatbot:', error)
                throw error
            }
            
            logger.info(`✅ Chatbot creado: ${chatbot.name_chatbot} (${chatbot.id}) - Tenant: ${tenantId}`, {
                chatbotId: chatbot.id,
                tenantId,
                userId
            })
            
            res.status(201).json({
                success: true,
                message: 'Chatbot creado exitosamente',
                data: { chatbot },
                planUsage: req.planUsage
            })
            
        } catch (error) {
            logger.error('Error en POST /chatbots:', error)
            res.status(500).json({
                success: false,
                error: 'Error creando chatbot',
                message: error.message
            })
        }
    }
)

/**
 * @route PUT /api/chatbots/:id
 * @desc Actualizar chatbot
 * @access Private
 */
router.put('/:id',
    requireResourceAccess('chatbot'),
    async (req, res) => {
        try {
            const { id } = req.params
            const { name_chatbot, description, is_active } = req.body
            const tenantId = req.tenant.id
            
            // Validaciones básicas
            if (name_chatbot !== undefined) {
                if (!name_chatbot || name_chatbot.trim().length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Nombre requerido',
                        message: 'El nombre del chatbot es requerido'
                    })
                }
                
                if (name_chatbot.length > 100) {
                    return res.status(400).json({
                        success: false,
                        error: 'Nombre muy largo',
                        message: 'El nombre no puede exceder 100 caracteres'
                    })
                }
                
                // Verificar que el nombre no esté duplicado (excluyendo el actual)
                const { data: existing } = await supabase
                    .from('chatbots')
                    .select('id')
                    .eq('name_chatbot', name_chatbot.trim())
                    .eq('tenant_id', tenantId)
                    .neq('id', id)
                    .single()
                
                if (existing) {
                    return res.status(409).json({
                        success: false,
                        error: 'Nombre duplicado',
                        message: 'Ya tienes otro chatbot con este nombre'
                    })
                }
            }
            
            // Preparar datos para actualizar
            const updateData = {}
            if (name_chatbot !== undefined) updateData.name_chatbot = name_chatbot.trim()
            if (description !== undefined) updateData.description = description?.trim() || null
            if (is_active !== undefined) updateData.is_active = Boolean(is_active)
            updateData.updated_at = new Date().toISOString()
            
            // Actualizar el chatbot
            const { data: chatbot, error } = await supabase
                .from('chatbots')
                .update(updateData)
                .eq('id', id)
                .eq('tenant_id', tenantId)
                .select()
                .single()
            
            if (error) {
                logger.error('Error actualizando chatbot:', error)
                throw error
            }
            
            if (!chatbot) {
                return res.status(404).json({
                    success: false,
                    error: 'Chatbot no encontrado',
                    message: 'El chatbot solicitado no existe o no tienes acceso a él'
                })
            }
            
            logger.info(`✅ Chatbot actualizado: ${chatbot.name_chatbot} (${chatbot.id}) - Tenant: ${tenantId}`, {
                chatbotId: chatbot.id,
                tenantId,
                changes: updateData
            })
            
            res.json({
                success: true,
                message: 'Chatbot actualizado exitosamente',
                data: { chatbot }
            })
            
        } catch (error) {
            logger.error('Error en PUT /chatbots/:id:', error)
            res.status(500).json({
                success: false,
                error: 'Error actualizando chatbot',
                message: error.message
            })
        }
    }
)

/**
 * @route DELETE /api/chatbots/:id
 * @desc Eliminar chatbot (soft delete)
 * @access Private
 */
router.delete('/:id',
    requireResourceAccess('chatbot'),
    async (req, res) => {
        try {
            const { id } = req.params
            const tenantId = req.tenant.id
            
            // Desactivar el chatbot en lugar de eliminarlo
            const { data: chatbot, error } = await supabase
                .from('chatbots')
                .update({ 
                    is_active: false,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .eq('tenant_id', tenantId)
                .select()
                .single()
            
            if (error) {
                logger.error('Error eliminando chatbot:', error)
                throw error
            }
            
            if (!chatbot) {
                return res.status(404).json({
                    success: false,
                    error: 'Chatbot no encontrado',
                    message: 'El chatbot solicitado no existe o no tienes acceso a él'
                })
            }
            
            logger.info(`🗑️ Chatbot eliminado: ${chatbot.name_chatbot} (${chatbot.id}) - Tenant: ${tenantId}`, {
                chatbotId: chatbot.id,
                tenantId
            })
            
            res.json({
                success: true,
                message: 'Chatbot eliminado exitosamente',
                data: { chatbot }
            })
            
        } catch (error) {
            logger.error('Error en DELETE /chatbots/:id:', error)
            res.status(500).json({
                success: false,
                error: 'Error eliminando chatbot',
                message: error.message
            })
        }
    }
)

/**
 * @route POST /api/chatbots/:id/activate
 * @desc Activar/Desactivar chatbot
 * @access Private
 */
router.post('/:id/activate',
    requireResourceAccess('chatbot'),
    async (req, res) => {
        try {
            const { id } = req.params
            const { is_active } = req.body
            const tenantId = req.tenant.id
            
            if (typeof is_active !== 'boolean') {
                return res.status(400).json({
                    success: false,
                    error: 'Estado requerido',
                    message: 'El estado de activación es requerido (true/false)'
                })
            }
            
            const { data: chatbot, error } = await supabase
                .from('chatbots')
                .update({ 
                    is_active,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .eq('tenant_id', tenantId)
                .select()
                .single()
            
            if (error) {
                logger.error('Error cambiando estado del chatbot:', error)
                throw error
            }
            
            if (!chatbot) {
                return res.status(404).json({
                    success: false,
                    error: 'Chatbot no encontrado',
                    message: 'El chatbot solicitado no existe o no tienes acceso a él'
                })
            }
            
            const action = is_active ? 'activado' : 'desactivado'
            logger.info(`🔄 Chatbot ${action}: ${chatbot.name_chatbot} (${chatbot.id}) - Tenant: ${tenantId}`, {
                chatbotId: chatbot.id,
                tenantId,
                is_active
            })
            
            res.json({
                success: true,
                message: `Chatbot ${action} exitosamente`,
                data: { chatbot }
            })
            
        } catch (error) {
            logger.error('Error en POST /chatbots/:id/activate:', error)
            res.status(500).json({
                success: false,
                error: 'Error cambiando estado del chatbot',
                message: error.message
            })
        }
    }
)

export default router