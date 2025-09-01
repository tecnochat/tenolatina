import { Router } from 'express'
import { supabase } from '../../config/supabase.js'
import { tenantIsolationMiddleware } from '../../middleware/tenant-isolation-v2.js'
import { requirePermission, requireResourceAccess } from '../../middleware/rbac.js'
import { logger } from '../../utils/logger.js'
import { AppConfig } from '../../config/app.js'

const router = Router()

// Aplicar middleware de tenant isolation a todas las rutas
router.use(tenantIsolationMiddleware)

/**
 * GET /api/chatbots/:id/config
 * Obtener configuración completa de un chatbot
 */
router.get('/:id/config', 
    requirePermission('CHATBOTS_READ'),
    requireResourceAccess('chatbot', 'read'),
    async (req, res) => {
        try {
            const { id: chatbotId } = req.params
            const tenantId = req.tenant.id

            // Obtener configuración del chatbot
            const { data: config, error } = await supabase
                .from('chatbot_configs')
                .select(`
                    *,
                    chatbots!inner(
                        id,
                        name,
                        status,
                        tenant_id
                    )
                `)
                .eq('chatbot_id', chatbotId)
                .eq('chatbots.tenant_id', tenantId)
                .single()

            if (error) {
                logger.error('Error obteniendo configuración de chatbot:', error)
                return res.status(500).json({
                    success: false,
                    error: 'Error obteniendo configuración'
                })
            }

            if (!config) {
                return res.status(404).json({
                    success: false,
                    error: 'Configuración no encontrada'
                })
            }

            res.json({
                success: true,
                data: config
            })

        } catch (error) {
            logger.error('Error en GET /chatbots/:id/config:', error)
            res.status(500).json({
                success: false,
                error: 'Error interno del servidor'
            })
        }
    }
)

/**
 * PUT /api/chatbots/:id/config
 * Actualizar configuración de un chatbot
 */
router.put('/:id/config',
    requirePermission('CHATBOTS_UPDATE'),
    requireResourceAccess('chatbot', 'update'),
    async (req, res) => {
        try {
            const { id: chatbotId } = req.params
            const tenantId = req.tenant.id
            const {
                ai_provider,
                ai_model,
                ai_temperature,
                ai_max_tokens,
                ai_system_prompt,
                webhook_url,
                webhook_events,
                auto_response_enabled,
                auto_response_delay,
                business_hours,
                welcome_message_enabled,
                typing_simulation,
                conversation_timeout
            } = req.body

            // Validar que el chatbot pertenece al tenant
            const { data: chatbot, error: chatbotError } = await supabase
                .from('chatbots')
                .select('id, tenant_id')
                .eq('id', chatbotId)
                .eq('tenant_id', tenantId)
                .single()

            if (chatbotError || !chatbot) {
                return res.status(404).json({
                    success: false,
                    error: 'Chatbot no encontrado'
                })
            }

            // Actualizar configuración
            const { data: updatedConfig, error } = await supabase
                .from('chatbot_configs')
                .update({
                    ai_provider,
                    ai_model,
                    ai_temperature,
                    ai_max_tokens,
                    ai_system_prompt,
                    webhook_url,
                    webhook_events,
                    auto_response_enabled,
                    auto_response_delay,
                    business_hours,
                    welcome_message_enabled,
                    typing_simulation,
                    conversation_timeout,
                    updated_at: new Date().toISOString()
                })
                .eq('chatbot_id', chatbotId)
                .select()
                .single()

            if (error) {
                logger.error('Error actualizando configuración de chatbot:', error)
                return res.status(500).json({
                    success: false,
                    error: 'Error actualizando configuración'
                })
            }

            logger.info(`Configuración de chatbot actualizada: ${chatbotId}`, {
                tenantId,
                chatbotId,
                userId: req.tenant.userId
            })

            res.json({
                success: true,
                data: updatedConfig,
                message: 'Configuración actualizada exitosamente'
            })

        } catch (error) {
            logger.error('Error en PUT /chatbots/:id/config:', error)
            res.status(500).json({
                success: false,
                error: 'Error interno del servidor'
            })
        }
    }
)

/**
 * GET /api/chatbots/:id/stats
 * Obtener estadísticas de un chatbot
 */
