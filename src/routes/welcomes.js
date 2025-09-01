import { Router } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import { requirePermission, requireResourceAccess } from '../middleware/rbac.js'
import { createSupabaseClient } from '../config/supabase.js'
import { AppConfig } from '../config/app-config.js'
import { v4 as uuidv4 } from 'uuid'

const router = Router()

/**
 * Validaciones comunes
 */
const validateWelcome = [
    body('name')
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('El nombre debe tener entre 1 y 100 caracteres'),
    body('message')
        .trim()
        .isLength({ min: 1, max: 4000 })
        .withMessage('El mensaje debe tener entre 1 y 4000 caracteres'),
    body('message_type')
        .isIn(['text', 'media', 'template'])
        .withMessage('Tipo de mensaje inválido'),
    body('trigger_type')
        .isIn(['first_contact', 'daily', 'always'])
        .withMessage('Tipo de trigger inválido'),
    body('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active debe ser un booleano'),
    body('delay_seconds')
        .optional()
        .isInt({ min: 0, max: 300 })
        .withMessage('El delay debe ser entre 0 y 300 segundos')
]

const validateWelcomeUpdate = [
    body('name')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('El nombre debe tener entre 1 y 100 caracteres'),
    body('message')
        .optional()
        .trim()
        .isLength({ min: 1, max: 4000 })
        .withMessage('El mensaje debe tener entre 1 y 4000 caracteres'),
    body('message_type')
        .optional()
        .isIn(['text', 'media', 'template'])
        .withMessage('Tipo de mensaje inválido'),
    body('trigger_type')
        .optional()
        .isIn(['first_contact', 'daily', 'always'])
        .withMessage('Tipo de trigger inválido'),
    body('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active debe ser un booleano'),
    body('delay_seconds')
        .optional()
        .isInt({ min: 0, max: 300 })
        .withMessage('El delay debe ser entre 0 y 300 segundos')
]

/**
 * GET /api/welcomes
 * Obtener todos los welcomes del tenant
 */
