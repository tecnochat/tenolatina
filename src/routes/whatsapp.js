import express from 'express'
import { requirePermission, requireResourceAccess } from '../middleware/rbac.js'
import { MultiSessionManager } from '../services/multi-session-manager.js'
import { AppConfig, getPlanLimits } from '../config/app-config.js'
import { SupabaseError } from '../config/supabase.js'

const router = express.Router()
const sessionManager = new MultiSessionManager()

/**
 * @route GET /api/whatsapp/sessions
 * @desc Obtener todas las sesiones de WhatsApp del tenant
 * @access Private
 */
router.get('/sessions', requirePermission('whatsapp:read'), async (req, res) => {
    try {
        const tenantId = req.tenant.id
        
        // Obtener sesiones activas del manager
        const activeSessions = sessionManager.getTenantSessions(tenantId)
        
        // Obtener información de QR desde la base de datos
        const { data: qrAssignments, error } = await req.db.from('assign_qr')
            .select(`
                id,
                port,
                status,
                url_qr,
                created_at,
                updated_at,
                chatbots!inner(
                    id,
                    name,
                    status as chatbot_status,
                    is_active
                )
            `)
            .order('created_at', { ascending: false })
        
        if (error) throw error
        
        // Combinar información de sesiones activas con datos de BD
        const sessions = qrAssignments.map(qr => {
            const activeSession = activeSessions.find(s => s.chatbotId === qr.chatbots.id)
            
            return {
                id: qr.id,
                chatbotId: qr.chatbots.id,
                chatbotName: qr.chatbots.name,
                port: qr.port,
                status: activeSession ? activeSession.status : qr.status,
                qrUrl: qr.url_qr,
                isConnected: activeSession ? activeSession.isConnected : false,
                phoneNumber: activeSession ? activeSession.phoneNumber : null,
                lastActivity: activeSession ? activeSession.lastActivity : null,
                createdAt: qr.created_at,
                updatedAt: qr.updated_at
            }
        })
        
        // Obtener estadísticas
        const stats = {
            total: sessions.length,
            connected: sessions.filter(s => s.isConnected).length,
            disconnected: sessions.filter(s => !s.isConnected).length,
            generating_qr: sessions.filter(s => s.status === 'generating_qr').length
        }
        
        res.json({
            success: true,
            data: {
                sessions,
                stats
            }
        })
        
    } catch (error) {
        console.error('Error obteniendo sesiones:', error)
        const formattedError = SupabaseError.formatError(error)
        res.status(500).json({
            error: 'Error obteniendo sesiones',
            message: formattedError.message
        })
    }
})

/**
 * @route GET /api/whatsapp/sessions/:chatbotId
 * @desc Obtener información de una sesión específica
 * @access Private
 */
router.get('/sessions/:chatbotId',
    requirePermission('whatsapp:read'),
    requireResourceAccess('chatbots'),
    async (req, res) => {
        try {
            const { chatbotId } = req.params
            const tenantId = req.tenant.id
            
            // Obtener información de la sesión activa
            const sessionInfo = sessionManager.getSessionStatus(tenantId, chatbotId)
            
            // Obtener información de QR desde BD
            const { data: qrInfo, error } = await req.db.from('assign_qr')
                .select(`
                    id,
                    port,
                    status,
                    url_qr,
                    created_at,
                    updated_at,
                    chatbots!inner(
                        id,
                        name,
                        status as chatbot_status
                    )
                `)
                .eq('chatbot_id', chatbotId)
                .single()
            
            if (error) throw error
            
            if (!qrInfo) {
                return res.status(404).json({
                    error: 'Sesión no encontrada',
                    message: 'No se encontró información de WhatsApp para este chatbot'
                })
            }
            
            const sessionData = {
                id: qrInfo.id,
                chatbotId: qrInfo.chatbots.id,
                chatbotName: qrInfo.chatbots.name,
                port: qrInfo.port,
                status: sessionInfo ? sessionInfo.status : qrInfo.status,
                qrUrl: qrInfo.url_qr,
                isConnected: sessionInfo ? sessionInfo.isConnected : false,
                phoneNumber: sessionInfo ? sessionInfo.phoneNumber : null,
                lastActivity: sessionInfo ? sessionInfo.lastActivity : null,
                connectionAttempts: sessionInfo ? sessionInfo.connectionAttempts : 0,
                createdAt: qrInfo.created_at,
                updatedAt: qrInfo.updated_at
            }
            
            res.json({
                success: true,
                data: { session: sessionData }
            })
            
        } catch (error) {
            console.error('Error obteniendo sesión:', error)
            const formattedError = SupabaseError.formatError(error)
            res.status(500).json({
                error: 'Error obteniendo sesión',
                message: formattedError.message
            })
        }
    }
)