router.get('/:id/stats',
    requirePermission('ANALYTICS_VIEW'),
    requireResourceAccess('chatbot', 'read'),
    async (req, res) => {
        try {
            const { id: chatbotId } = req.params
            const tenantId = req.tenant.id
            const { period = '7d' } = req.query

            // Calcular fecha de inicio según el período
            const now = new Date()
            let startDate = new Date()
            
            switch (period) {
                case '24h':
                    startDate.setHours(now.getHours() - 24)
                    break
                case '7d':
                    startDate.setDate(now.getDate() - 7)
                    break
                case '30d':
                    startDate.setDate(now.getDate() - 30)
                    break
                case '90d':
                    startDate.setDate(now.getDate() - 90)
                    break
                default:
                    startDate.setDate(now.getDate() - 7)
            }

            // Validar que el chatbot pertenece al tenant
            const { data: chatbot, error: chatbotError } = await supabase
                .from('chatbots')
                .select('id, name, tenant_id')
                .eq('id', chatbotId)
                .eq('tenant_id', tenantId)
                .single()

            if (chatbotError || !chatbot) {
                return res.status(404).json({
                    success: false,
                    error: 'Chatbot no encontrado'
                })
            }

            // Obtener estadísticas de conversaciones
            const { data: conversationStats, error: convError } = await supabase
                .from('conversations')
                .select('id, status, created_at')
                .eq('chatbot_id', chatbotId)
                .gte('created_at', startDate.toISOString())

            if (convError) {
                logger.error('Error obteniendo estadísticas de conversaciones:', convError)
            }

            // Obtener estadísticas de mensajes
            const { data: messageStats, error: msgError } = await supabase
                .from('messages')
                .select('id, type, created_at')
                .eq('chatbot_id', chatbotId)
                .gte('created_at', startDate.toISOString())

            if (msgError) {
                logger.error('Error obteniendo estadísticas de mensajes:', msgError)
            }

            // Procesar estadísticas
            const totalConversations = conversationStats?.length || 0
            const activeConversations = conversationStats?.filter(c => c.status === 'active').length || 0
            const totalMessages = messageStats?.length || 0
            const incomingMessages = messageStats?.filter(m => m.type === 'incoming').length || 0
            const outgoingMessages = messageStats?.filter(m => m.type === 'outgoing').length || 0

            // Calcular mensajes por día
            const messagesByDay = {}
            messageStats?.forEach(msg => {
                const date = new Date(msg.created_at).toISOString().split('T')[0]
                messagesByDay[date] = (messagesByDay[date] || 0) + 1
            })

            const stats = {
                chatbot: {
                    id: chatbot.id,
                    name: chatbot.name
                },
                period,
                summary: {
                    total_conversations: totalConversations,
                    active_conversations: activeConversations,
                    total_messages: totalMessages,
                    incoming_messages: incomingMessages,
                    outgoing_messages: outgoingMessages,
                    response_rate: incomingMessages > 0 ? ((outgoingMessages / incomingMessages) * 100).toFixed(2) : 0
                },
                timeline: {
                    messages_by_day: messagesByDay
                }
            }

            res.json({
                success: true,
                data: stats
            })

        } catch (error) {
            logger.error('Error en GET /chatbots/:id/stats:', error)
            res.status(500).json({
                success: false,
                error: 'Error interno del servidor'
            })
        }
    }
)

/**
 * POST /api/chatbots/:id/test-webhook
 * Probar webhook de un chatbot
 */
router.post('/:id/test-webhook',
    requirePermission('CHATBOTS_UPDATE'),
    requireResourceAccess('chatbot', 'update'),
    async (req, res) => {
        try {
            const { id: chatbotId } = req.params
            const tenantId = req.tenant.id

            // Obtener configuración del webhook
            const { data: config, error } = await supabase
                .from('chatbot_configs')
                .select(`
                    webhook_url,
                    webhook_events,
                    chatbots!inner(
                        id,
                        name,
                        tenant_id
                    )
                `)
                .eq('chatbot_id', chatbotId)
                .eq('chatbots.tenant_id', tenantId)
                .single()

            if (error || !config) {
                return res.status(404).json({
                    success: false,
                    error: 'Configuración de webhook no encontrada'
                })
            }

            if (!config.webhook_url) {
                return res.status(400).json({
                    success: false,
                    error: 'URL de webhook no configurada'
                })
            }

            // Crear payload de prueba
            const testPayload = {
                event: 'webhook_test',
                chatbot_id: chatbotId,
                chatbot_name: config.chatbots.name,
                tenant_id: tenantId,
                timestamp: new Date().toISOString(),
                data: {
                    message: 'Este es un mensaje de prueba del webhook',
                    test: true
                }
            }

            // Enviar webhook de prueba
            try {
                const response = await fetch(config.webhook_url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': `TecnoBot-Webhook/1.0`
                    },
                    body: JSON.stringify(testPayload),
                    timeout: 10000
                })

                const responseText = await response.text()

                logger.info(`Webhook de prueba enviado: ${chatbotId}`, {
                    tenantId,
                    chatbotId,
                    webhookUrl: config.webhook_url,
                    status: response.status,
                    response: responseText
                })

                res.json({
                    success: true,
                    data: {
                        webhook_url: config.webhook_url,
                        status_code: response.status,
                        response_body: responseText,
                        test_payload: testPayload
                    },
                    message: 'Webhook de prueba enviado exitosamente'
                })

            } catch (webhookError) {
                logger.error('Error enviando webhook de prueba:', webhookError)
                res.status(400).json({
                    success: false,
                    error: 'Error enviando webhook de prueba',
                    details: webhookError.message
                })
            }

        } catch (error) {
            logger.error('Error en POST /chatbots/:id/test-webhook:', error)
            res.status(500).json({
                success: false,
                error: 'Error interno del servidor'
            })
        }
    }
)

export default router