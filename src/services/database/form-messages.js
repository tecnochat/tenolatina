import supabase from '../../config/supabase.js'

export const FormMessagesService = {
    async getFormMessages(chatbotId) {
        try {
            const { data, error } = await supabase
                .from('form_messages')
                .select('message_content, message_type')
                .eq('chatbot_id', chatbotId)
                .eq('is_active', true)
                .eq('message_type', 'registration')
                .single()

            if (error) throw error
            if (!data?.message_content) {
                throw new Error('No form messages configured for this chatbot')
            }

            return data.message_content
        } catch (error) {
            console.error('Error getting form messages:', error)
            throw error
        }
    },

    async updateMessages(chatbotId, messageContent) {
        const { error } = await supabase
            .from('form_messages')
            .upsert({
                chatbot_id: chatbotId,
                message_type: 'registration',
                message_content: messageContent,
                is_active: true,
                updated_at: new Date()
            })

        if (error) throw error
        return true
    }
}
