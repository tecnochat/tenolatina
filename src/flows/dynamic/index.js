import { addKeyword } from '@builderbot/bot'
import { ChatbotService } from '../../services/database/chatbots.js'
import { FlowService } from '../../services/database/flows.js'
import { ChatHistoryService } from '../../services/database/chat-history.js'
import { PromptsService } from '../../services/database/prompts.js'
import { OpenAIService } from '../../services/ai/openai.js'
import { BlacklistService } from '../../services/database/blacklist.js'
import { memoryManager } from '../../utils/memory-manager.js'
import { ResponseCache } from '../../services/cache/response-cache.js'

// Constantes para configuración
const CONFIG = {
    MAX_HISTORY_MESSAGES: 10, // Limitar historial a los últimos 5 mensajes
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000
}

// Sistema de reintentos
const retry = async (fn, maxRetries = CONFIG.MAX_RETRIES) => {
    let lastError
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn()
        } catch (error) {
            console.error(`Intento ${i + 1}/${maxRetries} falló:`, error)
            lastError = error
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY))
            }
        }
    }
    throw lastError
}

// Exportar función de normalización para reutilización
export const normalizeText = (text) => {
    if (!text) return '';
    return text.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remover acentos
        .replace(/\s+/g, ' ') // Normalizar espacios múltiples
        .trim()
}

// Función para verificar coincidencia
const checkKeywordMatch = (message, keywords) => {
    if (!message || !keywords || !Array.isArray(keywords)) return false;
    
    const normalizedMessage = normalizeText(message);
    if (!normalizedMessage) return false;
    
    // Verificar coincidencia exacta después de normalización
    return keywords.some(keyword => {
        const normalizedKeyword = normalizeText(keyword);
        return normalizedKeyword && normalizedKeyword === normalizedMessage;
    });
}

// Función para verificar si es un archivo de audio
const isAudioUrl = (url) => {
    return url.toLowerCase().endsWith('.mp3')
}

// Función para formatear historial limitado
const formatLimitedHistory = (history) => {
    const limitedHistory = history.slice(-CONFIG.MAX_HISTORY_MESSAGES)
    return limitedHistory.flatMap(entry => [
        { role: 'user', content: entry.message },
        { role: 'assistant', content: entry.response }
    ])
}

