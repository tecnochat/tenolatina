import { logger } from '../utils/logger.js'
import { DisconnectReason } from '@whiskeysockets/baileys'
import { EventEmitter } from 'events'

class ConnectionManager extends EventEmitter {
    constructor(provider) {
        super()
        this.provider = provider
        this.reconnectAttempts = 0
        this.maxReconnectAttempts = 15 // Aumentado para Railway
        this.reconnectDelay = 3000 // 3 segundos inicial (reducido)
        this.maxReconnectDelay = 180000 // 3 minutos máximo (reducido para Railway)
        this.isConnected = false
        this.lastConnection = Date.now()
        this.pingInterval = null
        this.healthCheckInterval = 15000 // Ping cada 15 segundos para Railway
    }

    async init() {
        try {
            // Esperar a que el provider esté listo
            if (!this.provider) {
                throw new Error('Provider no inicializado')
            }

            // Configurar eventos del provider
            this.setupEvents()
            
            // Iniciar monitoreo de conexión
            this.startConnectionMonitoring()
        } catch (error) {
            logger.error('Error inicializando ConnectionManager:', error)
            throw error
        }
    }

    setupEvents() {
        this.provider.ev?.on('connection.update', this.handleConnectionUpdate.bind(this))
        this.provider.ev?.on('creds.update', this.saveSession.bind(this))
    }

    async saveSession() {
        try {
            if (this.provider?.saveCreds) {
                await this.provider.saveCreds()
                logger.debug('Credenciales guardadas')
            }
        } catch (e) {
            logger.warn('No se pudieron guardar credenciales:', e?.message || e)
        }
    }

    async handleConnectionUpdate(update) {
        const { connection, lastDisconnect } = update
            
        if (connection === 'close') {
            // Verificar si la desconexión no es por logout
            const statusCode = lastDisconnect?.error?.output?.statusCode
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut
            
            if (shouldReconnect) {
                await this.handleDisconnection(lastDisconnect?.error)
            } else {
                logger.error('Desconexión permanente (logout/ban)')
                process.exit(1)
            }
        } else if (connection === 'open') {
            this.isConnected = true
            this.lastConnection = Date.now()
            this.reconnectAttempts = 0
            logger.info('Conexión establecida')
            this.emit('connected')
        }
    }

    async handleDisconnection(error) {
        this.isConnected = false
        logger.warn('Desconexión detectada:', error?.message || 'Unknown reason')
        this.emit('disconnected', error)

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('Máximo de intentos de reconexión alcanzado')
            process.exit(1)
            return
        }

        // Backoff exponencial
        const delay = Math.min(
            this.reconnectDelay * Math.pow(2, this.reconnectAttempts),
            this.maxReconnectDelay
        )

        logger.info(`Intentando reconexión en ${delay/1000} segundos...`)
        
        await new Promise(resolve => setTimeout(resolve, delay))
        
        try {
            await this.provider.connect()
            this.reconnectAttempts = 0
            logger.info('Reconexión exitosa')
        } catch (error) {
            this.reconnectAttempts++
            logger.error(`Intento de reconexión ${this.reconnectAttempts} fallido:`, error)
            await this.handleDisconnection(error)
        }
    }

    startConnectionMonitoring() {
        // Limpiar intervalos existentes
        if (this.pingInterval) clearInterval(this.pingInterval)

        // Ping periódico para verificar conexión y mantener viva
        this.pingInterval = setInterval(async () => {
            try {
                if (this.provider?.sock?.ws?.readyState === 1) {
                    // WebSocket está abierto
                    await this.provider.sendPresenceUpdate('available')
                    logger.debug('Ping enviado exitosamente')
                } else {
                    // Forzar reconexión si el socket no está listo
                    if (this.isConnected) {
                        logger.warn('Socket no listo, marcando como desconectado')
                    }
                    this.isConnected = false
                    this.emit('disconnected', new Error('Socket not ready'))
                }
            } catch (error) {
                logger.warn('Error en ping de conexión:', error)
                this.isConnected = false
                this.emit('disconnected', error)
            }
        }, this.healthCheckInterval) // Cada 15 segundos
    }

    getStatus() {
        return {
            isConnected: this.isConnected,
            lastConnection: this.lastConnection,
            reconnectAttempts: this.reconnectAttempts,
            uptime: Date.now() - this.lastConnection
        }
    }
}

export default ConnectionManager