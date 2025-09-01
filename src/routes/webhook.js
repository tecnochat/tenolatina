import { Router } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import { requirePermission } from '../middleware/rbac.js'
import { createSupabaseClient } from '../config/supabase.js'
import { AppConfig } from '../config/app-config.js'
import crypto from 'crypto'
import { WhatsAppService } from '../services/whatsapp-service.js'

const router = Router()

/**
 * Middleware para verificar firma de webhook
 */
const verifyWebhookSignature = (secret) => {
    return (req, res, next) => {
        const signature = req.headers['x-webhook-signature'] || req.headers['x-hub-signature-256']
        
        if (!signature) {
            return res.status(401).json({
                error: 'Firma de webhook faltante',
                message: 'Se requiere firma de webhook para verificar autenticidad'
            })
        }

        const payload = JSON.stringify(req.body)
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex')

        const providedSignature = signature.replace('sha256=', '')

        if (!crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(providedSignature))) {
            return res.status(401).json({
                error: 'Firma de webhook inválida',
                message: 'La firma del webhook no coincide'
            })
        }

        next()
    }
}

/**
 * POST /api/webhook/whatsapp/:tenantId
 * Webhook para recibir mensajes de WhatsApp
 */
router.post('/whatsapp/:tenantId',
    [
        param('tenantId')
            .isUUID()
            .withMessage('tenantId debe ser un UUID válido')
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

            const { tenantId } = req.params
            const webhookData = req.body

            console.log(`Webhook WhatsApp recibido para tenant ${tenantId}:`, JSON.stringify(webhookData, null, 2))

            // Verificar que el tenant existe
            const supabase = createSupabaseClient(tenantId)
            const { data: tenant, error: tenantError } = await supabase
                .from('tenant_profiles')
                .select('id, name, is_active')
                .eq('id', tenantId)
                .single()

            if (tenantError || !tenant || !tenant.is_active) {
                return res.status(404).json({
                    error: 'Tenant no encontrado o inactivo',
                    message: 'El tenant especificado no existe o está inactivo'
                })
            }

            // Procesar diferentes tipos de eventos de WhatsApp
            if (webhookData.entry && Array.isArray(webhookData.entry)) {
                for (const entry of webhookData.entry) {
                    if (entry.changes && Array.isArray(entry.changes)) {
                        for (const change of entry.changes) {
                            await processWhatsAppChange(tenantId, change)
                        }
                    }
                }
            }

            // Responder rápidamente para confirmar recepción
            res.status(200).json({ status: 'received' })

        } catch (error) {
            console.error('Error en webhook WhatsApp:', error)
            res.status(500).json({
                error: 'Error procesando webhook',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error interno'
            })
        }
    }
)

/**
 * GET /api/webhook/whatsapp/:tenantId
 * Verificación de webhook de WhatsApp (Meta)
 */
router.get('/whatsapp/:tenantId',
    [
        param('tenantId')
            .isUUID()
            .withMessage('tenantId debe ser un UUID válido'),
        query('hub.mode')
            .equals('subscribe')
            .withMessage('Modo de hub inválido'),
        query('hub.challenge')
            .notEmpty()
            .withMessage('Challenge requerido'),
        query('hub.verify_token')
            .notEmpty()
            .withMessage('Token de verificación requerido')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Parámetros de verificación inválidos',
                    details: errors.array()
                })
            }

            const { tenantId } = req.params
            const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': verifyToken } = req.query

            // Verificar que el tenant existe
            const supabase = createSupabaseClient(tenantId)
            const { data: tenant, error: tenantError } = await supabase
                .from('tenant_profiles')
                .select('id, webhook_verify_token')
                .eq('id', tenantId)
                .single()

            if (tenantError || !tenant) {
                return res.status(404).json({
                    error: 'Tenant no encontrado'
                })
            }

            // Verificar token
            const expectedToken = tenant.webhook_verify_token || AppConfig.whatsapp.webhookVerifyToken
            if (verifyToken !== expectedToken) {
                return res.status(403).json({
                    error: 'Token de verificación inválido'
                })
            }

            // Responder con el challenge
            res.status(200).send(challenge)

        } catch (error) {
            console.error('Error en verificación de webhook WhatsApp:', error)
            res.status(500).json({
                error: 'Error en verificación',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error interno'
            })
        }
    }
)

/**
 * POST /api/webhook/external/:tenantId
 * Webhook genérico para integraciones externas
 */