export const createDynamicFlows = async () => {
    console.log('Creando flujo dinámico base...')
    
    try {
        // Verificar memoria disponible
        const memStats = memoryManager.getStats()
        console.log('📊 Estado de memoria:', memStats)

        if (memStats.heapUsed > memStats.limit * 0.9) {
            console.warn('⚠️ Uso de memoria alto, iniciando limpieza...')
            await memoryManager.forceCleanup()
        }

        // Obtener el chatbot activo
        const chatbot = await retry(async () => {
            const bot = await ChatbotService.getActiveChatbotForPort()
            if (!bot) throw new Error('No se encontró un chatbot activo')
            return bot
        })

        if (!chatbot) {
            console.log('❌ No se encontró un chatbot activo para crear flujos dinámicos')
            return null
        }

        // Obtener todos los flujos activos usando caché
        const allFlows = await retry(async () => {
            const cacheKey = `active_flows_${chatbot.id}`
            const cached = await ResponseCache.get(chatbot.id, cacheKey)
            if (cached) return cached

            const flows = await FlowService.getActiveFlows(chatbot.id)
            if (flows) {
                await ResponseCache.set(chatbot.id, cacheKey, flows)
            }
            return flows
        })

        if (!allFlows || allFlows.length === 0) {
            console.log('❌ No hay flujos configurados')
            return null
        }

        // Extraer palabras clave
        const allKeywords = allFlows.flatMap(flow => flow.keyword || [])
        console.log(`🔑 Palabras clave extraídas: ${allKeywords.length}`)

        if (allKeywords.length === 0) {
            console.log('❌ No se encontraron palabras clave')
            return null
        }

        const normalizedKeywords = allKeywords.map(keyword => normalizeText(keyword))
        
        const mainFlow = addKeyword(normalizedKeywords, {
            sensitive: false
        })
        .addAction(async (ctx, { flowDynamic, endFlow, state }) => {
            try {
                console.log('⚡ Flujo dinámico activado')
                const message = normalizeText(ctx.body || '')
                console.log('📝 Mensaje recibido:', message)

                if (!ctx?.from) {
                    console.log('❌ Número no válido')
                    return endFlow()
                }

                const phoneNumber = ctx.from.replace('@s.whatsapp.net', '')

                // Verificar estado de formularios
                const currentState = state.getMyState()
                if (currentState && Object.keys(currentState).length > 0) {
                    console.log('🔄 Flujo de datos en proceso, no intervengo')
                    return endFlow()
                }

                // Verificar blacklist
                const chatbot = await retry(async () => {
                    const bot = await ChatbotService.getActiveChatbotForPort()
                    if (!bot) throw new Error('No se encontró chatbot')
                    return bot
                })

                const isBlacklisted = await retry(async () => {
                    return await BlacklistService.isBlacklisted(chatbot.id, phoneNumber)
                })

                if (isBlacklisted) {
                    console.log('🚫 Número en blacklist:', phoneNumber)
                    return endFlow()
                }

                // Obtener flujos activos
                const flows = await retry(async () => {
                    return await FlowService.getActiveFlows(chatbot.id)
                })

                if (!flows?.length) {
                    await flowDynamic('Servicio no disponible.')
                    return endFlow()
                }

                // Buscar coincidencia
                const matchingFlow = flows.find(flow => checkKeywordMatch(message, flow.keyword))
                
                if (matchingFlow) {
                    console.log('✅ Coincidencia encontrada:', matchingFlow.id)
                    
                    // Guardar en historial
                    await retry(async () => {
                        await ChatHistoryService.addEntry(
                            chatbot.user_id,
                            chatbot.id,
                            phoneNumber,
                            message,
                            matchingFlow.response_text
                        )
                    })

                    try {
                        if (matchingFlow.media_url) {
                            console.log('📎 Media URL:', matchingFlow.media_url)
                            
                            if (isAudioUrl(matchingFlow.media_url)) {
                                await flowDynamic([{
                                    media: matchingFlow.media_url
                                }])
                                await flowDynamic(matchingFlow.response_text)
                            } else {
                                await flowDynamic([{
                                    body: matchingFlow.response_text,
                                    media: matchingFlow.media_url
                                }])
                            }
                        } else {
                            await flowDynamic(matchingFlow.response_text)
                        }
                    } catch (mediaError) {
                        console.error('❌ Error multimedia:', mediaError)
                        await flowDynamic(matchingFlow.response_text)
                    }
                } else {
                    console.log('🤖 Delegando a IA')
                    
                    try {
                        // Cache key para respuesta de IA
                        const aiCacheKey = `ai_response_${chatbot.id}_${normalizeText(message)}`
                        let aiResponse = await ResponseCache.get(chatbot.id, aiCacheKey)

                        if (!aiResponse) {
                            // Obtener datos necesarios en paralelo
                            const [history, behaviorPrompt, knowledgePrompts] = await Promise.all([
                                ChatHistoryService.getRecentHistory(chatbot.id, phoneNumber),
                                PromptsService.getActiveBehaviorPrompt(chatbot.id),
                                PromptsService.getActiveKnowledgePrompts(chatbot.id)
                            ])

                            const formattedHistory = formatLimitedHistory(history)
                            const messages = [
                                ...formattedHistory,
                                { role: 'user', content: ctx.body }
                            ]

                            aiResponse = await retry(async () => {
                                return await OpenAIService.generateChatResponse(
                                    messages,
                                    behaviorPrompt?.prompt_text || '',
                                    knowledgePrompts?.map(p => p.prompt_text).join('\n\n') || '',
                                    false,
                                    chatbot.id
                                )
                            })

                            // Guardar en caché por 5 minutos
                            await ResponseCache.set(chatbot.id, aiCacheKey, aiResponse, 300)
                        }

                        await flowDynamic(aiResponse)

                        // Guardar en historial
                        await retry(async () => {
                            await ChatHistoryService.addEntry(
                                chatbot.user_id,
                                chatbot.id,
                                phoneNumber,
                                ctx.body,
                                aiResponse
                            )
                        })

                    } catch (error) {
                        console.error('❌ Error IA:', error)
                        await flowDynamic('Lo siento, no puedo procesar tu consulta ahora.')
                    }
                }
            } catch (error) {
                console.error('❌ Error general:', error)
                await flowDynamic('Error procesando tu consulta.')
            } finally {
                // Liberar memoria
                if (global.gc) {
                    global.gc()
                }
            }

            return endFlow()
        })

        console.log('✅ Flujo dinámico creado')
        return mainFlow

    } catch (error) {
        console.error('❌ Error creando flujo dinámico:', error)
        return null
    }
}