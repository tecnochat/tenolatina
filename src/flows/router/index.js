import { addKeyword } from '@builderbot/bot'
import { ChatbotService } from '../../services/database/chatbots.js'
import { FlowService } from '../../services/database/flows.js'
import { ChatHistoryService } from '../../services/database/chat-history.js'
import { WelcomeService } from '../../services/database/welcomes.js'
import { PromptsService } from '../../services/database/prompts.js'
import { FormFieldsService } from '../../services/database/form-fields.js'
import { ClientDataService } from '../../services/database/clients.js'
import { BlacklistService } from '../../services/database/blacklist.js'
import { OpenAIService } from '../../services/ai/openai.js'
import { normalizeText } from '../../utils/text-utils.js'
import { getDataCollectionConfig } from '../data-collection/index.js'
import AudioTranscriber from '../../services/ai/audio-transcriber.js'
import TextToSpeechService from '../../services/ai/text-to-speech.js'
import path from 'path'
import fs from 'fs'

// Sistema de reintentos
const retry = async (fn, maxRetries = 3) => {
    let lastError
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn()
        } catch (error) {
            console.error(`Intento ${i + 1}/${maxRetries} falló:`, error)
            lastError = error
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000))
            }
        }
    }
    throw lastError
}

// Helper para manejar welcome
const handleWelcome = async (chatbot, phoneNumber, flowDynamic) => {
    const welcome = await WelcomeService.getActiveWelcome(chatbot.id)
    if (!welcome?.welcome_message) {
        return false
    }

    const shouldSendWelcome = await WelcomeService.trackWelcomeMessage(welcome.id, phoneNumber)
    if (!shouldSendWelcome) {
        return false
    }

    console.log('👋 Enviando welcome a:', phoneNumber)
    if (welcome.media_url) {
        await flowDynamic([{
            body: welcome.welcome_message,
            media: welcome.media_url
        }])
    } else {
        await flowDynamic(welcome.welcome_message)
    }
    return true
}

// Helper para manejar keywords
const handleDynamic = async (chatbot, phoneNumber, message, flowDynamic) => {
    // Buscar coincidencia en tiempo real
    const flows = await FlowService.getActiveFlows(chatbot.id)
    const matchingFlow = flows?.find(flow => 
        flow.keyword?.some(k => normalizeText(k) === normalizeText(message))
    )

    if (!matchingFlow) {
        return false
    }

    console.log('✨ Coincidencia encontrada:', matchingFlow.id)

    // Guardar en historial
    await ChatHistoryService.addEntry(
        chatbot.user_id,
        chatbot.id,
        phoneNumber,
        message,
        matchingFlow.response_text
    )

    // Enviar respuesta
    if (matchingFlow.media_url) {
        if (matchingFlow.media_url.toLowerCase().endsWith('.mp3')) {
            await flowDynamic([{
                media: matchingFlow.media_url
            }])
            await flowDynamic(matchingFlow.response_text)
        } else {
            await flowDynamic([{
                body: matchingFlow.response_text,
                media: matchingFlow.media_url
            }])
        }
    } else {
        await flowDynamic(matchingFlow.response_text)
    }

    return true
}

// Helper para manejar DataCollection
const handleDataCollection = async (chatbot, phoneNumber, message, flowDynamic, state) => {
    // Obtener configuración de DataCollection
    const config = await getDataCollectionConfig()
    if (!config) {
        return false
    }

    // Verificar si hay coincidencia con keywords
    const isDataCollectionTrigger = config.trigger_words.some(
        word => word === normalizeText(message)
    )

    if (!isDataCollectionTrigger) {
        return false
    }

    console.log('📝 Coincidencia encontrada en DataCollection')
    
    // Inicializar estado
    await state.update({
        currentField: 0,
        fields: config.fields,
        answers: {},
        messages: config.messages
    })

    // Enviar mensaje de bienvenida y primer campo
    await flowDynamic(config.messages.welcome_message)
    await flowDynamic(config.fields[0].field_label)
    
    return true
}

