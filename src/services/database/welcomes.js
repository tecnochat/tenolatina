import supabase, { pool } from '../../config/supabase.js'
import { TABLES, CONFIG } from '../../config/constants.js'
import { ResponseCache } from '../cache/response-cache.js'

export const WelcomeService = {
    async createWelcome(userId, chatbotId, welcomeMessage, mediaUrl = null) {
        const connection = await pool.getConnection()
        try {
            const { data, error } = await connection
                .from(TABLES.WELCOMES)
                .insert({
                    user_id: userId,
                    chatbot_id: chatbotId,
                    welcome_message: welcomeMessage,
                    media_url: mediaUrl,
                    is_active: true
                })
                .select()
                .single()

            if (error) throw new Error(error.message)

            // Invalidar caché
            await ResponseCache.delete(chatbotId, `active_welcome_${chatbotId}`)

            return data
        } finally {
            pool.releaseConnection(connection)
        }
    },

    async getActiveWelcome(chatbotId) {
        const connection = await pool.getConnection()
        try {
            // Intentar obtener del caché
            const cacheKey = `active_welcome_${chatbotId}`
            const cached = await ResponseCache.get(chatbotId, cacheKey)
            if (cached) {
                return cached
            }

            const { data, error } = await connection
                .from(TABLES.WELCOMES)
                .select('*')
                .eq('chatbot_id', chatbotId)
                .eq('is_active', true)
                .single()

            if (error && error.code !== 'PGRST116') throw new Error(error.message)

            // Guardar en caché por 5 minutos si hay datos
            if (data) {
                await ResponseCache.set(chatbotId, cacheKey, data)
            }

            return data
        } finally {
            pool.releaseConnection(connection)
        }
    },

    async trackWelcomeMessage(welcomeId, phoneNumber) {
        const connection = await pool.getConnection()
        try {
            // Clave de caché para el tracking
            const trackingKey = `welcome_track_${welcomeId}_${phoneNumber}`
            
            // Verificar caché primero
            const cached = await ResponseCache.get(welcomeId, trackingKey)
            if (cached) {
                return false
            }

            // Obtener el welcome para conseguir el user_id
            const { data: welcome } = await connection
                .from('welcomes')
                .select('user_id')
                .eq('id', welcomeId)
                .single()

            if (!welcome) {
                throw new Error('Welcome message not found')
            }

            // Verificar si ya existe un tracking reciente
            const { data: existing } = await connection
                .from('welcome_tracking')
                .select('id')
                .eq('welcome_id', welcomeId)
                .eq('phone_number', phoneNumber)
                .eq('user_id', welcome.user_id)
                .gte('expires_at', new Date().toISOString())
                .single()

            if (existing) {
                // Guardar en caché para evitar consultas repetidas
                await ResponseCache.set(welcomeId, trackingKey, true, 86400) // 24 horas
                return false
            }

            // Insertar nuevo tracking con user_id
            const expiresAt = new Date()
            expiresAt.setDate(expiresAt.getDate() + 1)

            const { error } = await connection
                .from('welcome_tracking')
                .insert({
                    welcome_id: welcomeId,
                    phone_number: phoneNumber,
                    user_id: welcome.user_id,
                    sent_at: new Date().toISOString(),
                    expires_at: expiresAt.toISOString()
                })

            if (error) throw error

            // Guardar en caché
            await ResponseCache.set(welcomeId, trackingKey, true, 86400)

            return true
        } catch (error) {
            console.error('Error tracking welcome message:', error)
            return true // En caso de error, permitir enviar el mensaje
        } finally {
            pool.releaseConnection(connection)
        }
    },

    async cleanOldWelcomeTracking() {
        const connection = await pool.getConnection()
        try {
            const { error } = await connection
                .from(TABLES.WELCOME_TRACKING)
                .delete()
                .lt('expires_at', new Date().toISOString())

            if (error) {
                console.error('Error cleaning old welcome tracking:', error)
            } else {
                console.log('Cleaned old welcome tracking records')
            }
        } catch (error) {
            console.error('Error in cleanOldWelcomeTracking:', error)
        } finally {
            pool.releaseConnection(connection)
        }
    },

    async updateWelcome(welcomeId, userId, updates) {
        const connection = await pool.getConnection()
        try {
            const { data, error } = await connection
                .from(TABLES.WELCOMES)
                .update(updates)
                .eq('id', welcomeId)
                .eq('user_id', userId)
                .select()
                .single()

            if (error) throw new Error(error.message)

            // Invalidar caché si se actualiza
            if (data?.chatbot_id) {
                await ResponseCache.delete(data.chatbot_id, `active_welcome_${data.chatbot_id}`)
            }

            return data
        } finally {
            pool.releaseConnection(connection)
        }
    },

    async deleteWelcome(welcomeId, userId) {
        const connection = await pool.getConnection()
        try {
            // Primero obtener el chatbot_id para invalidar caché
            const { data: welcome } = await connection
                .from(TABLES.WELCOMES)
                .select('chatbot_id')
                .eq('id', welcomeId)
                .single()

            const { error } = await connection
                .from(TABLES.WELCOMES)
                .delete()
                .eq('id', welcomeId)
                .eq('user_id', userId)

            if (error) throw new Error(error.message)

            // Invalidar caché
            if (welcome?.chatbot_id) {
                await ResponseCache.delete(welcome.chatbot_id, `active_welcome_${welcome.chatbot_id}`)
            }

            return true
        } finally {
            pool.releaseConnection(connection)
        }
    }
}