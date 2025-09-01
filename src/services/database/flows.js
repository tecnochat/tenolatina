import supabase, { pool } from '../../config/supabase.js'
import { TABLES } from '../../config/constants.js'
import { validators } from '../../utils/validators.js'
import { ResponseCache } from '../cache/response-cache.js'

export const FlowService = {
    async createFlow(userId, chatbotId, flowData) {
        const connection = await pool.getConnection()
        try {
            // Validar el flujo antes de crearlo
            const validation = validators.validateFlow(flowData)
            if (!validation.isValid) {
                throw new Error(validation.errors.join(', '))
            }

            const { data, error } = await connection
                .from(TABLES.BOT_FLOWS)
                .insert({
                    user_id: userId,
                    chatbot_id: chatbotId,
                    keyword: flowData.keyword,
                    response_text: flowData.response_text,
                    media_url: flowData.media_url,
                    is_active: true
                })
                .select()
                .single()

            if (error) throw new Error(error.message)

            // Invalidar caché de flujos activos
            await ResponseCache.delete(chatbotId, `active_flows_${chatbotId}`)

            return data
        } finally {
            pool.releaseConnection(connection)
        }
    },

    async getActiveFlows(chatbotId) {
        const connection = await pool.getConnection()
        try {
            // Intentar obtener del caché
            const cacheKey = `active_flows_${chatbotId}`
            const cached = await ResponseCache.get(chatbotId, cacheKey)
            if (cached) {
                return cached
            }

            const { data, error } = await connection
                .from(TABLES.BOT_FLOWS)
                .select('*')
                .eq('chatbot_id', chatbotId)
                .eq('is_active', true)

            if (error) throw new Error(error.message)

            // Guardar en caché por 5 minutos
            const result = data || []
            await ResponseCache.set(chatbotId, cacheKey, result)

            return result
        } finally {
            pool.releaseConnection(connection)
        }
    },

    async updateFlow(flowId, userId, updates) {
        const connection = await pool.getConnection()
        try {
            // Validar las actualizaciones si contienen datos del flujo
            if (updates.keyword || updates.response_text || updates.media_url) {
                const validation = validators.validateFlow({
                    keyword: updates.keyword,
                    response_text: updates.response_text,
                    media_url: updates.media_url
                })
                if (!validation.isValid) {
                    throw new Error(validation.errors.join(', '))
                }
            }

            const { data, error } = await connection
                .from(TABLES.BOT_FLOWS)
                .update(updates)
                .eq('id', flowId)
                .eq('user_id', userId)
                .select()
                .single()

            if (error) throw new Error(error.message)

            // Invalidar caché relacionado
            if (data?.chatbot_id) {
                await ResponseCache.delete(data.chatbot_id, `active_flows_${data.chatbot_id}`)
            }

            return data
        } finally {
            pool.releaseConnection(connection)
        }
    },

    async deleteFlow(flowId, userId) {
        const connection = await pool.getConnection()
        try {
            // Primero obtener el chatbot_id para invalidar caché
            const { data: flow } = await connection
                .from(TABLES.BOT_FLOWS)
                .select('chatbot_id')
                .eq('id', flowId)
                .single()

            const { error } = await connection
                .from(TABLES.BOT_FLOWS)
                .delete()
                .eq('id', flowId)
                .eq('user_id', userId)

            if (error) throw new Error(error.message)

            // Invalidar caché si encontramos el chatbot_id
            if (flow?.chatbot_id) {
                await ResponseCache.delete(flow.chatbot_id, `active_flows_${flow.chatbot_id}`)
            }

            return true
        } finally {
            pool.releaseConnection(connection)
        }
    },

    async toggleFlowStatus(flowId, userId, isActive) {
        const connection = await pool.getConnection()
        try {
            const { data, error } = await connection
                .from(TABLES.BOT_FLOWS)
                .update({ is_active: isActive })
                .eq('id', flowId)
                .eq('user_id', userId)
                .select()
                .single()

            if (error) throw new Error(error.message)

            // Invalidar caché relacionado
            if (data?.chatbot_id) {
                await ResponseCache.delete(data.chatbot_id, `active_flows_${data.chatbot_id}`)
            }

            return data
        } finally {
            pool.releaseConnection(connection)
        }
    }
}