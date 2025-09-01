import supabase from '../../config/supabase.js'
import { TABLES } from '../../config/constants.js'

export const ClientDataService = {
    async createClientData(userId, chatbotId, clientData) {
        try {
            const { phone_number, ...formData } = clientData

            const { data, error } = await supabase
                .from(TABLES.CLIENT_DATA)
                .insert({
                    user_id: userId,
                    chatbot_id: chatbotId,
                    phone_number: phone_number,
                    form_data: formData,
                    created_at: new Date()
                })
                .select()
                .single()

            if (error) throw error
            return data
        } catch (error) {
            console.error('Error creating client data:', error)
            throw error
        }
    },

    async getClientByPhone(chatbotId, phoneNumber) {
        const { data, error } = await supabase
            .from(TABLES.CLIENT_DATA)
            .select('*')
            .eq('chatbot_id', chatbotId)
            .eq('phone_number', phoneNumber)
            .single()

        if (error && error.code !== 'PGRST116') throw new Error(error.message)
        return data
    },

    async getClientById(chatbotId, identificationNumber) {
        const { data, error } = await supabase
            .from(TABLES.CLIENT_DATA)
            .select('*')
            .eq('chatbot_id', chatbotId)
            .eq('identification_number', identificationNumber)
            .single()

        if (error && error.code !== 'PGRST116') throw new Error(error.message)
        return data
    },

    async updateClientData(userId, clientId, updates) {
        // Validate updates if they contain client data
        if (Object.keys(updates).length > 0) {
            const validation = validators.validateClientData({ ...updates })
            if (!validation.isValid) {
                throw new Error(validation.errors.join(', '))
            }
        }

        const { data, error } = await supabase
            .from(TABLES.CLIENT_DATA)
            .update(updates)
            .eq('id', clientId)
            .eq('user_id', userId)
            .select()
            .single()

        if (error) throw new Error(error.message)
        return data
    },

    async getAllClientData() {
        const { data, error } = await supabase
            .from(TABLES.CLIENT_DATA)
            .select('*')
            .order('created_at', { ascending: false })

        if (error) throw new Error(error.message)
        return data || []
    }
}