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
const validateFlow = [
    body('name')
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('El nombre debe tener entre 1 y 100 caracteres'),
    body('description')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('La descripción no puede exceder 500 caracteres'),
    body('keywords')
        .isArray({ min: 1 })
        .withMessage('Debe proporcionar al menos una palabra clave')
        .custom((keywords) => {
            if (!keywords.every(k => typeof k === 'string' && k.trim().length > 0)) {
                throw new Error('Todas las palabras clave deben ser strings no vacíos')
            }
            return true
        }),
    body('response_type')
        .isIn(['text', 'media', 'template'])
        .withMessage('Tipo de respuesta inválido'),
    body('response_content')
        .trim()
        .isLength({ min: 1, max: 4000 })
        .withMessage('El contenido de respuesta debe tener entre 1 y 4000 caracteres'),
    body('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active debe ser un booleano'),
    body('priority')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('La prioridad debe ser un número entre 1 y 100')
]

const validateFlowUpdate = [
    body('name')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('El nombre debe tener entre 1 y 100 caracteres'),
    body('description')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('La descripción no puede exceder 500 caracteres'),
    body('keywords')
        .optional()
        .isArray({ min: 1 })
        .withMessage('Debe proporcionar al menos una palabra clave')
        .custom((keywords) => {
            if (keywords && !keywords.every(k => typeof k === 'string' && k.trim().length > 0)) {
                throw new Error('Todas las palabras clave deben ser strings no vacíos')
            }
            return true
        }),
    body('response_type')
        .optional()
        .isIn(['text', 'media', 'template'])
        .withMessage('Tipo de respuesta inválido'),
    body('response_content')
        .optional()
        .trim()
        .isLength({ min: 1, max: 4000 })
        .withMessage('El contenido de respuesta debe tener entre 1 y 4000 caracteres'),
    body('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active debe ser un booleano'),
    body('priority')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('La prioridad debe ser un número entre 1 y 100')
]

/**
 * GET /api/flows
 * Obtener todos los flows del tenant
 */
