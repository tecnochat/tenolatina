import supabase, { pool } from '../../config/supabase.js'
import { TABLES, ERROR_MESSAGES } from '../../config/constants.js'
import { PortAssignmentService } from './port-assignment.js'
import { ResponseCache } from '../cache/response-cache.js'

export const ChatbotService = {
    async createChatbot(userId, name, description = '') {
        const connection = await pool.getConnection()
        try {
            const { data, error } = await connection
                .from(TABLES.CHATBOTS)
                .insert({
                    user_id: userId,
                    name_chatbot: name,
                    description: description,
                    is_active: true
                })
                .select()
                .single()

            if (error) throw new Error(error.message)
            return data
        } finally {
            pool.releaseConnection(connection)
        }
    },

    async getChatbot(chatbotId, userId) {
        const connection = await pool.getConnection()
        try {
            const { data, error } = await connection
                .from(TABLES.CHATBOTS)
                .select('*')
                .eq('id', chatbotId)
                .eq('user_id', userId)
                .single()

            if (error) throw new Error(error.message)
            return data
        } finally {
            pool.releaseConnection(connection)
        }
    },

    async listUserChatbots(userId) {
        const connection = await pool.getConnection()
        try {
            const { data, error } = await connection
                .from(TABLES.CHATBOTS)
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })

            if (error) throw new Error(error.message)
            return data
        } finally {
            pool.releaseConnection(connection)
        }
    },

    async updateChatbot(chatbotId, userId, updates) {
        const connection = await pool.getConnection()
        try {
            const { data, error } = await connection
                .from(TABLES.CHATBOTS)
                .update(updates)
                .eq('id', chatbotId)
                .eq('user_id', userId)
                .select()
                .single()

            if (error) throw new Error(error.message)
            return data
        } finally {
            pool.releaseConnection(connection)
        }
    },

    async toggleChatbotStatus(chatbotId, userId, isActive) {
        const connection = await pool.getConnection()
        try {
            const { data, error } = await connection
                .from(TABLES.CHATBOTS)
                .update({ is_active: isActive })
                .eq('id', chatbotId)
                .eq('user_id', userId)
                .select()
                .single()

            if (error) throw new Error(error.message)
            return data
        } finally {
            pool.releaseConnection(connection)
        }
    },

    async deleteChatbot(chatbotId, userId) {
        const connection = await pool.getConnection()
        try {
            const { error } = await connection
                .from(TABLES.CHATBOTS)
                .delete()
                .eq('id', chatbotId)
                .eq('user_id', userId)

            if (error) throw new Error(error.message)
            return true
        } finally {
            pool.releaseConnection(connection)
        }
    },

    async getActiveChatbotForPort() {
        const connection = await pool.getConnection()
        try {
            const port = process.env.PORT || 3010
            const userId = await PortAssignmentService.getUserIdByPort(port)

            if (!userId) {
                console.error('No se encontró user_id para el puerto:', port)
                return null
            }

            // Cache key para esta consulta frecuente
            const cacheKey = `active_chatbot_${userId}`
            
            // Intentar obtener del caché
            const cached = await ResponseCache.get(userId, cacheKey)
            if (cached) {
                return cached
            }

            // Modificación: Obtener el chatbot más reciente si hay varios
            const { data: chatbots, error } = await connection
                .from('chatbots')
                .select('*')
                .eq('user_id', userId)
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(1)

            if (error) throw error
            
            // Guardar en caché por 5 minutos
            const result = chatbots?.[0] || null
            if (result) {
                await ResponseCache.set(userId, cacheKey, result)
            }

            return result
        } catch (error) {
            console.error('Error getting active chatbot:', error)
            return null
        } finally {
            pool.releaseConnection(connection)
        }
    }
}