import supabase from '../../config/supabase.js'

export const BlacklistService = {
    async addToBlacklist(userId, chatbotId, phoneNumber) {
        try {
            const { data, error } = await supabase
                .from('blacklist')
                .upsert({
                    phone_number: phoneNumber,
                    chatbot_id: chatbotId,
                    user_id: userId,
                    is_active: true,
                    updated_at: new Date()
                })

            if (error) throw error
            return data
        } catch (error) {
            console.error('Error adding to blacklist:', error)
            throw error
        }
    },

    async removeFromBlacklist(chatbotId, phoneNumber) {
        try {
            const { data, error } = await supabase
                .from('blacklist')
                .update({ is_active: false, updated_at: new Date() })
                .match({ chatbot_id: chatbotId, phone_number: phoneNumber })

            if (error) throw error
            return data
        } catch (error) {
            console.error('Error removing from blacklist:', error)
            throw error
        }
    },

    async isBlacklisted(chatbotId, phoneNumber) {
        try {
            console.log('\n🔍 [BLACKLIST] Verificando:', { 
                chatbotId, 
                phoneNumber,
                timestamp: new Date().toISOString()
            })

            const normalizedPhone = phoneNumber.startsWith('57') ? 
                phoneNumber : 
                `57${phoneNumber}`

            const { data, error } = await supabase
                .from('blacklist')
                .select('*')
                .eq('chatbot_id', chatbotId)
                .eq('phone_number', normalizedPhone)
                .eq('is_active', true)
                .maybeSingle()

            if (error && error.code !== 'PGRST116') {
                throw error
            }

            const isBlocked = Boolean(data?.is_active)
            console.log('📋 [BLACKLIST] Resultado:', {
                found: !!data,
                isBlocked
            })
            
            return isBlocked
        } catch (error) {
            console.error('❌ [BLACKLIST] Error:', error)
            return false
        }
    }
}