// Helper para manejar IA
const handleAI = async (chatbot, phoneNumber, message, flowDynamic, isAudioMessage = false) => {
    console.log('🤖 Procesando con IA:', message)

    const [history, behaviorPrompt, knowledgePrompts] = await Promise.all([
        ChatHistoryService.getRecentHistory(chatbot.id, phoneNumber),
        PromptsService.getActiveBehaviorPrompt(chatbot.id),
        PromptsService.getActiveKnowledgePrompts(chatbot.id)
    ])

    // Verificar si hay prompt de comportamiento configurado
    if (!behaviorPrompt) {
        console.log('🤖 IA: No hay prompt de comportamiento - Finalizando sin respuesta')
        return false
    }

    const messages = history.slice(-5).flatMap(entry => [
        { role: 'user', content: entry.message },
        { role: 'assistant', content: entry.response }
    ])
    messages.push({ role: 'user', content: message })

    console.log('🤖 IA: Prompts obtenidos:', {
        behavior: behaviorPrompt?.id,
        knowledge: knowledgePrompts?.length || 0
    })

    const aiResponse = await OpenAIService.generateChatResponse(
        messages,
        behaviorPrompt.prompt_text,
        knowledgePrompts?.map(p => p.prompt_text).join('\n\n') || '',
        isAudioMessage,
        chatbot.id
    )

    // Guardar en historial
    await ChatHistoryService.addEntry(
        chatbot.user_id,
        chatbot.id,
        phoneNumber,
        message,
        aiResponse
    )

    // Enviar respuesta según el tipo de mensaje
    if (isAudioMessage) {
        try {
            // Primero enviar la respuesta en texto
            await flowDynamic(aiResponse)
            
            console.log('🔊 Generando respuesta de audio...')
            const audioPath = await TextToSpeechService.convertToSpeech(aiResponse)
            
            // Luego enviar el mismo mensaje en audio
            await flowDynamic([{
                media: audioPath,
                ptt: true,
                type: 'audio'
            }])

            console.log('✅ Respuesta enviada en texto y audio')

            // Limpiar archivo temporal inmediatamente después de enviarlo
            if (fs.existsSync(audioPath)) {
                await fs.promises.unlink(audioPath)
                console.log('🧹 Archivo temporal eliminado')
            }
        } catch (audioError) {
            console.error('❌ Error en proceso de audio:', audioError)
            // Ya se envió el texto, no necesitamos fallback
        }
    } else {
        // Solo texto para mensajes de texto
        await flowDynamic(aiResponse)
    }

    console.log('✅ Respuesta IA enviada')
    return true
}

// Asegurar que existe el directorio temporal
const ensureTmpDir = () => {
    const tmpDir = path.join(process.cwd(), 'tmp')
    if (!fs.existsSync(tmpDir)) {
        console.log('📁 Creando directorio temporal:', tmpDir)
        fs.mkdirSync(tmpDir, { recursive: true, mode: 0o755 })
    }
    return tmpDir
}

