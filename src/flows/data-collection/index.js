import { addKeyword } from '@builderbot/bot'
import { ClientDataService } from '../../services/database/clients.js'
import { ChatbotService } from '../../services/database/chatbots.js'
import { FormFieldsService } from '../../services/database/form-fields.js'
import { FormMessagesService } from '../../services/database/form-messages.js'
import { ChatHistoryService } from '../../services/database/chat-history.js'
import { normalizeText } from '../../utils/text-utils.js'

/**
 * Retorna la configuración necesaria para el flujo de recolección de datos
 */
export const getDataCollectionConfig = async () => {
    try {
        const chatbot = await ChatbotService.getActiveChatbotForPort()
        if (!chatbot) {
            console.log('❌ No se encontró chatbot activo')
            return null
        }

        // Obtener configuración del formulario
        const [formMessages, formFields] = await Promise.all([
            FormMessagesService.getFormMessages(chatbot.id),
            FormFieldsService.getFormFields(chatbot.id)
        ])

        if (!formMessages?.trigger_words?.length || !formFields?.length) {
            console.log('❌ Configuración incompleta del formulario')
            return null
        }

        // Retornar configuración procesada
        return {
            messages: formMessages,
            fields: formFields.sort((a, b) => a.order_index - b.order_index),
            trigger_words: formMessages.trigger_words.map(normalizeText)
        }
    } catch (error) {
        console.error('Error obteniendo configuración:', error)
        return null
    }
}
