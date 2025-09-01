import supabase, { pool } from '../../config/supabase.js'
import { TABLES, CONFIG } from '../../config/constants.js'
import { OpenAIService } from '../ai/openai.js'
import { ResponseCache } from '../cache/response-cache.js'

export const ChatHistoryService = {
    async addEntry(userId, chatbotId, phoneNumber, message, response) {
        const connection = await pool.getConnection()
        try {
            // Normalizar número de teléfono
            phoneNumber = phoneNumber.replace('@s.whatsapp.net', '')
            
            // Si el mensaje está vacío, no guardar
            if (!message?.trim()) {
                console.log('⚠️ Mensaje vacío, no se guardará en historial')
                return null
            }

            console.log('💾 Guardando entrada en historial:', {
                chatbotId,
                phone: phoneNumber,
                msgLength: message.length,
                respLength: response?.length
            })

            // Generate embedding for the message for future semantic search
            let embedding = null
            try {
                embedding = await OpenAIService.generateEmbedding(message)
            } catch (embeddingError) {
                console.error('Error generando embedding:', embeddingError)
                // Continuar sin embedding si falla
            }

            const { data, error } = await connection
                .from(TABLES.CHAT_HISTORY)
                .insert({
                    user_id: userId,
                    chatbot_id: chatbotId,
                    phone_number: phoneNumber,
                    message: message,
                    response: response,
                    embedding: embedding,
                    created_at: new Date().toISOString()
                })
                .select()
                .single()

            if (error) throw new Error(error.message)
            
            // Invalidar caché de historial
            const cacheKey = `chat_history_${chatbotId}_${phoneNumber}`
            await ResponseCache.delete(chatbotId, cacheKey)
            
            console.log('✅ Historial guardado exitosamente')
            return data
        } catch (error) {
            console.error('❌ Error guardando historial:', error)
            throw error
        } finally {
            pool.releaseConnection(connection)
        }
    },

    async getRecentHistory(chatbotId, phoneNumber, limit = CONFIG.MAX_CHAT_HISTORY) {
        const connection = await pool.getConnection()
        try {
            // Intentar obtener del caché
            const cacheKey = `chat_history_${chatbotId}_${phoneNumber}`
            const cached = await ResponseCache.get(chatbotId, cacheKey)
            if (cached) {
                return cached
            }

            const { data, error } = await connection
                .from(TABLES.CHAT_HISTORY)
                .select('message, response, created_at')
                .eq('chatbot_id', chatbotId)
                .eq('phone_number', phoneNumber)
                .order('created_at', { ascending: false })
                .limit(limit)

            if (error) throw new Error(error.message)
            
            const result = data.reverse() // Return in chronological order
            
            // Guardar en caché por 1 minuto
            await ResponseCache.set(chatbotId, cacheKey, result)
            
            return result
        } finally {
            pool.releaseConnection(connection)
        }
    },

    async findSimilarConversations(chatbotId, query, limit = 5) {
        const connection = await pool.getConnection()
        try {
            // Generate embedding for the query
            const queryEmbedding = await OpenAIService.generateEmbedding(query)

            // Perform similarity search using the embedding
            const { data, error } = await connection
                .rpc('match_chat_history', {
                    query_embedding: queryEmbedding,
                    match_threshold: 0.7, // Similarity threshold
                    match_count: limit,
                    p_chatbot_id: chatbotId
                })

            if (error) throw new Error(error.message)
            return data
        } catch (error) {
            console.error('Error finding similar conversations:', error)
            throw error
        } finally {
            pool.releaseConnection(connection)
        }
    },

    async cleanOldHistory(chatbotId, daysToKeep = 30) {
        const connection = await pool.getConnection()
        try {
            const cutoffDate = new Date()
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

            const { error } = await connection
                .from(TABLES.CHAT_HISTORY)
                .delete()
                .eq('chatbot_id', chatbotId)
                .lt('created_at', cutoffDate.toISOString())

            if (error) throw new Error(error.message)
            
            // Limpiar todos los cachés relacionados con este chatbot
            const cachePattern = `chat_history_${chatbotId}_*`
            await ResponseCache.clearPattern(cachePattern)
            
            console.log('🧹 Historial antiguo limpiado exitosamente')
            return true
        } catch (error) {
            console.error('Error limpiando historial:', error)
            throw error
        } finally {
            pool.releaseConnection(connection)
        }
    }
}