import supabase from '../../config/supabase.js'

export const FormFieldsService = {
    async getFormFields(chatbotId) {
        const { data, error } = await supabase
            .from('form_fields')
            .select('*')
            .eq('chatbot_id', chatbotId)
            .order('order_index', { ascending: true })

        if (error) throw error
        return data || []
    },

    async validateField(value, validationType) {
        if (!value || value.trim() === '') {
            return false
        }

        switch (validationType) {
            case 'text':
                return value.length > 0
            case 'email':
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
            case 'number':
                return !isNaN(value) && value.length > 0
            case 'phone':
                return /^\d{10,}$/.test(value)
            default:
                return true
        }
    }
}
