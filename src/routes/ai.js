import { Router } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import { requirePermission, requireResourceAccess } from '../middleware/rbac.js'
import { createSupabaseClient } from '../config/supabase.js'
import { AppConfig } from '../config/app-config.js'
import OpenAI from 'openai'

const router = Router()

/**
 * Validaciones comunes
 */
const validateAIConfig = [
    body('model')
        .isIn(['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini'])
        .withMessage('Modelo de IA inválido'),
    body('system_prompt')
        .trim()
        .isLength({ min: 10, max: 4000 })
        .withMessage('El prompt del sistema debe tener entre 10 y 4000 caracteres'),
    body('temperature')
        .isFloat({ min: 0, max: 2 })
        .withMessage('La temperatura debe ser un número entre 0 y 2'),
    body('max_tokens')
        .isInt({ min: 50, max: 4000 })
        .withMessage('max_tokens debe ser un número entre 50 y 4000'),
    body('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active debe ser un booleano'),
    body('fallback_message')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('El mensaje de fallback no puede exceder 1000 caracteres')
]

const validateAIConfigUpdate = [
    body('model')
        .optional()
        .isIn(['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini'])
        .withMessage('Modelo de IA inválido'),
    body('system_prompt')
        .optional()
        .trim()
        .isLength({ min: 10, max: 4000 })
        .withMessage('El prompt del sistema debe tener entre 10 y 4000 caracteres'),
    body('temperature')
        .optional()
        .isFloat({ min: 0, max: 2 })
        .withMessage('La temperatura debe ser un número entre 0 y 2'),
    body('max_tokens')
        .optional()
        .isInt({ min: 50, max: 4000 })
        .withMessage('max_tokens debe ser un número entre 50 y 4000'),
    body('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active debe ser un booleano'),
    body('fallback_message')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('El mensaje de fallback no puede exceder 1000 caracteres')
]

/**
 * GET /api/ai/config/:chatbotId
 * Obtener configuración de IA para un chatbot
 */