router.get('/', 
    requirePermission('welcomes', 'read'),
    [
        query('chatbot_id')
            .optional()
            .isUUID()
            .withMessage('chatbot_id debe ser un UUID válido'),
        query('is_active')
            .optional()
            .isBoolean()
            .withMessage('is_active debe ser un booleano'),
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('page debe ser un número mayor a 0'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('limit debe ser un número entre 1 y 100')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Datos de entrada inválidos',
                    details: errors.array()
                })
            }

            const supabase = createSupabaseClient(req.tenant.id)
            const { chatbot_id, is_active, page = 1, limit = 20 } = req.query
            const offset = (page - 1) * limit

            let query = supabase
                .from('welcomes')
                .select(`
                    id,
                    name,
                    message,
                    message_type,
                    trigger_type,
                    is_active,
                    delay_seconds,
                    chatbot_id,
                    created_at,
                    updated_at,
                    chatbots!inner(
                        id,
                        name
                    )
                `)
                .eq('tenant_id', req.tenant.id)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1)

            // Filtros opcionales
            if (chatbot_id) {
                query = query.eq('chatbot_id', chatbot_id)
            }
            if (is_active !== undefined) {
                query = query.eq('is_active', is_active)
            }

            const { data: welcomes, error, count } = await query

            if (error) {
                console.error('Error obteniendo welcomes:', error)
                return res.status(500).json({
                    error: 'Error obteniendo welcomes',
                    message: error.message
                })
            }

            // Obtener total de registros para paginación
            const { count: totalCount } = await supabase
                .from('welcomes')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', req.tenant.id)

            res.json({
                welcomes,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: totalCount,
                    pages: Math.ceil(totalCount / limit)
                }
            })

        } catch (error) {
            console.error('Error en GET /api/welcomes:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * GET /api/welcomes/:id
 * Obtener un welcome específico
 */
router.get('/:id',
    requirePermission('welcomes', 'read'),
    requireResourceAccess('welcome', 'read'),
    [
        param('id')
            .isUUID()
            .withMessage('ID debe ser un UUID válido')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Datos de entrada inválidos',
                    details: errors.array()
                })
            }

            const supabase = createSupabaseClient(req.tenant.id)
            const { id } = req.params

            const { data: welcome, error } = await supabase
                .from('welcomes')
                .select(`
                    id,
                    name,
                    message,
                    message_type,
                    trigger_type,
                    is_active,
                    delay_seconds,
                    chatbot_id,
                    created_at,
                    updated_at,
                    chatbots!inner(
                        id,
                        name
                    )
                `)
                .eq('id', id)
                .eq('tenant_id', req.tenant.id)
                .single()

            if (error) {
                if (error.code === 'PGRST116') {
                    return res.status(404).json({
                        error: 'Welcome no encontrado',
                        message: 'El welcome solicitado no existe o no tienes acceso'
                    })
                }
                console.error('Error obteniendo welcome:', error)
                return res.status(500).json({
                    error: 'Error obteniendo welcome',
                    message: error.message
                })
            }

            res.json({ welcome })

        } catch (error) {
            console.error('Error en GET /api/welcomes/:id:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * POST /api/welcomes
 * Crear un nuevo welcome
 */
router.post('/',
    requirePermission('welcomes', 'create'),
    validateWelcome,
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Datos de entrada inválidos',
                    details: errors.array()
                })
            }

            const supabase = createSupabaseClient(req.tenant.id)
            const {
                name,
                message,
                message_type,
                trigger_type,
                chatbot_id,
                is_active = true,
                delay_seconds = 0
            } = req.body

            // Verificar que el chatbot pertenece al tenant
            const { data: chatbot, error: chatbotError } = await supabase
                .from('chatbots')
                .select('id')
                .eq('id', chatbot_id)
                .eq('tenant_id', req.tenant.id)
                .single()

            if (chatbotError || !chatbot) {
                return res.status(400).json({
                    error: 'Chatbot inválido',
                    message: 'El chatbot especificado no existe o no tienes acceso'
                })
            }

            // Verificar límites del plan
            const { data: welcomeCount } = await supabase
                .from('welcomes')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', req.tenant.id)

            const planLimits = AppConfig.plans[req.tenant.plan] || AppConfig.plans.free
            if (welcomeCount >= planLimits.maxWelcomes) {
                return res.status(403).json({
                    error: 'Límite de welcomes alcanzado',
                    message: `Tu plan ${req.tenant.plan} permite máximo ${planLimits.maxWelcomes} welcomes`,
                    current: welcomeCount,
                    limit: planLimits.maxWelcomes
                })
            }

            // Verificar si ya existe un welcome activo para este chatbot y trigger_type
            if (is_active) {
                const { data: existingWelcome } = await supabase
                    .from('welcomes')
                    .select('id')
                    .eq('chatbot_id', chatbot_id)
                    .eq('trigger_type', trigger_type)
                    .eq('is_active', true)
                    .single()

                if (existingWelcome) {
                    return res.status(400).json({
                        error: 'Welcome duplicado',
                        message: `Ya existe un welcome activo de tipo '${trigger_type}' para este chatbot`
                    })
                }
            }

            // Crear el welcome
            const welcomeData = {
                id: uuidv4(),
                tenant_id: req.tenant.id,
                chatbot_id,
                name: name.trim(),
                message: message.trim(),
                message_type,
                trigger_type,
                is_active,
                delay_seconds,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }

            const { data: welcome, error } = await supabase
                .from('welcomes')
                .insert(welcomeData)
                .select(`
                    id,
                    name,
                    message,
                    message_type,
                    trigger_type,
                    is_active,
                    delay_seconds,
                    chatbot_id,
                    created_at,
                    updated_at
                `)
                .single()

            if (error) {
                console.error('Error creando welcome:', error)
                return res.status(500).json({
                    error: 'Error creando welcome',
                    message: error.message
                })
            }

            res.status(201).json({
                message: 'Welcome creado exitosamente',
                welcome
            })

        } catch (error) {
            console.error('Error en POST /api/welcomes:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * PUT /api/welcomes/:id
 * Actualizar un welcome existente
 */
router.put('/:id',
    requirePermission('welcomes', 'update'),
    requireResourceAccess('welcome', 'update'),
    [
        param('id')
            .isUUID()
            .withMessage('ID debe ser un UUID válido'),
        ...validateWelcomeUpdate
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Datos de entrada inválidos',
                    details: errors.array()
                })
            }

            const supabase = createSupabaseClient(req.tenant.id)
            const { id } = req.params
            const updateData = { ...req.body }

            // Verificar que el welcome existe y pertenece al tenant
            const { data: existingWelcome, error: fetchError } = await supabase
                .from('welcomes')
                .select('id, chatbot_id, trigger_type, is_active')
                .eq('id', id)
                .eq('tenant_id', req.tenant.id)
                .single()

            if (fetchError || !existingWelcome) {
                return res.status(404).json({
                    error: 'Welcome no encontrado',
                    message: 'El welcome solicitado no existe o no tienes acceso'
                })
            }

            // Si se activa el welcome, verificar que no haya otro activo del mismo tipo
            if (updateData.is_active === true || 
                (updateData.trigger_type && existingWelcome.is_active)) {
                
                const triggerType = updateData.trigger_type || existingWelcome.trigger_type
                
                const { data: conflictingWelcome } = await supabase
                    .from('welcomes')
                    .select('id')
                    .eq('chatbot_id', existingWelcome.chatbot_id)
                    .eq('trigger_type', triggerType)
                    .eq('is_active', true)
                    .neq('id', id)
                    .single()

                if (conflictingWelcome) {
                    return res.status(400).json({
                        error: 'Welcome duplicado',
                        message: `Ya existe un welcome activo de tipo '${triggerType}' para este chatbot`
                    })
                }
            }

            // Limpiar datos de actualización
            if (updateData.name) updateData.name = updateData.name.trim()
            if (updateData.message) updateData.message = updateData.message.trim()
            updateData.updated_at = new Date().toISOString()

            // Actualizar el welcome
            const { data: welcome, error } = await supabase
                .from('welcomes')
                .update(updateData)
                .eq('id', id)
                .eq('tenant_id', req.tenant.id)
                .select(`
                    id,
                    name,
                    message,
                    message_type,
                    trigger_type,
                    is_active,
                    delay_seconds,
                    chatbot_id,
                    created_at,
                    updated_at
                `)
                .single()

            if (error) {
                console.error('Error actualizando welcome:', error)
                return res.status(500).json({
                    error: 'Error actualizando welcome',
                    message: error.message
                })
            }

            res.json({
                message: 'Welcome actualizado exitosamente',
                welcome
            })

        } catch (error) {
            console.error('Error en PUT /api/welcomes/:id:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * DELETE /api/welcomes/:id
 * Eliminar un welcome
 */
router.delete('/:id',
    requirePermission('welcomes', 'delete'),
    requireResourceAccess('welcome', 'delete'),
    [
        param('id')
            .isUUID()
            .withMessage('ID debe ser un UUID válido')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Datos de entrada inválidos',
                    details: errors.array()
                })
            }

            const supabase = createSupabaseClient(req.tenant.id)
            const { id } = req.params

            // Verificar que el welcome existe y pertenece al tenant
            const { data: existingWelcome, error: fetchError } = await supabase
                .from('welcomes')
                .select('id, name')
                .eq('id', id)
                .eq('tenant_id', req.tenant.id)
                .single()

            if (fetchError || !existingWelcome) {
                return res.status(404).json({
                    error: 'Welcome no encontrado',
                    message: 'El welcome solicitado no existe o no tienes acceso'
                })
            }

            // Eliminar el welcome
            const { error } = await supabase
                .from('welcomes')
                .delete()
                .eq('id', id)
                .eq('tenant_id', req.tenant.id)

            if (error) {
                console.error('Error eliminando welcome:', error)
                return res.status(500).json({
                    error: 'Error eliminando welcome',
                    message: error.message
                })
            }

            res.json({
                message: 'Welcome eliminado exitosamente',
                deletedWelcome: {
                    id: existingWelcome.id,
                    name: existingWelcome.name
                }
            })

        } catch (error) {
            console.error('Error en DELETE /api/welcomes/:id:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * POST /api/welcomes/:id/toggle
 * Activar/desactivar un welcome
 */
router.post('/:id/toggle',
    requirePermission('welcomes', 'update'),
    requireResourceAccess('welcome', 'update'),
    [
        param('id')
            .isUUID()
            .withMessage('ID debe ser un UUID válido')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Datos de entrada inválidos',
                    details: errors.array()
                })
            }

            const supabase = createSupabaseClient(req.tenant.id)
            const { id } = req.params

            // Obtener estado actual
            const { data: welcome, error: fetchError } = await supabase
                .from('welcomes')
                .select('id, name, is_active, trigger_type, chatbot_id')
                .eq('id', id)
                .eq('tenant_id', req.tenant.id)
                .single()

            if (fetchError || !welcome) {
                return res.status(404).json({
                    error: 'Welcome no encontrado',
                    message: 'El welcome solicitado no existe o no tienes acceso'
                })
            }

            const newState = !welcome.is_active

            // Si se va a activar, verificar que no haya otro activo del mismo tipo
            if (newState) {
                const { data: conflictingWelcome } = await supabase
                    .from('welcomes')
                    .select('id')
                    .eq('chatbot_id', welcome.chatbot_id)
                    .eq('trigger_type', welcome.trigger_type)
                    .eq('is_active', true)
                    .neq('id', id)
                    .single()

                if (conflictingWelcome) {
                    return res.status(400).json({
                        error: 'Welcome duplicado',
                        message: `Ya existe un welcome activo de tipo '${welcome.trigger_type}' para este chatbot`
                    })
                }
            }

            // Cambiar estado
            const { data: updatedWelcome, error } = await supabase
                .from('welcomes')
                .update({ 
                    is_active: newState,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .eq('tenant_id', req.tenant.id)
                .select('id, name, is_active')
                .single()

            if (error) {
                console.error('Error cambiando estado del welcome:', error)
                return res.status(500).json({
                    error: 'Error cambiando estado del welcome',
                    message: error.message
                })
            }

            res.json({
                message: `Welcome ${newState ? 'activado' : 'desactivado'} exitosamente`,
                welcome: updatedWelcome
            })

        } catch (error) {
            console.error('Error en POST /api/welcomes/:id/toggle:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * GET /api/welcomes/chatbot/:chatbotId/active
 * Obtener welcome activo para un chatbot específico
 */
router.get('/chatbot/:chatbotId/active',
    requirePermission('welcomes', 'read'),
    [
        param('chatbotId')
            .isUUID()
            .withMessage('chatbotId debe ser un UUID válido'),
        query('trigger_type')
            .optional()
            .isIn(['first_contact', 'daily', 'always'])
            .withMessage('trigger_type inválido')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Datos de entrada inválidos',
                    details: errors.array()
                })
            }

            const supabase = createSupabaseClient(req.tenant.id)
            const { chatbotId } = req.params
            const { trigger_type = 'first_contact' } = req.query

            // Verificar que el chatbot pertenece al tenant
            const { data: chatbot, error: chatbotError } = await supabase
                .from('chatbots')
                .select('id')
                .eq('id', chatbotId)
                .eq('tenant_id', req.tenant.id)
                .single()

            if (chatbotError || !chatbot) {
                return res.status(404).json({
                    error: 'Chatbot no encontrado',
                    message: 'El chatbot especificado no existe o no tienes acceso'
                })
            }

            // Obtener welcome activo
            const { data: welcome, error } = await supabase
                .from('welcomes')
                .select(`
                    id,
                    name,
                    message,
                    message_type,
                    trigger_type,
                    delay_seconds,
                    created_at,
                    updated_at
                `)
                .eq('chatbot_id', chatbotId)
                .eq('trigger_type', trigger_type)
                .eq('is_active', true)
                .single()

            if (error) {
                if (error.code === 'PGRST116') {
                    return res.status(404).json({
                        error: 'Welcome no encontrado',
                        message: `No hay welcome activo de tipo '${trigger_type}' para este chatbot`
                    })
                }
                console.error('Error obteniendo welcome activo:', error)
                return res.status(500).json({
                    error: 'Error obteniendo welcome activo',
                    message: error.message
                })
            }

            res.json({ welcome })

        } catch (error) {
            console.error('Error en GET /api/welcomes/chatbot/:chatbotId/active:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

export default router