export const createRouterFlow = () => {
    console.log('🚀 Inicializando Message Router')
    
    // Crear directorio tmp al iniciar
    ensureTmpDir()

    const routerFlow = addKeyword([])
    .addAction(async (ctx, { flowDynamic, endFlow, state }) => {
        try {
            if (!ctx?.from) {
                return endFlow()
            }

            const phoneNumber = ctx.from.replace('@s.whatsapp.net', '')
            let message = ctx.body?.toLowerCase().trim() || ''
            
            // Detectar si es mensaje de voz
            const isAudioMessage = Boolean(ctx.message?.audioMessage || ctx.message?.pttMessage)
            console.log('📩 Mensaje recibido de:', phoneNumber, isAudioMessage ? '(audio)' : '(texto)')

            // 1. Obtener chatbot
            const chatbot = await retry(async () => {
                const bot = await ChatbotService.getActiveChatbotForPort()
                if (!bot) throw new Error('No se encontró chatbot activo')
                return bot
            })

            // 2. Verificar blacklist
            const isBlacklisted = await BlacklistService.isBlacklisted(chatbot.id, phoneNumber)
            if (isBlacklisted) {
                console.log('🚫 MENSAJE BLOQUEADO - Número en lista negra:', phoneNumber)
                return endFlow()
            }

            // 3. Procesar Welcome (sin return si se envía)
            await handleWelcome(chatbot, phoneNumber, flowDynamic)

            // 4. Procesar Dynamic
            const dynamicHandled = await handleDynamic(chatbot, phoneNumber, message, flowDynamic)
            if (dynamicHandled) {
                return endFlow()
            }

            // 5. Verificar si hay proceso de captura activo
            const currentState = state.getMyState()
            if (currentState?.fields) {
                return // Si hay captura activa, no procesar nada más
            }

            // 6. Intentar iniciar DataCollection
            const dataCollectionHandled = await handleDataCollection(chatbot, phoneNumber, message, flowDynamic, state)
            if (dataCollectionHandled) {
                return // No terminar el flujo para permitir la captura de datos
            }

            // 7. Procesar mensaje de voz o AI
            if (isAudioMessage) {
                try {
                    await flowDynamic('Procesando mensaje de voz...')
                    const transcription = await AudioTranscriber.transcribeAudio(ctx, null)
                    
                    if (!transcription) {
                        throw new Error('No se pudo transcribir el audio')
                    }

                    message = transcription
                    console.log('🎤 Audio transcrito:', message)
                } catch (audioError) {
                    console.error('Error procesando audio:', audioError)
                    await flowDynamic('No pude procesar el mensaje de voz correctamente.')
                    return endFlow()
                }
            }

            // Procesar con AI solo si no hay captura activa ni match previo
            const aiHandled = await handleAI(chatbot, phoneNumber, message, flowDynamic, isAudioMessage)
            if (!aiHandled) {
                console.log('🤖 IA: No hay configuración de IA - No se envía respuesta')
            }

        } catch (error) {
            await handleError(error, flowDynamic)
        }

        return endFlow()
    })

    // Agregar capturador de respuestas para DataCollection
    // Capturador de respuestas del formulario
    .addAnswer('', { capture: true }, async (ctx, { fallBack, state, endFlow, flowDynamic }) => {
        const currentState = state.getMyState()
        if (!currentState?.fields) return

        try {
            const input = ctx.body.trim()
            const currentField = currentState.fields[currentState.currentField]

            // Manejar cancelación
            if (input.toLowerCase() === 'cancelar') {
                // Usar el mensaje configurable de cancelación
                const cancelMessage = currentState.messages?.cancel_message || 'Registro cancelado'
                await flowDynamic(cancelMessage)
                await state.clear()
                return endFlow()
            }

            // Validar y procesar respuesta
            if (!await validateAndSaveResponse(input, currentState, state, flowDynamic, fallBack)) {
                return
            }

            // Si hay más campos, continuar
            if (currentState.currentField < currentState.fields.length - 1) {
                return await moveToNextField(currentState, state, fallBack)
            }

            // Completar proceso
            await completeFormSubmission(currentState, ctx, flowDynamic)
            await state.clear()
            return endFlow()

        } catch (error) {
            await handleError(error, flowDynamic, fallBack, currentState)
        }
    })

// Funciones auxiliares para el manejo del formulario
const validateAndSaveResponse = async (input, currentState, state, flowDynamic, fallBack) => {
    try {
        const currentField = currentState.fields[currentState.currentField]

        // Si es campo de nombre, solo verificar que no esté vacío
        if (currentField.field_name === 'nombres' || currentField.validation_type === 'name') {
            if (!input.trim()) {
                await flowDynamic('❌ El nombre no puede estar vacío.')
                await fallBack(currentField.field_label)
                return false
            }
        } else {
            // Para otros campos, usar la validación normal
            const isValid = await FormFieldsService.validateField(
                input,
                currentField.validation_type
            )

            if (!isValid) {
                await flowDynamic('❌ Respuesta no válida.')
                await fallBack(currentField.field_label)
                return false
            }
        }

        // Guardar respuesta
        currentState.answers[currentField.field_name] = input
        await state.update(currentState)
        return true

    } catch (error) {
        throw Object.assign(error, { name: 'ValidationError' })
    }
}

const moveToNextField = async (currentState, state, fallBack) => {
    currentState.currentField++
    await state.update(currentState)
    return fallBack(currentState.fields[currentState.currentField].field_label)
}

const completeFormSubmission = async (currentState, ctx, flowDynamic) => {
    try {
        const chatbot = await ChatbotService.getActiveChatbotForPort()
        const formAnswers = {
            ...currentState.answers,
            phone_number: ctx.from
        }

        if (formAnswers.nombres) {
            formAnswers.full_name = formAnswers.nombres
        }

        // Guardar datos
        await ClientDataService.createClientData(
            chatbot.user_id,
            chatbot.id,
            formAnswers
        )

        // Registrar en historial
        await ChatHistoryService.addEntry(
            chatbot.user_id,
            chatbot.id,
            ctx.from,
            'registro completado',
            currentState.messages.success_message
        )

        // Mostrar resumen
        let summaryMessage = `${currentState.messages.success_message}\n\n📋 Resumen de datos registrados:\n`
        Object.entries(currentState.answers).forEach(([field, value]) => {
            const fieldConfig = currentState.fields.find(f => f.field_name === field)
            if (fieldConfig) {
                summaryMessage += `${fieldConfig.field_label}: ${value}\n`
            }
        })

        await flowDynamic(summaryMessage)

    } catch (error) {
        throw Object.assign(error, { name: 'DatabaseError' })
    }
}

// Sistema centralizado de manejo de errores
const handleError = async (error, flowDynamic, fallBack, state) => {
    console.error('❌ Error:', error)
    
    let errorMessage = 'Lo siento, ocurrió un error al procesar tu mensaje.'

    // Errores específicos
    if (error.name === 'ValidationError') {
        errorMessage = '❌ La respuesta proporcionada no es válida.'
    } else if (error.name === 'DatabaseError') {
        errorMessage = '❌ Error al guardar los datos. Por favor, intenta nuevamente.'
    } else if (error.message?.includes('transcribir')) {
        errorMessage = '❌ No pude entender el mensaje de voz. Por favor, intenta hablar más claro o envía un mensaje de texto.'
    } else if (error.code === 'ENOENT' && error.path?.includes('tmp')) {
        errorMessage = '❌ Error al procesar el audio. Por favor, intenta nuevamente.'
        // Intentar crear el directorio tmp si no existe
        ensureTmpDir()
    }

    await flowDynamic(errorMessage)

    // Si estamos en proceso de captura, repetir la pregunta actual
    if (state?.fields && fallBack) {
        const currentField = state.fields[state.currentField]
        if (currentField?.field_label) {
            return fallBack(currentField.field_label)
        }
    }

    return null
}

    return routerFlow
}