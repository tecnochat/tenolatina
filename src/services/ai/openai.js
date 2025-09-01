import OpenAI from 'openai'
import { CONFIG } from '../../config/constants.js'
import dotenv from 'dotenv'
import { ResponseCache } from '../cache/response-cache.js'

dotenv.config()

if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY no está configurada en el archivo .env')
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
})

const MAX_HISTORY_MESSAGES = 10 // Limitar historial a los últimos 5 mensajes

export const OpenAIService = {
    async generateChatResponse(messages, behaviorPrompt = '', knowledgePrompt = '', isAudioResponse = false, chatbotId = null) {
        try {
            console.log('🤖 OpenAI: Preparando mensajes para generar respuesta')
            
            // Verificar caché si tenemos chatbotId y el último mensaje
            if (chatbotId && messages.length > 0) {
                const lastMessage = messages[messages.length - 1]
                if (lastMessage.role === 'user') {
                    const cachedResponse = await ResponseCache.get(chatbotId, lastMessage.content)
                    if (cachedResponse) {
                        console.log('🤖 OpenAI: Respuesta encontrada en caché')
                        return cachedResponse
                    }
                }
            }

            // Limitar el historial a los últimos mensajes
            const limitedMessages = messages.slice(-MAX_HISTORY_MESSAGES)
            
            // Preparar mensajes del sistema
            const systemMessages = []
            
            if (behaviorPrompt) {
                console.log('🤖 OpenAI: Agregando prompt de comportamiento')
                systemMessages.push({
                    role: 'system',
                    content: behaviorPrompt
                })
            }
            
            if (knowledgePrompt) {
                console.log('🤖 OpenAI: Agregando prompt de conocimiento')
                systemMessages.push({
                    role: 'system',
                    content: knowledgePrompt
                })
            }

            // Combinar mensajes
            const fullMessages = [
                ...systemMessages,
                ...limitedMessages
            ]

            console.log('🤖 OpenAI: Total de mensajes:', fullMessages.length)

            // Configuración específica según el tipo de respuesta "gpt-4o"
            const config = {
                model: "gpt-4o",
                messages: fullMessages,
                temperature: 0.5,
                max_tokens: 100,
                presence_penalty: 0.3,
                frequency_penalty: 0.3,
                top_p: 0.9,
                stop: null
            }

            // Ajustar configuración para respuestas de audio
            if (isAudioResponse) {
                config.temperature = 0.5
                config.max_tokens = 100
                config.presence_penalty = 0.3
                config.frequency_penalty = 0.3
                config.top_p = 0.9
                
                // Agregar instrucción específica para respuestas de audio
                config.messages.unshift({
                    role: 'system',
                    content: 'Proporciona respuestas completas y concisas. Si mencionas que darás información, inclúyela en el mismo mensaje. Evita frases como "a continuación" o "te proporcionaré" sin dar la información. no envies emojis o emoticones.'
                })
            }

            console.log('🤖 OpenAI: Configuración:', {
                isAudio: isAudioResponse,
                maxTokens: config.max_tokens,
                temperature: config.temperature
            })

            // Generar respuesta
            console.log('🤖 OpenAI: Llamando a la API...')
            const completion = await openai.chat.completions.create(config)

            const response = completion.choices[0].message.content
            console.log('🤖 OpenAI: Respuesta generada:', response.substring(0, 50) + '...')

            // Guardar en caché si tenemos chatbotId y mensaje del usuario
            if (chatbotId && messages.length > 0) {
                const lastMessage = messages[messages.length - 1]
                if (lastMessage.role === 'user') {
                    await ResponseCache.set(chatbotId, lastMessage.content, response)
                }
            }

            return response
        } catch (error) {
            console.error('🤖 OpenAI Error:', {
                message: error.message,
                type: error.type,
                code: error.code
            })
            throw new Error('Error generando respuesta de IA: ' + error.message)
        }
    },

    async generateEmbedding(text) {
        try {
            console.log('🤖 OpenAI: Generando embedding para texto')
            const response = await openai.embeddings.create({
                model: "text-embedding-ada-002",
                input: text
            })

            console.log('🤖 OpenAI: Embedding generado exitosamente')
            return response.data[0].embedding
        } catch (error) {
            console.error('🤖 OpenAI Embedding Error:', error)
            throw new Error('Error generando embedding: ' + error.message)
        }
    },

    async isResponseRelevant(question, answer, threshold = 0.6) {
        try {
            console.log('🤖 OpenAI: Verificando relevancia de respuesta')
            
            // Normalizar textos para comparación
            const normalizedQuestion = question.toLowerCase().trim()
            const normalizedAnswer = answer.toLowerCase().trim()

            // Verificar si la respuesta es demasiado genérica
            const genericPhrases = [
                'no puedo proporcionar',
                'no tengo información',
                'no estoy seguro',
                'no puedo ayudar'
            ]
            
            if (genericPhrases.some(phrase => normalizedAnswer.includes(phrase))) {
                console.log('🤖 OpenAI: Respuesta demasiado genérica')
                return false
            }

            // Generar embeddings
            const [questionEmbedding, answerEmbedding] = await Promise.all([
                this.generateEmbedding(question),
                this.generateEmbedding(answer)
            ])

            // Calcular similitud
            const similarity = this.cosineSimilarity(questionEmbedding, answerEmbedding)
            console.log('🤖 OpenAI: Similitud calculada:', similarity)
            
            // Verificar longitud mínima de respuesta
            if (answer.length < 20) {
                console.log('🤖 OpenAI: Respuesta demasiado corta')
                return false
            }

            return similarity >= threshold
        } catch (error) {
            console.error('🤖 OpenAI Relevance Error:', error)
            return false
        }
    },

    cosineSimilarity(vecA, vecB) {
        const dotProduct = vecA.reduce((acc, val, i) => acc + val * vecB[i], 0)
        const normA = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0))
        const normB = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0))
        return dotProduct / (normA * normB)
    }
}