/**
 * @route POST /api/whatsapp/sessions/:chatbotId/generate-qr
 * @desc Generar nuevo código QR para un chatbot
 * @access Private
 */
router.post('/sessions/:chatbotId/generate-qr',
    requirePermission('whatsapp:manage'),
    requireResourceAccess('chatbots'),
    async (req, res) => {
        try {
            const { chatbotId } = req.params
            const tenantId = req.tenant.id
            
            // Verificar límites del plan
            const planLimits = getPlanLimits(req.tenant.plan)
            const activeSessions = sessionManager.getTenantSessions(tenantId)
            
            if (planLimits.maxWhatsappSessions !== -1 && activeSessions.length >= planLimits.maxWhatsappSessions) {
                return res.status(403).json({
                    error: 'Límite de sesiones alcanzado',
                    message: `Tu plan permite máximo ${planLimits.maxWhatsappSessions} sesiones de WhatsApp`,
                    currentSessions: activeSessions.length,
                    maxAllowed: planLimits.maxWhatsappSessions
                })
            }
            
            // Verificar que el chatbot existe y pertenece al tenant
            const { data: chatbot, error: chatbotError } = await req.db.from('chatbots')
                .select('id, name, status')
                .eq('id', chatbotId)
                .single()
            
            if (chatbotError) throw chatbotError
            
            if (!chatbot) {
                return res.status(404).json({
                    error: 'Chatbot no encontrado',
                    message: 'El chatbot especificado no existe'
                })
            }
            
            // Detener sesión existente si la hay
            await sessionManager.destroySession(tenantId, chatbotId)
            
            // Crear nueva sesión
            const sessionResult = await sessionManager.createSession(tenantId, chatbotId)
            
            if (!sessionResult.success) {
                return res.status(500).json({
                    error: 'Error creando sesión',
                    message: sessionResult.error || 'No se pudo crear la sesión de WhatsApp'
                })
            }
            
            res.json({
                success: true,
                message: 'Código QR generado exitosamente',
                data: {
                    sessionId: sessionResult.sessionId,
                    qrUrl: sessionResult.qrUrl,
                    status: 'generating_qr',
                    expiresAt: new Date(Date.now() + AppConfig.whatsapp.qrTimeout).toISOString()
                }
            })
            
        } catch (error) {
            console.error('Error generando QR:', error)
            const formattedError = SupabaseError.formatError(error)
            res.status(500).json({
                error: 'Error generando QR',
                message: formattedError.message
            })
        }
    }
)

/**
 * @route POST /api/whatsapp/sessions/:chatbotId/disconnect
 * @desc Desconectar sesión de WhatsApp
 * @access Private
 */
router.post('/sessions/:chatbotId/disconnect',
    requirePermission('whatsapp:manage'),
    requireResourceAccess('chatbots'),
    async (req, res) => {
        try {
            const { chatbotId } = req.params
            const tenantId = req.tenant.id
            
            const result = await sessionManager.destroySession(tenantId, chatbotId)
            
            if (!result.success) {
                return res.status(400).json({
                    error: 'Error desconectando',
                    message: result.error || 'No se pudo desconectar la sesión'
                })
            }
            
            res.json({
                success: true,
                message: 'Sesión desconectada exitosamente'
            })
            
        } catch (error) {
            console.error('Error desconectando sesión:', error)
            res.status(500).json({
                error: 'Error desconectando sesión',
                message: 'No se pudo desconectar la sesión de WhatsApp'
            })
        }
    }
)

/**
 * @route POST /api/whatsapp/sessions/:chatbotId/send-message
 * @desc Enviar mensaje de prueba
 * @access Private
 */