router.post('/external/:tenantId',
    [
        param('tenantId')
            .isUUID()
            .withMessage('tenantId debe ser un UUID válido'),
        query('source')
            .optional()
            .isLength({ min: 1, max: 50 })
            .withMessage('Source debe tener entre 1 y 50 caracteres')
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

            const { tenantId } = req.params
            const { source = 'unknown' } = req.query
            const webhookData = req.body

            console.log(`Webhook externo recibido para tenant ${tenantId} desde ${source}:`, JSON.stringify(webhookData, null, 2))

            // Verificar que el tenant existe y tiene webhooks habilitados
            const supabase = createSupabaseClient(tenantId)
            const { data: tenant, error: tenantError } = await supabase
                .from('tenant_profiles')
                .select('id, name, is_active, settings')
                .eq('id', tenantId)
                .single()

            if (tenantError || !tenant || !tenant.is_active) {
                return res.status(404).json({
                    error: 'Tenant no encontrado o inactivo'
                })
            }

            // Verificar si los webhooks están habilitados
            const settings = tenant.settings || {}
            if (!settings.webhooks_enabled) {
                return res.status(403).json({
                    error: 'Webhooks deshabilitados',
                    message: 'Los webhooks están deshabilitados para este tenant'
                })
            }

            // Procesar webhook según el source
            await processExternalWebhook(tenantId, source, webhookData)

            res.status(200).json({ 
                status: 'received',
                processed_at: new Date().toISOString()
            })

        } catch (error) {
            console.error('Error en webhook externo:', error)
            res.status(500).json({
                error: 'Error procesando webhook',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error interno'
            })
        }
    }
)

/**
 * GET /api/webhook/config
 * Obtener configuración de webhooks del tenant
 */