router.get('/', 
    requirePermission('flows', 'read'),
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
                .from('flows')
                .select(`
                    id,
                    name,
                    description,
                    keywords,
                    response_type,
                    response_content,
                    is_active,
                    priority,
                    chatbot_id,
                    created_at,
                    updated_at,
                    chatbots!inner(
                        id,
                        name
                    )
                `)
                .eq('tenant_id', req.tenant.id)
                .order('priority', { ascending: false })
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1)

            // Filtros opcionales
            if (chatbot_id) {
                query = query.eq('chatbot_id', chatbot_id)
            }
            if (is_active !== undefined) {
                query = query.eq('is_active', is_active)
            }

            const { data: flows, error, count } = await query

            if (error) {
                console.error('Error obteniendo flows:', error)
                return res.status(500).json({
                    error: 'Error obteniendo flows',
                    message: error.message
                })
            }

            // Obtener total de registros para paginación
            const { count: totalCount } = await supabase
                .from('flows')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', req.tenant.id)

            res.json({
                flows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: totalCount,
                    pages: Math.ceil(totalCount / limit)
                }
            })

        } catch (error) {
            console.error('Error en GET /api/flows:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * GET /api/flows/:id
 * Obtener un flow específico
 */
router.get('/:id',
    requirePermission('flows', 'read'),
    requireResourceAccess('flow', 'read'),
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

            const { data: flow, error } = await supabase
                .from('flows')
                .select(`
                    id,
                    name,
                    description,
                    keywords,
                    response_type,
                    response_content,
                    is_active,
                    priority,
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
                        error: 'Flow no encontrado',
                        message: 'El flow solicitado no existe o no tienes acceso'
                    })
                }
                console.error('Error obteniendo flow:', error)
                return res.status(500).json({
                    error: 'Error obteniendo flow',
                    message: error.message
                })
            }

            res.json({ flow })

        } catch (error) {
            console.error('Error en GET /api/flows/:id:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * POST /api/flows
 * Crear un nuevo flow
 */
router.post('/',
    requirePermission('flows', 'create'),
    validateFlow,
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
                description,
                keywords,
                response_type,
                response_content,
                chatbot_id,
                is_active = true,
                priority = 50
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
            const { data: flowCount } = await supabase
                .from('flows')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', req.tenant.id)

            const planLimits = AppConfig.plans[req.tenant.plan] || AppConfig.plans.free
            if (flowCount >= planLimits.maxFlows) {
                return res.status(403).json({
                    error: 'Límite de flows alcanzado',
                    message: `Tu plan ${req.tenant.plan} permite máximo ${planLimits.maxFlows} flows`,
                    current: flowCount,
                    limit: planLimits.maxFlows
                })
            }

            // Verificar keywords duplicadas en el mismo chatbot
            const { data: existingFlows } = await supabase
                .from('flows')
                .select('keywords')
                .eq('chatbot_id', chatbot_id)
                .eq('is_active', true)

            const existingKeywords = existingFlows?.flatMap(f => f.keywords) || []
            const duplicateKeywords = keywords.filter(k => 
                existingKeywords.some(ek => ek.toLowerCase() === k.toLowerCase())
            )

            if (duplicateKeywords.length > 0) {
                return res.status(400).json({
                    error: 'Keywords duplicadas',
                    message: 'Las siguientes keywords ya existen en este chatbot',
                    duplicates: duplicateKeywords
                })
            }

            // Crear el flow
            const flowData = {
                id: uuidv4(),
                tenant_id: req.tenant.id,
                chatbot_id,
                name: name.trim(),
                description: description?.trim() || null,
                keywords: keywords.map(k => k.trim().toLowerCase()),
                response_type,
                response_content: response_content.trim(),
                is_active,
                priority,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }

            const { data: flow, error } = await supabase
                .from('flows')
                .insert(flowData)
                .select(`
                    id,
                    name,
                    description,
                    keywords,
                    response_type,
                    response_content,
                    is_active,
                    priority,
                    chatbot_id,
                    created_at,
                    updated_at
                `)
                .single()

            if (error) {
                console.error('Error creando flow:', error)
                return res.status(500).json({
                    error: 'Error creando flow',
                    message: error.message
                })
            }

            res.status(201).json({
                message: 'Flow creado exitosamente',
                flow
            })

        } catch (error) {
            console.error('Error en POST /api/flows:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * PUT /api/flows/:id
 * Actualizar un flow existente
 */
router.put('/:id',
    requirePermission('flows', 'update'),
    requireResourceAccess('flow', 'update'),
    [
        param('id')
            .isUUID()
            .withMessage('ID debe ser un UUID válido'),
        ...validateFlowUpdate
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

            // Verificar que el flow existe y pertenece al tenant
            const { data: existingFlow, error: fetchError } = await supabase
                .from('flows')
                .select('id, chatbot_id, keywords')
                .eq('id', id)
                .eq('tenant_id', req.tenant.id)
                .single()

            if (fetchError || !existingFlow) {
                return res.status(404).json({
                    error: 'Flow no encontrado',
                    message: 'El flow solicitado no existe o no tienes acceso'
                })
            }

            // Si se actualizan keywords, verificar duplicados
            if (updateData.keywords) {
                const { data: otherFlows } = await supabase
                    .from('flows')
                    .select('keywords')
                    .eq('chatbot_id', existingFlow.chatbot_id)
                    .eq('is_active', true)
                    .neq('id', id)

                const existingKeywords = otherFlows?.flatMap(f => f.keywords) || []
                const duplicateKeywords = updateData.keywords.filter(k => 
                    existingKeywords.some(ek => ek.toLowerCase() === k.toLowerCase())
                )

                if (duplicateKeywords.length > 0) {
                    return res.status(400).json({
                        error: 'Keywords duplicadas',
                        message: 'Las siguientes keywords ya existen en este chatbot',
                        duplicates: duplicateKeywords
                    })
                }

                updateData.keywords = updateData.keywords.map(k => k.trim().toLowerCase())
            }

            // Limpiar datos de actualización
            if (updateData.name) updateData.name = updateData.name.trim()
            if (updateData.description) updateData.description = updateData.description.trim()
            if (updateData.response_content) updateData.response_content = updateData.response_content.trim()
            updateData.updated_at = new Date().toISOString()

            // Actualizar el flow
            const { data: flow, error } = await supabase
                .from('flows')
                .update(updateData)
                .eq('id', id)
                .eq('tenant_id', req.tenant.id)
                .select(`
                    id,
                    name,
                    description,
                    keywords,
                    response_type,
                    response_content,
                    is_active,
                    priority,
                    chatbot_id,
                    created_at,
                    updated_at
                `)
                .single()

            if (error) {
                console.error('Error actualizando flow:', error)
                return res.status(500).json({
                    error: 'Error actualizando flow',
                    message: error.message
                })
            }

            res.json({
                message: 'Flow actualizado exitosamente',
                flow
            })

        } catch (error) {
            console.error('Error en PUT /api/flows/:id:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * DELETE /api/flows/:id
 * Eliminar un flow
 */
router.delete('/:id',
    requirePermission('flows', 'delete'),
    requireResourceAccess('flow', 'delete'),
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

            // Verificar que el flow existe y pertenece al tenant
            const { data: existingFlow, error: fetchError } = await supabase
                .from('flows')
                .select('id, name')
                .eq('id', id)
                .eq('tenant_id', req.tenant.id)
                .single()

            if (fetchError || !existingFlow) {
                return res.status(404).json({
                    error: 'Flow no encontrado',
                    message: 'El flow solicitado no existe o no tienes acceso'
                })
            }

            // Eliminar el flow
            const { error } = await supabase
                .from('flows')
                .delete()
                .eq('id', id)
                .eq('tenant_id', req.tenant.id)

            if (error) {
                console.error('Error eliminando flow:', error)
                return res.status(500).json({
                    error: 'Error eliminando flow',
                    message: error.message
                })
            }

            res.json({
                message: 'Flow eliminado exitosamente',
                deletedFlow: {
                    id: existingFlow.id,
                    name: existingFlow.name
                }
            })

        } catch (error) {
            console.error('Error en DELETE /api/flows/:id:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * POST /api/flows/:id/toggle
 * Activar/desactivar un flow
 */
router.post('/:id/toggle',
    requirePermission('flows', 'update'),
    requireResourceAccess('flow', 'update'),
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
            const { data: flow, error: fetchError } = await supabase
                .from('flows')
                .select('id, name, is_active')
                .eq('id', id)
                .eq('tenant_id', req.tenant.id)
                .single()

            if (fetchError || !flow) {
                return res.status(404).json({
                    error: 'Flow no encontrado',
                    message: 'El flow solicitado no existe o no tienes acceso'
                })
            }

            // Cambiar estado
            const newState = !flow.is_active
            const { data: updatedFlow, error } = await supabase
                .from('flows')
                .update({ 
                    is_active: newState,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .eq('tenant_id', req.tenant.id)
                .select('id, name, is_active')
                .single()

            if (error) {
                console.error('Error cambiando estado del flow:', error)
                return res.status(500).json({
                    error: 'Error cambiando estado del flow',
                    message: error.message
                })
            }

            res.json({
                message: `Flow ${newState ? 'activado' : 'desactivado'} exitosamente`,
                flow: updatedFlow
            })

        } catch (error) {
            console.error('Error en POST /api/flows/:id/toggle:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * GET /api/flows/search
 * Buscar flows por keyword
 */
router.get('/search',
    requirePermission('flows', 'read'),
    [
        query('q')
            .trim()
            .isLength({ min: 1 })
            .withMessage('Query de búsqueda requerido'),
        query('chatbot_id')
            .optional()
            .isUUID()
            .withMessage('chatbot_id debe ser un UUID válido')
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
            const { q, chatbot_id } = req.query
            const searchTerm = q.toLowerCase().trim()

            let query = supabase
                .from('flows')
                .select(`
                    id,
                    name,
                    description,
                    keywords,
                    response_type,
                    is_active,
                    priority,
                    chatbot_id,
                    chatbots!inner(
                        id,
                        name
                    )
                `)
                .eq('tenant_id', req.tenant.id)
                .eq('is_active', true)

            if (chatbot_id) {
                query = query.eq('chatbot_id', chatbot_id)
            }

            const { data: flows, error } = await query

            if (error) {
                console.error('Error buscando flows:', error)
                return res.status(500).json({
                    error: 'Error buscando flows',
                    message: error.message
                })
            }

            // Filtrar flows que contengan la keyword
            const matchingFlows = flows.filter(flow => {
                return flow.keywords.some(keyword => 
                    keyword.toLowerCase().includes(searchTerm)
                ) || 
                flow.name.toLowerCase().includes(searchTerm) ||
                (flow.description && flow.description.toLowerCase().includes(searchTerm))
            })

            // Ordenar por relevancia (coincidencia exacta primero)
            const sortedFlows = matchingFlows.sort((a, b) => {
                const aExactMatch = a.keywords.some(k => k.toLowerCase() === searchTerm)
                const bExactMatch = b.keywords.some(k => k.toLowerCase() === searchTerm)
                
                if (aExactMatch && !bExactMatch) return -1
                if (!aExactMatch && bExactMatch) return 1
                
                return b.priority - a.priority
            })

            res.json({
                flows: sortedFlows,
                total: sortedFlows.length,
                query: searchTerm
            })

        } catch (error) {
            console.error('Error en GET /api/flows/search:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

export default router