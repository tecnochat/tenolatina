/**
 * @deprecated This flow is being migrated to the AI flow for better flow control
 * The welcome message functionality will be handled by the AI flow to prevent conflicts
 */

import { addKeyword, EVENTS } from '@builderbot/bot'
import { ChatbotService } from '../../services/database/chatbots.js'
import { WelcomeService } from '../../services/database/welcomes.js'

// Constantes para configuración
const CONFIG = {
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000, // 1 segundo
}

export const createWelcomeFlow = () => {
    console.log('Creating welcome flow...')
    
    const flow = addKeyword(EVENTS.WELCOME, {
        sensitive: false,
        position: 'before'
    })
    .addAction(async (ctx, { flowDynamic }) => {
        try {
            // Validación inicial del contexto
            if (!ctx?.from) {
                console.error('❌ Contexto inválido')
                return true
            }

            const phoneNumber = ctx.from.replace('@s.whatsapp.net', '')
            console.log('📱 Mensaje recibido de:', phoneNumber)
            
            // Implementar retry para operaciones críticas
            const chatbot = await retry(() => 
                ChatbotService.getActiveChatbotByPhone(phoneNumber), 
                CONFIG.MAX_RETRIES
            )
            
            if (!chatbot) {
                console.log('❌ No se encontró un chatbot activo')
                return true
            }

            const welcome = await retry(() => 
                WelcomeService.getActiveWelcome(chatbot.id), 
                CONFIG.MAX_RETRIES
            )
            
            if (!welcome?.welcome_message) {
                console.log('❌ No se encontró mensaje de bienvenida válido')
                return true
            }

            const shouldSendWelcome = await WelcomeService.trackWelcomeMessage(welcome.id, phoneNumber)
            if (!shouldSendWelcome) {
                console.log('ℹ️ Mensaje de bienvenida ya enviado')
                return true
            }

            // Enviar mensaje de bienvenida con retry
            await retry(async () => {
                try {
                    if (welcome.media_url) {
                        await flowDynamic([{
                            body: welcome.welcome_message,
                            media: welcome.media_url
                        }])
                        console.log('✅ Mensaje con media enviado')
                    } else {
                        await flowDynamic(welcome.welcome_message)
                        console.log('✅ Mensaje de texto enviado')
                    }
                } catch (sendError) {
                    console.error('❌ Error enviando mensaje:', sendError)
                    // Fallback a mensaje de texto
                    await flowDynamic(welcome.welcome_message)
                }
            }, CONFIG.MAX_RETRIES)

            return true

        } catch (error) {
            console.error('❌ Error en el flujo de bienvenida:', error)
            return true
        }
    })

    return flow
}

// Función helper para reintentos
async function retry(fn, maxRetries) {
    let lastError
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn()
        } catch (error) {
            console.error(`Intento ${i + 1}/${maxRetries} falló:`, error)
            lastError = error
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY))
            }
        }
    }
    
    throw lastError
}