router.get('/config/:chatbotId',
    requirePermission('ai', 'read'),
    [
        param('chatbotId')
            .isUUID()
            .withMessage('chatbotId debe ser un UUID válido')
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

            // Verificar que el chatbot pertenece al tenant
            const { data: chatbot, error: chatbotError } = await supabase
                .from('chatbots')
                .select('id, name, ai_config')
                .eq('id', chatbotId)
                .eq('tenant_id', req.tenant.id)
                .single()

            if (chatbotError || !chatbot) {
                return res.status(404).json({
                    error: 'Chatbot no encontrado',
                    message: 'El chatbot especificado no existe o no tienes acceso'
                })
            }

            // Configuración por defecto si no existe
            const defaultConfig = {
                model: 'gpt-3.5-turbo',
                system_prompt: 'Eres un asistente virtual útil y amigable. Responde de manera clara y concisa.',
                temperature: 0.7,
                max_tokens: 500,
                is_active: true,
                fallback_message: 'Lo siento, no pude procesar tu mensaje en este momento. Por favor, intenta de nuevo.'
            }

            const aiConfig = chatbot.ai_config || defaultConfig

            res.json({
                chatbot: {
                    id: chatbot.id,
                    name: chatbot.name
                },
                ai_config: aiConfig
            })

        } catch (error) {
            console.error('Error en GET /api/ai/config/:chatbotId:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * PUT /api/ai/config/:chatbotId
 * Actualizar configuración de IA para un chatbot
 */
router.put('/config/:chatbotId',
    requirePermission('ai', 'update'),
    [
        param('chatbotId')
            .isUUID()
            .withMessage('chatbotId debe ser un UUID válido'),
        ...validateAIConfig
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
            const {
                model,
                system_prompt,
                temperature,
                max_tokens,
                is_active,
                fallback_message
            } = req.body

            // Verificar que el chatbot pertenece al tenant
            const { data: chatbot, error: chatbotError } = await supabase
                .from('chatbots')
                .select('id, name')
                .eq('id', chatbotId)
                .eq('tenant_id', req.tenant.id)
                .single()

            if (chatbotError || !chatbot) {
                return res.status(404).json({
                    error: 'Chatbot no encontrado',
                    message: 'El chatbot especificado no existe o no tienes acceso'
                })
            }

            // Verificar límites del plan para modelos premium
            const planLimits = AppConfig.plans[req.tenant.plan] || AppConfig.plans.free
            const premiumModels = ['gpt-4', 'gpt-4-turbo', 'gpt-4o']
            
            if (premiumModels.includes(model) && !planLimits.premiumAI) {
                return res.status(403).json({
                    error: 'Modelo no disponible',
                    message: `El modelo ${model} requiere un plan premium`,
                    availableModels: ['gpt-3.5-turbo', 'gpt-4o-mini']
                })
            }

            // Crear configuración de IA
            const aiConfig = {
                model,
                system_prompt: system_prompt.trim(),
                temperature,
                max_tokens,
                is_active: is_active !== undefined ? is_active : true,
                fallback_message: fallback_message?.trim() || 'Lo siento, no pude procesar tu mensaje en este momento. Por favor, intenta de nuevo.',
                updated_at: new Date().toISOString()
            }

            // Actualizar el chatbot con la nueva configuración
            const { data: updatedChatbot, error } = await supabase
                .from('chatbots')
                .update({ 
                    ai_config: aiConfig,
                    updated_at: new Date().toISOString()
                })
                .eq('id', chatbotId)
                .eq('tenant_id', req.tenant.id)
                .select('id, name, ai_config')
                .single()

            if (error) {
                console.error('Error actualizando configuración de IA:', error)
                return res.status(500).json({
                    error: 'Error actualizando configuración de IA',
                    message: error.message
                })
            }

            res.json({
                message: 'Configuración de IA actualizada exitosamente',
                chatbot: {
                    id: updatedChatbot.id,
                    name: updatedChatbot.name
                },
                ai_config: updatedChatbot.ai_config
            })

        } catch (error) {
            console.error('Error en PUT /api/ai/config/:chatbotId:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * POST /api/ai/test/:chatbotId
 * Probar configuración de IA con un mensaje
 */
router.post('/test/:chatbotId',
    requirePermission('ai', 'read'),
    [
        param('chatbotId')
            .isUUID()
            .withMessage('chatbotId debe ser un UUID válido'),
        body('message')
            .trim()
            .isLength({ min: 1, max: 1000 })
            .withMessage('El mensaje debe tener entre 1 y 1000 caracteres')
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
            const { message } = req.body

            // Verificar que el chatbot pertenece al tenant
            const { data: chatbot, error: chatbotError } = await supabase
                .from('chatbots')
                .select('id, name, ai_config')
                .eq('id', chatbotId)
                .eq('tenant_id', req.tenant.id)
                .single()

            if (chatbotError || !chatbot) {
                return res.status(404).json({
                    error: 'Chatbot no encontrado',
                    message: 'El chatbot especificado no existe o no tienes acceso'
                })
            }

            // Verificar que la IA está activa
            if (!chatbot.ai_config?.is_active) {
                return res.status(400).json({
                    error: 'IA desactivada',
                    message: 'La IA está desactivada para este chatbot'
                })
            }

            // Verificar límites del plan
            const planLimits = AppConfig.plans[req.tenant.plan] || AppConfig.plans.free
            
            // Aquí podrías implementar un contador de requests de prueba por día/mes
            // Por ahora, solo verificamos que tenga acceso a IA
            if (!planLimits.aiEnabled) {
                return res.status(403).json({
                    error: 'IA no disponible',
                    message: 'Tu plan no incluye acceso a IA'
                })
            }

            // Configuración de IA
            const aiConfig = chatbot.ai_config
            const openai = new OpenAI({
                apiKey: AppConfig.openai.apiKey
            })

            try {
                const startTime = Date.now()
                
                const completion = await openai.chat.completions.create({
                    model: aiConfig.model,
                    messages: [
                        {
                            role: 'system',
                            content: aiConfig.system_prompt
                        },
                        {
                            role: 'user',
                            content: message
                        }
                    ],
                    temperature: aiConfig.temperature,
                    max_tokens: aiConfig.max_tokens
                })

                const endTime = Date.now()
                const responseTime = endTime - startTime

                const response = completion.choices[0]?.message?.content || aiConfig.fallback_message

                res.json({
                    success: true,
                    test_message: message,
                    ai_response: response,
                    metadata: {
                        model: aiConfig.model,
                        response_time_ms: responseTime,
                        tokens_used: completion.usage?.total_tokens || 0,
                        finish_reason: completion.choices[0]?.finish_reason
                    }
                })

            } catch (aiError) {
                console.error('Error en prueba de IA:', aiError)
                
                let errorMessage = 'Error procesando con IA'
                if (aiError.code === 'insufficient_quota') {
                    errorMessage = 'Cuota de OpenAI agotada'
                } else if (aiError.code === 'model_not_found') {
                    errorMessage = 'Modelo de IA no encontrado'
                } else if (aiError.code === 'rate_limit_exceeded') {
                    errorMessage = 'Límite de rate de OpenAI excedido'
                }

                res.json({
                    success: false,
                    test_message: message,
                    ai_response: aiConfig.fallback_message,
                    error: errorMessage,
                    metadata: {
                        model: aiConfig.model,
                        error_code: aiError.code
                    }
                })
            }

        } catch (error) {
            console.error('Error en POST /api/ai/test/:chatbotId:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * GET /api/ai/models
 * Obtener modelos de IA disponibles según el plan
 */
router.get('/models',
    requirePermission('ai', 'read'),
    async (req, res) => {
        try {
            const planLimits = AppConfig.plans[req.tenant.plan] || AppConfig.plans.free
            
            const allModels = [
                {
                    id: 'gpt-3.5-turbo',
                    name: 'GPT-3.5 Turbo',
                    description: 'Modelo rápido y eficiente para la mayoría de tareas',
                    max_tokens: 4096,
                    cost_per_1k_tokens: 0.002,
                    premium: false
                },
                {
                    id: 'gpt-4o-mini',
                    name: 'GPT-4o Mini',
                    description: 'Versión compacta de GPT-4 con buen rendimiento',
                    max_tokens: 4096,
                    cost_per_1k_tokens: 0.00015,
                    premium: false
                },
                {
                    id: 'gpt-4',
                    name: 'GPT-4',
                    description: 'Modelo más avanzado con mejor comprensión y razonamiento',
                    max_tokens: 8192,
                    cost_per_1k_tokens: 0.03,
                    premium: true
                },
                {
                    id: 'gpt-4-turbo',
                    name: 'GPT-4 Turbo',
                    description: 'GPT-4 optimizado para velocidad y eficiencia',
                    max_tokens: 4096,
                    cost_per_1k_tokens: 0.01,
                    premium: true
                },
                {
                    id: 'gpt-4o',
                    name: 'GPT-4o',
                    description: 'Última versión de GPT-4 con capacidades multimodales',
                    max_tokens: 4096,
                    cost_per_1k_tokens: 0.005,
                    premium: true
                }
            ]

            // Filtrar modelos según el plan
            const availableModels = allModels.filter(model => {
                if (model.premium && !planLimits.premiumAI) {
                    return false
                }
                return true
            })

            res.json({
                models: availableModels,
                plan: req.tenant.plan,
                premium_ai_available: planLimits.premiumAI
            })

        } catch (error) {
            console.error('Error en GET /api/ai/models:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * GET /api/ai/usage/:chatbotId
 * Obtener estadísticas de uso de IA para un chatbot
 */
router.get('/usage/:chatbotId',
    requirePermission('ai', 'read'),
    [
        param('chatbotId')
            .isUUID()
            .withMessage('chatbotId debe ser un UUID válido'),
        query('period')
            .optional()
            .isIn(['today', 'week', 'month'])
            .withMessage('Período inválido')
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
            const { period = 'today' } = req.query

            // Verificar que el chatbot pertenece al tenant
            const { data: chatbot, error: chatbotError } = await supabase
                .from('chatbots')
                .select('id, name')
                .eq('id', chatbotId)
                .eq('tenant_id', req.tenant.id)
                .single()

            if (chatbotError || !chatbot) {
                return res.status(404).json({
                    error: 'Chatbot no encontrado',
                    message: 'El chatbot especificado no existe o no tienes acceso'
                })
            }

            // Calcular fechas según el período
            const now = new Date()
            let startDate
            
            switch (period) {
                case 'today':
                    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                    break
                case 'week':
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                    break
                case 'month':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
                    break
                default:
                    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
            }

            // Obtener estadísticas de uso de IA
            // Nota: Esto requeriría una tabla de logs de IA que no está implementada
            // Por ahora, devolvemos datos simulados
            const mockUsage = {
                period,
                start_date: startDate.toISOString(),
                end_date: now.toISOString(),
                total_requests: Math.floor(Math.random() * 100),
                total_tokens: Math.floor(Math.random() * 10000),
                average_response_time_ms: Math.floor(Math.random() * 2000) + 500,
                success_rate: 0.95 + Math.random() * 0.05,
                most_used_model: 'gpt-3.5-turbo',
                estimated_cost: (Math.random() * 10).toFixed(4)
            }

            res.json({
                chatbot: {
                    id: chatbot.id,
                    name: chatbot.name
                },
                usage: mockUsage,
                note: 'Estadísticas simuladas - implementar logging de IA para datos reales'
            })

        } catch (error) {
            console.error('Error en GET /api/ai/usage/:chatbotId:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * POST /api/ai/config/:chatbotId/reset
 * Resetear configuración de IA a valores por defecto
 */
router.post('/config/:chatbotId/reset',
    requirePermission('ai', 'update'),
    [
        param('chatbotId')
            .isUUID()
            .withMessage('chatbotId debe ser un UUID válido')
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

            // Verificar que el chatbot pertenece al tenant
            const { data: chatbot, error: chatbotError } = await supabase
                .from('chatbots')
                .select('id, name')
                .eq('id', chatbotId)
                .eq('tenant_id', req.tenant.id)
                .single()

            if (chatbotError || !chatbot) {
                return res.status(404).json({
                    error: 'Chatbot no encontrado',
                    message: 'El chatbot especificado no existe o no tienes acceso'
                })
            }

            // Configuración por defecto
            const defaultConfig = {
                model: 'gpt-3.5-turbo',
                system_prompt: 'Eres un asistente virtual útil y amigable. Responde de manera clara y concisa.',
                temperature: 0.7,
                max_tokens: 500,
                is_active: true,
                fallback_message: 'Lo siento, no pude procesar tu mensaje en este momento. Por favor, intenta de nuevo.',
                updated_at: new Date().toISOString()
            }

            // Actualizar el chatbot con la configuración por defecto
            const { data: updatedChatbot, error } = await supabase
                .from('chatbots')
                .update({ 
                    ai_config: defaultConfig,
                    updated_at: new Date().toISOString()
                })
                .eq('id', chatbotId)
                .eq('tenant_id', req.tenant.id)
                .select('id, name, ai_config')
                .single()

            if (error) {
                console.error('Error reseteando configuración de IA:', error)
                return res.status(500).json({
                    error: 'Error reseteando configuración de IA',
                    message: error.message
                })
            }

            res.json({
                message: 'Configuración de IA reseteada exitosamente',
                chatbot: {
                    id: updatedChatbot.id,
                    name: updatedChatbot.name
                },
                ai_config: updatedChatbot.ai_config
            })

        } catch (error) {
            console.error('Error en POST /api/ai/config/:chatbotId/reset:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

export default router