router.post('/sessions/:chatbotId/send-message',
    requirePermission('whatsapp:send'),
    requireResourceAccess('chatbots'),
    async (req, res) => {
        try {
            const { chatbotId } = req.params
            const { phoneNumber, message, mediaUrl } = req.body
            const tenantId = req.tenant.id
            
            // Validaciones
            if (!phoneNumber || !message) {
                return res.status(400).json({
                    error: 'Datos requeridos',
                    message: 'Número de teléfono y mensaje son requeridos'
                })
            }
            
            // Validar formato de número
            const cleanPhone = phoneNumber.replace(/\D/g, '')
            if (cleanPhone.length < 10 || cleanPhone.length > 15) {
                return res.status(400).json({
                    error: 'Número inválido',
                    message: 'El número de teléfono no tiene un formato válido'
                })
            }
            
            // Validar longitud del mensaje
            if (message.length > AppConfig.whatsapp.maxMessageLength) {
                return res.status(400).json({
                    error: 'Mensaje muy largo',
                    message: `El mensaje no puede exceder ${AppConfig.whatsapp.maxMessageLength} caracteres`
                })
            }
            
            const result = await sessionManager.sendMessage(tenantId, chatbotId, {
                phoneNumber: cleanPhone,
                message,
                mediaUrl
            })
            
            if (!result.success) {
                return res.status(400).json({
                    error: 'Error enviando mensaje',
                    message: result.error || 'No se pudo enviar el mensaje'
                })
            }
            
            res.json({
                success: true,
                message: 'Mensaje enviado exitosamente',
                data: {
                    messageId: result.messageId,
                    timestamp: result.timestamp
                }
            })
            
        } catch (error) {
            console.error('Error enviando mensaje:', error)
            res.status(500).json({
                error: 'Error enviando mensaje',
                message: 'No se pudo enviar el mensaje de WhatsApp'
            })
        }
    }
)

/**
 * @route GET /api/whatsapp/sessions/:chatbotId/contacts
 * @desc Obtener contactos de la sesión
 * @access Private
 */
router.get('/sessions/:chatbotId/contacts',
    requirePermission('whatsapp:read'),
    requireResourceAccess('chatbots'),
    async (req, res) => {
        try {
            const { chatbotId } = req.params
            const { search, limit = 50 } = req.query
            const tenantId = req.tenant.id
            
            const contacts = await sessionManager.getContacts(tenantId, chatbotId, {
                search,
                limit: parseInt(limit)
            })
            
            res.json({
                success: true,
                data: { contacts }
            })
            
        } catch (error) {
            console.error('Error obteniendo contactos:', error)
            res.status(500).json({
                error: 'Error obteniendo contactos',
                message: 'No se pudieron obtener los contactos de WhatsApp'
            })
        }
    }
)

/**
 * @route GET /api/whatsapp/sessions/:chatbotId/chats
 * @desc Obtener chats recientes
 * @access Private
 */
router.get('/sessions/:chatbotId/chats',
    requirePermission('whatsapp:read'),
    requireResourceAccess('chatbots'),
    async (req, res) => {
        try {
            const { chatbotId } = req.params
            const { limit = 20 } = req.query
            const tenantId = req.tenant.id
            
            const chats = await sessionManager.getRecentChats(tenantId, chatbotId, {
                limit: parseInt(limit)
            })
            
            res.json({
                success: true,
                data: { chats }
            })
            
        } catch (error) {
            console.error('Error obteniendo chats:', error)
            res.status(500).json({
                error: 'Error obteniendo chats',
                message: 'No se pudieron obtener los chats de WhatsApp'
            })
        }
    }
)

/**
 * @route GET /api/whatsapp/usage
 * @desc Obtener estadísticas de uso de WhatsApp del tenant
 * @access Private
 */
router.get('/usage', requirePermission('analytics:read'), async (req, res) => {
    try {
        const tenantId = req.tenant.id
        const { period = '30d' } = req.query
        
        const { data: usage, error } = await req.db.rpc('get_whatsapp_usage_stats', {
            p_user_id: tenantId,
            p_period: period
        })
        
        if (error) throw error
        
        // Obtener límites del plan
        const planLimits = getPlanLimits(req.tenant.plan)
        const activeSessions = sessionManager.getTenantSessions(tenantId)
        
        const usageData = {
            current_sessions: activeSessions.length,
            max_sessions: planLimits.maxWhatsappSessions,
            messages_sent: usage?.[0]?.messages_sent || 0,
            messages_received: usage?.[0]?.messages_received || 0,
            total_conversations: usage?.[0]?.total_conversations || 0,
            active_conversations: usage?.[0]?.active_conversations || 0,
            period
        }
        
        res.json({
            success: true,
            data: { usage: usageData }
        })
        
    } catch (error) {
        console.error('Error obteniendo estadísticas de uso:', error)
        const formattedError = SupabaseError.formatError(error)
        res.status(500).json({
            error: 'Error obteniendo estadísticas',
            message: formattedError.message
        })
    }
})

export default router