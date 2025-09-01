import dotenv from 'dotenv'
import { ChatbotService } from '../services/database/chatbots.js'
import supabase from '../config/supabase.js'

dotenv.config()

const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID

const initFormMessages = async () => {
    try {
        console.log('🚀 Iniciando configuración de mensajes del formulario...')

        const chatbots = await ChatbotService.listUserChatbots(DEFAULT_USER_ID)
        const chatbot = chatbots[0]

        const messages = {
            trigger_words: ['registro', 'registrar', 'registrarme'],
            welcome_message: '📝 Iniciemos tu registro. Escribe "cancelar" para detener el proceso.',
            success_message: ['✅ Registro completado exitosamente.', '¡Gracias por registrarte! 🎉'],
            cancel_message: 'Registro cancelado'
        }

        const { error } = await supabase
            .from('form_messages')
            .upsert({
                chatbot_id: chatbot.id,
                message_type: 'registration',
                message_content: messages,
                is_active: true,
                updated_at: new Date()
            })

        if (error) throw error
        console.log('✅ Mensajes del formulario creados exitosamente')

    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    }
}

initFormMessages()
    .then(() => console.log('🎉 Proceso completado'))
    .catch(error => {
        console.error('💥 Error fatal:', error)
        process.exit(1)
    })
