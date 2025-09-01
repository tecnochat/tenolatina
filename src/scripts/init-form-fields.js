import dotenv from 'dotenv'
import { ChatbotService } from '../services/database/chatbots.js'
import supabase from '../config/supabase.js'

dotenv.config()

const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID

const initFormFields = async () => {
    try {
        console.log('🚀 Iniciando configuración de campos del formulario...')

        const chatbots = await ChatbotService.listUserChatbots(DEFAULT_USER_ID)
        if (!chatbots?.length) {
            throw new Error('No se encontró ningún chatbot')
        }
        const chatbot = chatbots[0]
        
        const formFields = [
            {
                field_name: 'nombres',
                field_label: '¿Cuál es tu nombre completo?',
                field_type: 'text',
                validation_type: 'text',
                is_required: true,
                order_index: 1
            },
            {
                field_name: 'edad',
                field_label: '¿Cuál es tu edad?',
                field_type: 'number',
                validation_type: 'number',
                is_required: true,
                order_index: 2
            },
            {
                field_name: 'ciudad',
                field_label: '¿En qué ciudad vives?',
                field_type: 'text',
                validation_type: 'text',
                is_required: true,
                order_index: 3
            },
            {
                field_name: 'email',
                field_label: '¿Cuál es tu correo electrónico?',
                field_type: 'email',
                validation_type: 'email',
                is_required: true,
                order_index: 4
            }
        ]

        const { data, error } = await supabase
            .from('form_fields')
            .upsert(
                formFields.map(field => ({
                    ...field,
                    chatbot_id: chatbot.id,
                    updated_at: new Date()
                })),
                { onConflict: 'chatbot_id,field_name' }
            )

        if (error) throw error
        console.log('✅ Campos del formulario creados exitosamente')

    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    }
}

initFormFields()
    .then(() => console.log('🎉 Proceso completado'))
    .catch(error => {
        console.error('💥 Error fatal:', error)
        process.exit(1)
    })