router.get('/config',
    requirePermission('webhooks', 'read'),
    async (req, res) => {
        try {
            const supabase = createSupabaseClient(req.tenant.id)

            // Obtener configuración de webhooks
            const { data: tenant, error } = await supabase
                .from('tenant_profiles')
                .select('id, webhook_verify_token, settings')
                .eq('id', req.tenant.id)
                .single()

            if (error) {
                console.error('Error obteniendo configuración de webhooks:', error)
                return res.status(500).json({
                    error: 'Error obteniendo configuración',
                    message: error.message
                })
            }

            const settings = tenant.settings || {}
            const webhookConfig = {
                tenant_id: tenant.id,
                webhooks_enabled: settings.webhooks_enabled || false,
                verify_token: tenant.webhook_verify_token || null,
                endpoints: {
                    whatsapp: `${AppConfig.server.baseUrl}/api/webhook/whatsapp/${tenant.id}`,
                    external: `${AppConfig.server.baseUrl}/api/webhook/external/${tenant.id}`,
                    verification: `${AppConfig.server.baseUrl}/api/webhook/whatsapp/${tenant.id}`
                },
                supported_sources: [
                    'whatsapp',
                    'telegram',
                    'facebook',
                    'instagram',
                    'custom'
                ],
                security: {
                    signature_verification: settings.webhook_signature_verification || false,
                    ip_whitelist: settings.webhook_ip_whitelist || [],
                    rate_limit: settings.webhook_rate_limit || 100
                }
            }

            res.json(webhookConfig)

        } catch (error) {
            console.error('Error en GET /api/webhook/config:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * PUT /api/webhook/config
 * Actualizar configuración de webhooks
 */
router.put('/config',
    requirePermission('webhooks', 'update'),
    [
        body('webhooks_enabled')
            .optional()
            .isBoolean()
            .withMessage('webhooks_enabled debe ser un booleano'),
        body('verify_token')
            .optional()
            .isLength({ min: 8, max: 100 })
            .withMessage('verify_token debe tener entre 8 y 100 caracteres'),
        body('signature_verification')
            .optional()
            .isBoolean()
            .withMessage('signature_verification debe ser un booleano'),
        body('ip_whitelist')
            .optional()
            .isArray()
            .withMessage('ip_whitelist debe ser un array'),
        body('rate_limit')
            .optional()
            .isInt({ min: 1, max: 1000 })
            .withMessage('rate_limit debe ser entre 1 y 1000')
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
            const {
                webhooks_enabled,
                verify_token,
                signature_verification,
                ip_whitelist,
                rate_limit
            } = req.body

            // Obtener configuración actual
            const { data: currentTenant, error: fetchError } = await supabase
                .from('tenant_profiles')
                .select('settings, webhook_verify_token')
                .eq('id', req.tenant.id)
                .single()

            if (fetchError) {
                console.error('Error obteniendo configuración actual:', fetchError)
                return res.status(500).json({
                    error: 'Error obteniendo configuración actual',
                    message: fetchError.message
                })
            }

            // Preparar datos de actualización
            const currentSettings = currentTenant.settings || {}
            const updateData = {
                updated_at: new Date().toISOString()
            }

            // Actualizar settings
            const newSettings = { ...currentSettings }
            if (webhooks_enabled !== undefined) newSettings.webhooks_enabled = webhooks_enabled
            if (signature_verification !== undefined) newSettings.webhook_signature_verification = signature_verification
            if (ip_whitelist !== undefined) newSettings.webhook_ip_whitelist = ip_whitelist
            if (rate_limit !== undefined) newSettings.webhook_rate_limit = rate_limit

            updateData.settings = newSettings

            // Actualizar verify_token si se proporciona
            if (verify_token !== undefined) {
                updateData.webhook_verify_token = verify_token
            }

            // Actualizar en base de datos
            const { data: updatedTenant, error: updateError } = await supabase
                .from('tenant_profiles')
                .update(updateData)
                .eq('id', req.tenant.id)
                .select('id, webhook_verify_token, settings')
                .single()

            if (updateError) {
                console.error('Error actualizando configuración de webhooks:', updateError)
                return res.status(500).json({
                    error: 'Error actualizando configuración',
                    message: updateError.message
                })
            }

            const updatedSettings = updatedTenant.settings || {}
            const responseConfig = {
                tenant_id: updatedTenant.id,
                webhooks_enabled: updatedSettings.webhooks_enabled || false,
                verify_token: updatedTenant.webhook_verify_token || null,
                security: {
                    signature_verification: updatedSettings.webhook_signature_verification || false,
                    ip_whitelist: updatedSettings.webhook_ip_whitelist || [],
                    rate_limit: updatedSettings.webhook_rate_limit || 100
                },
                updated_at: updateData.updated_at
            }

            res.json({
                message: 'Configuración de webhooks actualizada exitosamente',
                config: responseConfig
            })

        } catch (error) {
            console.error('Error en PUT /api/webhook/config:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * GET /api/webhook/logs
 * Obtener logs de webhooks
 */
router.get('/logs',
    requirePermission('webhooks', 'read'),
    [
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('La página debe ser un número entero mayor a 0'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('El límite debe ser entre 1 y 100'),
        query('source')
            .optional()
            .isLength({ min: 1, max: 50 })
            .withMessage('Source debe tener entre 1 y 50 caracteres'),
        query('status')
            .optional()
            .isIn(['success', 'error', 'pending'])
            .withMessage('Estado inválido')
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

            const { 
                page = 1, 
                limit = 20, 
                source, 
                status 
            } = req.query

            // Simular logs de webhooks (en producción vendría de base de datos)
            const webhookSources = ['whatsapp', 'telegram', 'facebook', 'custom']
            const webhookStatuses = ['success', 'error', 'pending']
            
            const simulatedLogs = Array.from({ length: Math.min(limit, 50) }, (_, i) => {
                const logSource = source || webhookSources[Math.floor(Math.random() * webhookSources.length)]
                const logStatus = status || webhookStatuses[Math.floor(Math.random() * webhookStatuses.length)]
                const timestamp = new Date(Date.now() - i * 60000)
                
                return {
                    id: `webhook_log_${i + 1}`,
                    timestamp: timestamp.toISOString(),
                    source: logSource,
                    status: logStatus,
                    method: 'POST',
                    endpoint: `/api/webhook/${logSource}/${req.tenant.id}`,
                    status_code: logStatus === 'success' ? 200 : (logStatus === 'error' ? 500 : 202),
                    response_time_ms: Math.floor(Math.random() * 1000) + 50,
                    payload_size: Math.floor(Math.random() * 5000) + 100,
                    ip_address: `192.168.1.${Math.floor(Math.random() * 255)}`,
                    user_agent: 'WhatsApp/2.0',
                    error_message: logStatus === 'error' ? 'Error simulado de procesamiento' : null,
                    tenant_id: req.tenant.id
                }
            })

            res.json({
                logs: simulatedLogs,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: simulatedLogs.length,
                    pages: Math.ceil(simulatedLogs.length / limit)
                },
                filters: {
                    source: source || null,
                    status: status || null
                },
                summary: {
                    total_requests: simulatedLogs.length,
                    success_rate: (simulatedLogs.filter(log => log.status === 'success').length / simulatedLogs.length * 100).toFixed(1),
                    avg_response_time: (simulatedLogs.reduce((sum, log) => sum + log.response_time_ms, 0) / simulatedLogs.length).toFixed(0)
                },
                note: 'Logs simulados - En producción se integraría con sistema de logging real'
            })

        } catch (error) {
            console.error('Error en GET /api/webhook/logs:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * POST /api/webhook/test
 * Probar webhook con datos simulados
 */
router.post('/test',
    requirePermission('webhooks', 'create'),
    [
        body('source')
            .isIn(['whatsapp', 'telegram', 'facebook', 'custom'])
            .withMessage('Source inválido'),
        body('payload')
            .optional()
            .isObject()
            .withMessage('Payload debe ser un objeto')
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

            const { source, payload } = req.body

            // Crear payload de prueba según el source
            let testPayload = payload
            if (!testPayload) {
                switch (source) {
                    case 'whatsapp':
                        testPayload = {
                            entry: [{
                                id: 'test_entry',
                                changes: [{
                                    value: {
                                        messaging_product: 'whatsapp',
                                        messages: [{
                                            id: 'test_message_id',
                                            from: '1234567890',
                                            timestamp: Math.floor(Date.now() / 1000),
                                            text: { body: 'Mensaje de prueba' },
                                            type: 'text'
                                        }]
                                    },
                                    field: 'messages'
                                }]
                            }]
                        }
                        break
                    default:
                        testPayload = {
                            test: true,
                            message: 'Webhook de prueba',
                            timestamp: new Date().toISOString(),
                            source
                        }
                }
            }

            // Simular procesamiento del webhook
            const processingResult = {
                test_id: `test_${Date.now()}`,
                source,
                payload: testPayload,
                processed_at: new Date().toISOString(),
                status: 'success',
                processing_time_ms: Math.floor(Math.random() * 500) + 50,
                tenant_id: req.tenant.id,
                result: {
                    message: 'Webhook de prueba procesado exitosamente',
                    actions_triggered: Math.floor(Math.random() * 3),
                    chatbots_notified: Math.floor(Math.random() * 2) + 1
                }
            }

            res.json({
                message: 'Webhook de prueba ejecutado exitosamente',
                test_result: processingResult
            })

        } catch (error) {
            console.error('Error en POST /api/webhook/test:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

// Funciones auxiliares

/**
 * Procesar cambios de WhatsApp
 */
async function processWhatsAppChange(tenantId, change) {
    try {
        console.log(`Procesando cambio de WhatsApp para tenant ${tenantId}:`, change)

        if (change.field === 'messages' && change.value?.messages) {
            for (const message of change.value.messages) {
                await processWhatsAppMessage(tenantId, message, change.value)
            }
        }

        if (change.field === 'message_status' && change.value?.statuses) {
            for (const status of change.value.statuses) {
                await processWhatsAppStatus(tenantId, status)
            }
        }

    } catch (error) {
        console.error('Error procesando cambio de WhatsApp:', error)
    }
}

/**
 * Procesar mensaje de WhatsApp
 */
async function processWhatsAppMessage(tenantId, message, context) {
    try {
        console.log(`Procesando mensaje de WhatsApp: ${message.id}`)

        // Obtener servicio de WhatsApp para el tenant
        const whatsappService = WhatsAppService.getInstance(tenantId)
        
        if (whatsappService) {
            // Procesar mensaje a través del servicio
            await whatsappService.processIncomingMessage({
                id: message.id,
                from: message.from,
                timestamp: message.timestamp,
                type: message.type,
                text: message.text,
                context: context
            })
        }

    } catch (error) {
        console.error('Error procesando mensaje de WhatsApp:', error)
    }
}

/**
 * Procesar estado de mensaje de WhatsApp
 */
async function processWhatsAppStatus(tenantId, status) {
    try {
        console.log(`Procesando estado de mensaje: ${status.id} - ${status.status}`)

        // Actualizar estado del mensaje en base de datos
        const supabase = createSupabaseClient(tenantId)
        await supabase
            .from('messages')
            .update({
                status: status.status,
                updated_at: new Date().toISOString()
            })
            .eq('whatsapp_message_id', status.id)

    } catch (error) {
        console.error('Error procesando estado de mensaje:', error)
    }
}

/**
 * Procesar webhook externo
 */
async function processExternalWebhook(tenantId, source, data) {
    try {
        console.log(`Procesando webhook externo de ${source} para tenant ${tenantId}`)

        // Procesar según el source
        switch (source) {
            case 'telegram':
                await processTelegramWebhook(tenantId, data)
                break
            case 'facebook':
                await processFacebookWebhook(tenantId, data)
                break
            case 'custom':
                await processCustomWebhook(tenantId, data)
                break
            default:
                console.log(`Source no reconocido: ${source}`)
        }

    } catch (error) {
        console.error('Error procesando webhook externo:', error)
    }
}

/**
 * Procesar webhook de Telegram
 */
async function processTelegramWebhook(tenantId, data) {
    // Implementar lógica específica de Telegram
    console.log('Procesando webhook de Telegram:', data)
}

/**
 * Procesar webhook de Facebook
 */
async function processFacebookWebhook(tenantId, data) {
    // Implementar lógica específica de Facebook
    console.log('Procesando webhook de Facebook:', data)
}

/**
 * Procesar webhook personalizado
 */
async function processCustomWebhook(tenantId, data) {
    // Implementar lógica para webhooks personalizados
    console.log('Procesando webhook personalizado:', data)
}

export default router