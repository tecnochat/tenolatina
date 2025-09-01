import { Router } from 'express'
import { param, query, validationResult } from 'express-validator'
import { requirePermission } from '../middleware/rbac.js'
import { createSupabaseClient } from '../config/supabase.js'
import { AppConfig } from '../config/app-config.js'

const router = Router()

/**
 * Función auxiliar para calcular fechas según período
 */
const calculateDateRange = (period) => {
    const now = new Date()
    let startDate, endDate = now
    
    switch (period) {
        case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
            break
        case 'yesterday':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
            break
        case 'week':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            break
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1)
            break
        case 'quarter':
            const quarter = Math.floor(now.getMonth() / 3)
            startDate = new Date(now.getFullYear(), quarter * 3, 1)
            break
        case 'year':
            startDate = new Date(now.getFullYear(), 0, 1)
            break
        default:
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    }
    
    return { startDate, endDate }
}

/**
 * GET /api/analytics/overview
 * Obtener resumen general de analytics del tenant
 */
router.get('/overview',
    requirePermission('analytics', 'read'),
    [
        query('period')
            .optional()
            .isIn(['today', 'yesterday', 'week', 'month', 'quarter', 'year'])
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
            const { period = 'today' } = req.query
            const { startDate, endDate } = calculateDateRange(period)

            // Obtener estadísticas básicas
            const [chatbotsResult, conversationsResult, messagesResult] = await Promise.all([
                // Total de chatbots
                supabase
                    .from('chatbots')
                    .select('id, is_active', { count: 'exact' })
                    .eq('tenant_id', req.tenant.id),
                
                // Conversaciones en el período (simulado)
                supabase
                    .from('conversations')
                    .select('id, created_at', { count: 'exact' })
                    .eq('tenant_id', req.tenant.id)
                    .gte('created_at', startDate.toISOString())
                    .lt('created_at', endDate.toISOString()),
                
                // Mensajes en el período (simulado)
                supabase
                    .from('messages')
                    .select('id, created_at', { count: 'exact' })
                    .eq('tenant_id', req.tenant.id)
                    .gte('created_at', startDate.toISOString())
                    .lt('created_at', endDate.toISOString())
            ])

            const totalChatbots = chatbotsResult.count || 0
            const activeChatbots = chatbotsResult.data?.filter(c => c.is_active).length || 0
            const totalConversations = conversationsResult.count || Math.floor(Math.random() * 100)
            const totalMessages = messagesResult.count || Math.floor(Math.random() * 500)

            // Calcular métricas derivadas
            const avgMessagesPerConversation = totalConversations > 0 ? 
                (totalMessages / totalConversations).toFixed(2) : 0
            
            // Simular datos adicionales (en producción vendrían de tablas reales)
            const responseTime = (Math.random() * 2000 + 500).toFixed(0) // ms
            const satisfactionRate = (0.85 + Math.random() * 0.1).toFixed(2)
            const aiUsageRate = (0.6 + Math.random() * 0.3).toFixed(2)

            res.json({
                period,
                date_range: {
                    start: startDate.toISOString(),
                    end: endDate.toISOString()
                },
                overview: {
                    chatbots: {
                        total: totalChatbots,
                        active: activeChatbots,
                        inactive: totalChatbots - activeChatbots
                    },
                    conversations: {
                        total: totalConversations,
                        avg_messages: parseFloat(avgMessagesPerConversation)
                    },
                    messages: {
                        total: totalMessages,
                        avg_per_day: Math.floor(totalMessages / Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))))
                    },
                    performance: {
                        avg_response_time_ms: parseInt(responseTime),
                        satisfaction_rate: parseFloat(satisfactionRate),
                        ai_usage_rate: parseFloat(aiUsageRate)
                    }
                }
            })

        } catch (error) {
            console.error('Error en GET /api/analytics/overview:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * GET /api/analytics/chatbot/:chatbotId
 * Obtener analytics específicos de un chatbot
 */
router.get('/chatbot/:chatbotId',
    requirePermission('analytics', 'read'),
    [
        param('chatbotId')
            .isUUID()
            .withMessage('chatbotId debe ser un UUID válido'),
        query('period')
            .optional()
            .isIn(['today', 'yesterday', 'week', 'month', 'quarter', 'year'])
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
            const { startDate, endDate } = calculateDateRange(period)

            // Verificar que el chatbot pertenece al tenant
            const { data: chatbot, error: chatbotError } = await supabase
                .from('chatbots')
                .select('id, name, is_active, created_at')
                .eq('id', chatbotId)
                .eq('tenant_id', req.tenant.id)
                .single()

            if (chatbotError || !chatbot) {
                return res.status(404).json({
                    error: 'Chatbot no encontrado',
                    message: 'El chatbot especificado no existe o no tienes acceso'
                })
            }

            // Simular datos de analytics específicos del chatbot
            const analytics = {
                chatbot: {
                    id: chatbot.id,
                    name: chatbot.name,
                    is_active: chatbot.is_active,
                    created_at: chatbot.created_at
                },
                period,
                date_range: {
                    start: startDate.toISOString(),
                    end: endDate.toISOString()
                },
                metrics: {
                    conversations: {
                        total: Math.floor(Math.random() * 50),
                        new_users: Math.floor(Math.random() * 30),
                        returning_users: Math.floor(Math.random() * 20)
                    },
                    messages: {
                        total: Math.floor(Math.random() * 200),
                        incoming: Math.floor(Math.random() * 120),
                        outgoing: Math.floor(Math.random() * 80),
                        avg_per_conversation: (Math.random() * 5 + 2).toFixed(1)
                    },
                    flows: {
                        triggered: Math.floor(Math.random() * 40),
                        completed: Math.floor(Math.random() * 35),
                        completion_rate: (0.7 + Math.random() * 0.25).toFixed(2)
                    },
                    ai: {
                        requests: Math.floor(Math.random() * 60),
                        successful: Math.floor(Math.random() * 55),
                        failed: Math.floor(Math.random() * 5),
                        avg_response_time_ms: Math.floor(Math.random() * 1500 + 500),
                        tokens_used: Math.floor(Math.random() * 5000)
                    },
                    performance: {
                        uptime_percentage: (0.95 + Math.random() * 0.05).toFixed(3),
                        avg_response_time_ms: Math.floor(Math.random() * 2000 + 300),
                        error_rate: (Math.random() * 0.05).toFixed(3)
                    }
                },
                top_keywords: [
                    { keyword: 'hola', count: Math.floor(Math.random() * 20) },
                    { keyword: 'ayuda', count: Math.floor(Math.random() * 15) },
                    { keyword: 'precio', count: Math.floor(Math.random() * 12) },
                    { keyword: 'información', count: Math.floor(Math.random() * 10) },
                    { keyword: 'contacto', count: Math.floor(Math.random() * 8) }
                ],
                hourly_distribution: Array.from({ length: 24 }, (_, hour) => ({
                    hour,
                    messages: Math.floor(Math.random() * 20)
                }))
            }

            res.json(analytics)

        } catch (error) {
            console.error('Error en GET /api/analytics/chatbot/:chatbotId:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * GET /api/analytics/conversations
 * Obtener analytics de conversaciones
 */
router.get('/conversations',
    requirePermission('analytics', 'read'),
    [
        query('period')
            .optional()
            .isIn(['today', 'yesterday', 'week', 'month', 'quarter', 'year'])
            .withMessage('Período inválido'),
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
            const { period = 'today', chatbot_id } = req.query
            const { startDate, endDate } = calculateDateRange(period)

            // Si se especifica chatbot_id, verificar que pertenece al tenant
            if (chatbot_id) {
                const { data: chatbot, error: chatbotError } = await supabase
                    .from('chatbots')
                    .select('id')
                    .eq('id', chatbot_id)
                    .eq('tenant_id', req.tenant.id)
                    .single()

                if (chatbotError || !chatbot) {
                    return res.status(404).json({
                        error: 'Chatbot no encontrado',
                        message: 'El chatbot especificado no existe o no tienes acceso'
                    })
                }
            }

            // Simular datos de conversaciones
            const conversationAnalytics = {
                period,
                date_range: {
                    start: startDate.toISOString(),
                    end: endDate.toISOString()
                },
                chatbot_filter: chatbot_id || null,
                summary: {
                    total_conversations: Math.floor(Math.random() * 100),
                    active_conversations: Math.floor(Math.random() * 20),
                    completed_conversations: Math.floor(Math.random() * 70),
                    abandoned_conversations: Math.floor(Math.random() * 10),
                    avg_duration_minutes: (Math.random() * 30 + 5).toFixed(1),
                    avg_messages_per_conversation: (Math.random() * 8 + 3).toFixed(1)
                },
                by_status: {
                    active: Math.floor(Math.random() * 20),
                    completed: Math.floor(Math.random() * 70),
                    abandoned: Math.floor(Math.random() * 10)
                },
                by_source: {
                    whatsapp: Math.floor(Math.random() * 90),
                    web: Math.floor(Math.random() * 10),
                    api: Math.floor(Math.random() * 5)
                },
                daily_breakdown: Array.from({ length: 7 }, (_, i) => {
                    const date = new Date(endDate.getTime() - i * 24 * 60 * 60 * 1000)
                    return {
                        date: date.toISOString().split('T')[0],
                        conversations: Math.floor(Math.random() * 20),
                        messages: Math.floor(Math.random() * 100)
                    }
                }).reverse(),
                top_chatbots: [
                    { name: 'Chatbot Principal', conversations: Math.floor(Math.random() * 50) },
                    { name: 'Soporte Técnico', conversations: Math.floor(Math.random() * 30) },
                    { name: 'Ventas', conversations: Math.floor(Math.random() * 20) }
                ]
            }

            res.json(conversationAnalytics)

        } catch (error) {
            console.error('Error en GET /api/analytics/conversations:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * GET /api/analytics/flows
 * Obtener analytics de flows
 */
router.get('/flows',
    requirePermission('analytics', 'read'),
    [
        query('period')
            .optional()
            .isIn(['today', 'yesterday', 'week', 'month', 'quarter', 'year'])
            .withMessage('Período inválido'),
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
            const { period = 'today', chatbot_id } = req.query
            const { startDate, endDate } = calculateDateRange(period)

            // Obtener flows del tenant
            let flowsQuery = supabase
                .from('flows')
                .select('id, name, keywords, chatbot_id, chatbots!inner(name)')
                .eq('tenant_id', req.tenant.id)
                .eq('is_active', true)

            if (chatbot_id) {
                flowsQuery = flowsQuery.eq('chatbot_id', chatbot_id)
            }

            const { data: flows, error: flowsError } = await flowsQuery

            if (flowsError) {
                console.error('Error obteniendo flows:', flowsError)
                return res.status(500).json({
                    error: 'Error obteniendo flows',
                    message: flowsError.message
                })
            }

            // Simular estadísticas de flows
            const flowAnalytics = flows.map(flow => ({
                id: flow.id,
                name: flow.name,
                chatbot_name: flow.chatbots.name,
                keywords: flow.keywords,
                metrics: {
                    triggers: Math.floor(Math.random() * 50),
                    completions: Math.floor(Math.random() * 40),
                    completion_rate: (0.6 + Math.random() * 0.35).toFixed(2),
                    avg_response_time_ms: Math.floor(Math.random() * 1000 + 200)
                }
            }))

            const summary = {
                period,
                date_range: {
                    start: startDate.toISOString(),
                    end: endDate.toISOString()
                },
                chatbot_filter: chatbot_id || null,
                total_flows: flows.length,
                total_triggers: flowAnalytics.reduce((sum, f) => sum + f.metrics.triggers, 0),
                total_completions: flowAnalytics.reduce((sum, f) => sum + f.metrics.completions, 0),
                avg_completion_rate: flowAnalytics.length > 0 ? 
                    (flowAnalytics.reduce((sum, f) => sum + parseFloat(f.metrics.completion_rate), 0) / flowAnalytics.length).toFixed(2) : 0,
                flows: flowAnalytics.sort((a, b) => b.metrics.triggers - a.metrics.triggers)
            }

            res.json(summary)

        } catch (error) {
            console.error('Error en GET /api/analytics/flows:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * GET /api/analytics/export
 * Exportar datos de analytics
 */
router.get('/export',
    requirePermission('analytics', 'read'),
    [
        query('type')
            .isIn(['overview', 'conversations', 'flows', 'messages'])
            .withMessage('Tipo de export inválido'),
        query('format')
            .optional()
            .isIn(['json', 'csv'])
            .withMessage('Formato inválido'),
        query('period')
            .optional()
            .isIn(['today', 'yesterday', 'week', 'month', 'quarter', 'year'])
            .withMessage('Período inválido'),
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

            const { type, format = 'json', period = 'today', chatbot_id } = req.query
            const { startDate, endDate } = calculateDateRange(period)

            // Verificar límites del plan
            const planLimits = AppConfig.plans[req.tenant.plan] || AppConfig.plans.free
            if (!planLimits.analyticsExport) {
                return res.status(403).json({
                    error: 'Export no disponible',
                    message: 'Tu plan no incluye exportación de analytics'
                })
            }

            // Simular datos de export
            const exportData = {
                export_info: {
                    type,
                    format,
                    period,
                    date_range: {
                        start: startDate.toISOString(),
                        end: endDate.toISOString()
                    },
                    generated_at: new Date().toISOString(),
                    tenant_id: req.tenant.id
                },
                data: {
                    summary: {
                        total_records: Math.floor(Math.random() * 1000),
                        period_covered: period
                    },
                    records: Array.from({ length: 10 }, (_, i) => ({
                        id: i + 1,
                        timestamp: new Date(Date.now() - i * 60000).toISOString(),
                        value: Math.floor(Math.random() * 100),
                        type: type
                    }))
                }
            }

            if (format === 'csv') {
                // Convertir a CSV (simplificado)
                const csvHeaders = Object.keys(exportData.data.records[0] || {}).join(',')
                const csvRows = exportData.data.records.map(record => 
                    Object.values(record).join(',')
                ).join('\n')
                const csvContent = `${csvHeaders}\n${csvRows}`

                res.setHeader('Content-Type', 'text/csv')
                res.setHeader('Content-Disposition', `attachment; filename="analytics-${type}-${period}.csv"`)
                res.send(csvContent)
            } else {
                res.setHeader('Content-Type', 'application/json')
                res.setHeader('Content-Disposition', `attachment; filename="analytics-${type}-${period}.json"`)
                res.json(exportData)
            }

        } catch (error) {
            console.error('Error en GET /api/analytics/export:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * GET /api/analytics/realtime
 * Obtener métricas en tiempo real
 */
router.get('/realtime',
    requirePermission('analytics', 'read'),
    async (req, res) => {
        try {
            const supabase = createSupabaseClient(req.tenant.id)

            // Verificar límites del plan
            const planLimits = AppConfig.plans[req.tenant.plan] || AppConfig.plans.free
            if (!planLimits.realtimeAnalytics) {
                return res.status(403).json({
                    error: 'Analytics en tiempo real no disponible',
                    message: 'Tu plan no incluye analytics en tiempo real'
                })
            }

            // Obtener datos básicos
            const { data: chatbots } = await supabase
                .from('chatbots')
                .select('id, name, is_active')
                .eq('tenant_id', req.tenant.id)

            // Simular métricas en tiempo real
            const realtimeMetrics = {
                timestamp: new Date().toISOString(),
                active_chatbots: chatbots?.filter(c => c.is_active).length || 0,
                current_conversations: Math.floor(Math.random() * 10),
                messages_last_hour: Math.floor(Math.random() * 50),
                avg_response_time_ms: Math.floor(Math.random() * 2000 + 500),
                system_status: 'healthy',
                chatbot_status: chatbots?.map(bot => ({
                    id: bot.id,
                    name: bot.name,
                    is_active: bot.is_active,
                    current_conversations: Math.floor(Math.random() * 3),
                    last_message_at: new Date(Date.now() - Math.random() * 3600000).toISOString(),
                    status: bot.is_active ? 'online' : 'offline'
                })) || [],
                recent_activity: Array.from({ length: 5 }, (_, i) => ({
                    id: i + 1,
                    type: ['message', 'conversation_start', 'flow_trigger'][Math.floor(Math.random() * 3)],
                    chatbot_name: chatbots?.[Math.floor(Math.random() * (chatbots.length || 1))]?.name || 'Chatbot',
                    timestamp: new Date(Date.now() - i * 60000).toISOString(),
                    details: 'Actividad simulada'
                }))
            }

            res.json(realtimeMetrics)

        } catch (error) {
            console.error('Error en GET /api/analytics/realtime:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

export default router