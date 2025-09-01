/**
 * Gestor de Sesiones Múltiples de WhatsApp
 * 
 * Maneja múltiples instancias de Baileys simultáneamente,
 * una por cada tenant, con aislamiento completo entre sesiones.
 */

import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import QRCode from 'qrcode'
import fs from 'fs'
import path from 'path'
import { supabase } from '../config/supabase.js'
import { EventEmitter } from 'events'

class MultiSessionManager extends EventEmitter {
    constructor() {
        super()
        this.sessions = new Map() // userId -> sessionData
        this.qrCodes = new Map() // userId -> qrData
        this.reconnectAttempts = new Map() // userId -> attempts
        this.maxReconnectAttempts = 5
        this.sessionsDir = path.join(process.cwd(), 'sessions')
        
        // Crear directorio de sesiones si no existe
        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirSync(this.sessionsDir, { recursive: true })
        }
        
        console.log('🔄 MultiSessionManager inicializado')
    }

    /**
     * Crear nueva sesión de WhatsApp para un tenant
     */
    async createSession(userId, chatbotId) {
        try {
            console.log(`🚀 Creando sesión para tenant: ${userId}`)
            
            // Verificar si ya existe una sesión activa
            if (this.sessions.has(userId)) {
                const existingSession = this.sessions.get(userId)
                if (existingSession.socket && existingSession.socket.user) {
                    console.log(`⚠️ Sesión ya existe para tenant: ${userId}`)
                    return {
                        success: false,
                        message: 'Ya existe una sesión activa para este usuario',
                        status: 'already_connected'
                    }
                }
            }

            // Verificar límites del tenant
            const limits = await this.checkTenantLimits(userId)
            if (!limits.whatsappSessions.canConnect) {
                throw new Error('Límite de sesiones de WhatsApp alcanzado')
            }

            const sessionDir = path.join(this.sessionsDir, userId)
            if (!fs.existsSync(sessionDir)) {
                fs.mkdirSync(sessionDir, { recursive: true })
            }

            // Configurar autenticación multi-archivo
            const { state, saveCreds } = await useMultiFileAuthState(sessionDir)
            const { version, isLatest } = await fetchLatestBaileysVersion()
            
            console.log(`📱 Usando Baileys v${version.join('.')}, isLatest: ${isLatest}`)

            // Crear socket de WhatsApp
            const socket = makeWASocket({
                version,
                auth: state,
                printQRInTerminal: false,
                logger: this.createLogger(userId),
                browser: ['TecnoBot', 'Chrome', '1.0.0'],
                generateHighQualityLinkPreview: true,
                markOnlineOnConnect: false,
                syncFullHistory: false,
                defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                retryRequestDelayMs: 250
            })

            // Datos de la sesión
            const sessionData = {
                userId,
                chatbotId,
                socket,
                saveCreds,
                status: 'connecting',
                createdAt: new Date(),
                lastActivity: new Date(),
                qrGenerated: false,
                connectionAttempts: 0
            }

            this.sessions.set(userId, sessionData)
            this.setupSocketEvents(userId, socket, saveCreds)

            console.log(`✅ Sesión creada para tenant: ${userId}`)
            
            return {
                success: true,
                message: 'Sesión creada exitosamente',
                status: 'connecting',
                sessionId: userId
            }

        } catch (error) {
            console.error(`❌ Error creando sesión para ${userId}:`, error)
            throw error
        }
    }

    /**
     * Configurar eventos del socket de WhatsApp
     */
    setupSocketEvents(userId, socket, saveCreds) {
        const sessionData = this.sessions.get(userId)

        // Evento de actualización de conexión
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update
            
            console.log(`🔄 [${userId}] Actualización de conexión:`, { connection, qr: !!qr })

            if (qr) {
                await this.handleQRCode(userId, qr)
            }

            if (connection === 'close') {
                await this.handleDisconnection(userId, lastDisconnect)
            } else if (connection === 'open') {
                await this.handleConnection(userId)
            }
        })

        // Evento de actualización de credenciales
        socket.ev.on('creds.update', saveCreds)

        // Evento de mensajes
        socket.ev.on('messages.upsert', async (messageUpdate) => {
            await this.handleIncomingMessages(userId, messageUpdate)
        })

        // Evento de presencia
        socket.ev.on('presence.update', (presenceUpdate) => {
            this.handlePresenceUpdate(userId, presenceUpdate)
        })

        // Actualizar última actividad
        const updateActivity = () => {
            if (sessionData) {
                sessionData.lastActivity = new Date()
            }
        }

        socket.ev.on('messages.upsert', updateActivity)
        socket.ev.on('connection.update', updateActivity)
    }

    /**
     * Manejar generación de código QR
     */
    async handleQRCode(userId, qr) {
        try {
            console.log(`📱 [${userId}] Generando código QR`)
            
            // Generar imagen QR
            const qrImage = await QRCode.toDataURL(qr, {
                width: 300,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            })

            const qrData = {
                userId,
                qrCode: qr,
                qrImage,
                generatedAt: new Date(),
                status: 'waiting_scan'
            }

            this.qrCodes.set(userId, qrData)

            // Actualizar en base de datos
            await supabase
                .from('assign_qr')
                .upsert({
                    user_id: userId,
                    qr_code: qr,
                    url_qr: qrImage,
                    status: 'waiting_scan',
                    generated_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })

            // Marcar sesión como QR generado
            const sessionData = this.sessions.get(userId)
            if (sessionData) {
                sessionData.qrGenerated = true
                sessionData.status = 'waiting_scan'
            }

            // Emitir evento
            this.emit('qr-generated', { userId, qrData })
            
            console.log(`✅ [${userId}] Código QR generado y guardado`)

        } catch (error) {
            console.error(`❌ [${userId}] Error generando QR:`, error)
        }
    }

    /**
     * Manejar conexión exitosa
     */
    async handleConnection(userId) {
        try {
            const sessionData = this.sessions.get(userId)
            if (!sessionData) return

            const socket = sessionData.socket
            const userInfo = socket.user

            console.log(`🟢 [${userId}] WhatsApp conectado:`, userInfo.id)

            // Actualizar estado de sesión
            sessionData.status = 'connected'
            sessionData.connectedAt = new Date()
            sessionData.phoneNumber = userInfo.id.split(':')[0]
            
            // Limpiar intentos de reconexión
            this.reconnectAttempts.delete(userId)

            // Actualizar en base de datos
            await supabase
                .from('assign_qr')
                .upsert({
                    user_id: userId,
                    status: 'connected',
                    phone_number: sessionData.phoneNumber,
                    connected_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })

            // Limpiar QR code
            this.qrCodes.delete(userId)

            // Emitir evento
            this.emit('session-connected', { 
                userId, 
                phoneNumber: sessionData.phoneNumber,
                userInfo 
            })

            console.log(`✅ [${userId}] Sesión conectada exitosamente`)

        } catch (error) {
            console.error(`❌ [${userId}] Error manejando conexión:`, error)
        }
    }

    /**
     * Manejar desconexión
     */
    async handleDisconnection(userId, lastDisconnect) {
        try {
            const sessionData = this.sessions.get(userId)
            if (!sessionData) return

            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
            const reason = (lastDisconnect?.error as Boom)?.output?.statusCode
            
            console.log(`🔴 [${userId}] WhatsApp desconectado. Razón:`, reason, 'Reconectar:', shouldReconnect)

            // Actualizar estado
            sessionData.status = 'disconnected'
            sessionData.disconnectedAt = new Date()

            // Actualizar en base de datos
            await supabase
                .from('assign_qr')
                .update({
                    status: 'disconnected',
                    disconnected_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId)

            if (shouldReconnect) {
                await this.attemptReconnection(userId)
            } else {
                // Logout permanente, limpiar sesión
                await this.destroySession(userId)
                
                // Emitir evento
                this.emit('session-logged-out', { userId, reason })
            }

        } catch (error) {
            console.error(`❌ [${userId}] Error manejando desconexión:`, error)
        }
    }

    /**
     * Intentar reconexión automática
     */
    async attemptReconnection(userId) {
        const attempts = this.reconnectAttempts.get(userId) || 0
        
        if (attempts >= this.maxReconnectAttempts) {
            console.log(`⚠️ [${userId}] Máximo de intentos de reconexión alcanzado`)
            await this.destroySession(userId)
            this.emit('session-failed', { userId, reason: 'max_reconnect_attempts' })
            return
        }

        this.reconnectAttempts.set(userId, attempts + 1)
        
        const delay = Math.min(1000 * Math.pow(2, attempts), 30000) // Backoff exponencial
        console.log(`🔄 [${userId}] Reintentando conexión en ${delay}ms (intento ${attempts + 1}/${this.maxReconnectAttempts})`)
        
        setTimeout(async () => {
            try {
                const sessionData = this.sessions.get(userId)
                if (sessionData && sessionData.chatbotId) {
                    await this.createSession(userId, sessionData.chatbotId)
                }
            } catch (error) {
                console.error(`❌ [${userId}] Error en reconexión:`, error)
            }
        }, delay)
    }

    /**
     * Manejar mensajes entrantes
     */
    async handleIncomingMessages(userId, messageUpdate) {
        try {
            const sessionData = this.sessions.get(userId)
            if (!sessionData) return

            const { messages, type } = messageUpdate
            
            if (type !== 'notify') return

            for (const message of messages) {
                if (message.key.fromMe) continue // Ignorar mensajes propios
                
                console.log(`📨 [${userId}] Mensaje recibido de:`, message.key.remoteJid)
                
                // Emitir evento para procesamiento
                this.emit('message-received', {
                    userId,
                    chatbotId: sessionData.chatbotId,
                    message,
                    socket: sessionData.socket
                })
            }

        } catch (error) {
            console.error(`❌ [${userId}] Error procesando mensajes:`, error)
        }
    }

    /**
     * Manejar actualizaciones de presencia
     */
    handlePresenceUpdate(userId, presenceUpdate) {
        // Implementar lógica de presencia si es necesario
        console.log(`👁️ [${userId}] Actualización de presencia:`, presenceUpdate.id)
    }

    /**
     * Enviar mensaje desde una sesión específica
     */
    async sendMessage(userId, to, message) {
        try {
            const sessionData = this.sessions.get(userId)
            if (!sessionData || sessionData.status !== 'connected') {
                throw new Error('Sesión no conectada')
            }

            const socket = sessionData.socket
            const result = await socket.sendMessage(to, message)
            
            console.log(`📤 [${userId}] Mensaje enviado a:`, to)
            return result

        } catch (error) {
            console.error(`❌ [${userId}] Error enviando mensaje:`, error)
            throw error
        }
    }

    /**
     * Obtener estado de sesión
     */
    getSessionStatus(userId) {
        const sessionData = this.sessions.get(userId)
        const qrData = this.qrCodes.get(userId)
        
        if (!sessionData) {
            return {
                status: 'not_found',
                message: 'Sesión no encontrada'
            }
        }

        return {
            status: sessionData.status,
            phoneNumber: sessionData.phoneNumber,
            createdAt: sessionData.createdAt,
            connectedAt: sessionData.connectedAt,
            lastActivity: sessionData.lastActivity,
            qrAvailable: !!qrData,
            qrData: qrData ? {
                image: qrData.qrImage,
                generatedAt: qrData.generatedAt
            } : null
        }
    }

    /**
     * Obtener código QR para un usuario
     */
    getQRCode(userId) {
        return this.qrCodes.get(userId)
    }

    /**
     * Destruir sesión
     */
    async destroySession(userId) {
        try {
            console.log(`🗑️ [${userId}] Destruyendo sesión`)
            
            const sessionData = this.sessions.get(userId)
            if (sessionData && sessionData.socket) {
                try {
                    await sessionData.socket.logout()
                } catch (error) {
                    console.log(`⚠️ [${userId}] Error en logout:`, error.message)
                }
                
                sessionData.socket.end()
            }

            // Limpiar datos
            this.sessions.delete(userId)
            this.qrCodes.delete(userId)
            this.reconnectAttempts.delete(userId)

            // Actualizar base de datos
            await supabase
                .from('assign_qr')
                .update({
                    status: 'disconnected',
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId)

            console.log(`✅ [${userId}] Sesión destruida`)

        } catch (error) {
            console.error(`❌ [${userId}] Error destruyendo sesión:`, error)
        }
    }

    /**
     * Obtener todas las sesiones activas
     */
    getActiveSessions() {
        const sessions = []
        
        for (const [userId, sessionData] of this.sessions.entries()) {
            sessions.push({
                userId,
                status: sessionData.status,
                phoneNumber: sessionData.phoneNumber,
                createdAt: sessionData.createdAt,
                lastActivity: sessionData.lastActivity
            })
        }
        
        return sessions
    }

    /**
     * Verificar límites del tenant
     */
    async checkTenantLimits(userId) {
        try {
            const { data, error } = await supabase.rpc('check_tenant_limits', {
                p_user_id: userId
            })

            if (error) throw error
            return data

        } catch (error) {
            console.error('Error verificando límites:', error)
            // Valores por defecto en caso de error
            return {
                whatsappSessions: { current: 0, limit: 1, canConnect: true }
            }
        }
    }

    /**
     * Crear logger personalizado para cada sesión
     */
    createLogger(userId) {
        return {
            level: 'silent', // Cambiar a 'info' para debug
            log: (level, ...args) => {
                if (level === 'error') {
                    console.error(`🔴 [${userId}] Baileys:`, ...args)
                }
            }
        }
    }

    /**
     * Limpiar sesiones inactivas
     */
    async cleanupInactiveSessions() {
        const now = new Date()
        const maxInactiveTime = 30 * 60 * 1000 // 30 minutos
        
        for (const [userId, sessionData] of this.sessions.entries()) {
            const inactiveTime = now.getTime() - sessionData.lastActivity.getTime()
            
            if (inactiveTime > maxInactiveTime && sessionData.status !== 'connected') {
                console.log(`🧹 [${userId}] Limpiando sesión inactiva`)
                await this.destroySession(userId)
            }
        }
    }

    /**
     * Iniciar limpieza automática
     */
    startCleanupInterval() {
        setInterval(() => {
            this.cleanupInactiveSessions()
        }, 10 * 60 * 1000) // Cada 10 minutos
        
        console.log('🧹 Limpieza automática de sesiones iniciada')
    }
}

export default new MultiSessionManager()