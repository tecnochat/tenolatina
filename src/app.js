import { join } from 'path'
import fs from 'fs'
import { createBot, createProvider, createFlow } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import dotenv from 'dotenv'
import { BlacklistService } from './services/database/blacklist.js'
import { PortAssignmentService } from './services/database/port-assignment.js'
import { CONFIG } from './config/constants.js'
import { memoryManager } from './utils/memory-manager.js'
import { logger } from './utils/logger.js'
import ConnectionManager from './services/connection-manager.js'

// Import router flow
import { createRouterFlow } from './flows/router/index.js'

// Load environment variables
dotenv.config()

// Variables globales
const PORT = process.env.PORT ?? 3020
const processedMessages = new Set()
const messageRateLimit = new Map()

// Manejadores de memoria
memoryManager.on('memory-warning', (usage) => {
    logger.warn('Uso de memoria alto:', usage)
})

memoryManager.on('memory-critical', (usage) => {
    logger.error('Uso de memoria crítico:', usage)
    processedMessages.clear()
    messageRateLimit.clear()
})

const main = async () => {
    try {
        logger.info('Inicializando bot...')
        
        // Crear directorio temporal
        const tmpDir = join(process.cwd(), 'tmp')
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true })
        }

        // Asegurar directorio de credenciales de Baileys (sesión)
        const authDir = join(process.cwd(), 'auth_info_baileys')
        if (!fs.existsSync(authDir)) {
            fs.mkdirSync(authDir, { recursive: true })
        }

        // Validar puerto
        const userId = await PortAssignmentService.getUserIdByPort(PORT)
        if (!userId) {
            throw new Error(`No hay user_id asignado para el puerto ${PORT}`)
        }
        logger.info(`Bot iniciando en puerto ${PORT} para user_id: ${userId}`)

        // Inicializar provider
        // Inicializar provider con configuraciones optimizadas para Railway
        const adapterProvider = createProvider(Provider, {
            name: 'bot-session',
            printQRInTerminal: true,
            markOnlineOnConnect: false,
            // Timeouts y keepalive optimizados
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 30000,
            keepAliveIntervalMs: 15000,
            // Reintentos y estabilidad
            retryRequestDelayMs: 2000,
            maxMsgRetryCount: 5,
            // Reducir consumo y operaciones costosas
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
            // Identificación del cliente
            browser: ['TecnoBot Railway', 'Chrome', '110.0.0.0']
        })

        // Crear router flow
        const routerFlow = createRouterFlow()
        if (!routerFlow) {
            throw new Error('Error inicializando router flow')
        }

        // Crear flujo principal
        const adapterFlow = createFlow([routerFlow])

        // Crear bot
        const { handleMsg, handleCtx, httpServer } = await createBot({
            flow: adapterFlow,
            provider: adapterProvider,
            database: new Database()
        })

        // Inicializar conexión
        const connectionManager = new ConnectionManager(adapterProvider)
        await connectionManager.init()

        // Procesador de mensajes
        adapterProvider.on('message', async (ctx) => {
            try {
                if (!ctx?.from) {
                    logger.error('❌ Contexto inválido:', ctx)
                    return
                }

                const phoneNumber = ctx.from.replace('@s.whatsapp.net', '')
                const messageId = ctx.id?.id || `${phoneNumber}-${Date.now()}`

                // Verificar duplicados usando ID del mensaje
                if (processedMessages.has(messageId)) {
                    logger.debug('Mensaje duplicado ignorado:', messageId)
                    return
                }

                // Control de rate limit
                const now = Date.now()
                const userLimit = messageRateLimit.get(phoneNumber) || { count: 0, timestamp: now, lastMessage: '' }

                // Verificar mensaje repetido
                if (ctx.body && userLimit.lastMessage === ctx.body) {
                    logger.debug('Mensaje repetido ignorado:', ctx.body)
                    return
                }
                
                if (now - userLimit.timestamp > CONFIG.RATE_LIMITS.COOLDOWN_PERIOD) {
                    userLimit.count = 1
                    userLimit.timestamp = now
                } else if (userLimit.count >= CONFIG.RATE_LIMITS.MAX_MESSAGES_PER_MINUTE) {
                    logger.warn('Rate limit excedido para:', phoneNumber)
                    return
                } else {
                    userLimit.count++
                }
                messageRateLimit.set(phoneNumber, userLimit)

                // Procesar mensaje
                // Verificar estado de conexión después de validaciones
                if (!connectionManager.isConnected) {
                    logger.warn('Mensaje ignorado - Bot desconectado')
                    return
                }

                // Actualizar control de mensajes
                processedMessages.add(messageId)
                setTimeout(() => processedMessages.delete(messageId), 10000) // Aumentado a 10 segundos

                if (ctx.body) {
                    ctx.body = ctx.body.toLowerCase().trim()
                    userLimit.lastMessage = ctx.body
                }

                // Actualizar rate limit
                messageRateLimit.set(phoneNumber, {
                    ...userLimit,
                    count: userLimit.count + 1,
                    timestamp: now
                })

                // Procesar mensaje
                await handleMsg(ctx)

            } catch (error) {
                logger.error('Error processing message:', error)
                if (!error.message?.includes('Queue')) {
                    try {
                        if (connectionManager.isConnected) {
                            const to = ctx.from.includes('@s.whatsapp.net') ? 
                                ctx.from : `${ctx.from}@s.whatsapp.net`
                            await adapterProvider.sendMessage(to, { 
                                text: 'Lo siento, ocurrió un error al procesar tu mensaje.' 
                            })
                        }
                    } catch (sendError) {
                        logger.error('Error sending error message:', sendError)
                    }
                }
            }
        })

        // API endpoints
        adapterProvider.server.post('/v1/messages', handleCtx(async (bot, req, res) => {
            if (!connectionManager.isConnected) {
                return res.end(JSON.stringify({ error: 'Bot desconectado' }))
            }
            const { number, message, urlMedia } = req.body
            await bot.sendMessage(number, message, { media: urlMedia ?? null })
            return res.end('sent')
        }))

        adapterProvider.server.post('/v1/register', handleCtx(async (bot, req, res) => {
            if (!connectionManager.isConnected) {
                return res.end(JSON.stringify({ error: 'Bot desconectado' }))
            }
            const { number } = req.body
            await bot.dispatch('REGISTER_CLIENT', { from: number })
            return res.end('trigger')
        }))

        adapterProvider.server.post('/v1/blacklist', handleCtx(async (bot, req, res) => {
            const { number, chatbotId, userId, action } = req.body
            try {
                if (action === 'add') {
                    await BlacklistService.addToBlacklist(userId, chatbotId, number)
                } else if (action === 'remove') {
                    await BlacklistService.removeFromBlacklist(chatbotId, number)
                }
                res.writeHead(200, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ 
                    status: 'success', 
                    message: `Number ${action === 'add' ? 'added to' : 'removed from'} blacklist`,
                    number 
                }))
            } catch (error) {
                logger.error('Error en blacklist:', error)
                res.writeHead(500, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ 
                    status: 'error', 
                    message: error.message 
                }))
            }
        }))

        // Métricas endpoint
        adapterProvider.server.get('/v1/metrics', (req, res) => {
            const stats = {
                memory: memoryManager.getStats(),
                connection: connectionManager.getStatus()
            }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify(stats))
        })

        // Iniciar servidor
        httpServer(+PORT)
        logger.info(`Server running on port ${PORT}`)

    } catch (error) {
        logger.error('Error starting server:', error)
        process.exit(1)
    }
}

main()
