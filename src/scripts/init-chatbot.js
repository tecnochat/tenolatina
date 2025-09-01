import dotenv from 'dotenv'
import { ChatbotService } from '../services/database/chatbots.js'
import { WelcomeService } from '../services/database/welcomes.js'
import { PromptsService } from '../services/database/prompts.js'

dotenv.config()

const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID

const initChatbot = async () => {
    try {
        // 1. Create a chatbot
        console.log('Creating chatbot...')
        const chatbot = await ChatbotService.createChatbot(
            DEFAULT_USER_ID,
            'TecnoBot Demo',
            'Chatbot de demostración con IA y captura de datos'
        )
        console.log('Chatbot created:', chatbot)

        // 2. Create welcome message
        console.log('Creating welcome message...')
        const welcome = await WelcomeService.createWelcome(
            DEFAULT_USER_ID,
            chatbot.id,
            `¡Hola! 👋 Soy ${chatbot.name_chatbot}, tu asistente virtual.

Me puedes preguntar cualquier cosa sobre nuestros productos y servicios.
También puedo ayudarte a:
- Registrar tus datos
- Resolver dudas
- Proporcionar información

¿En qué puedo ayudarte hoy?`
        )
        console.log('Welcome message created:', welcome)

        // 3. Create behavior prompt
        console.log('Creating behavior prompt...')
        const behaviorPrompt = await PromptsService.createBehaviorPrompt(
            DEFAULT_USER_ID,
            chatbot.id,
            `Eres un asistente virtual profesional y amigable llamado ${chatbot.name_chatbot}.

Directrices de comportamiento:
1. Sé amable y profesional en todo momento
2. Usa un lenguaje claro y conciso
3. Si no estás seguro de una respuesta, admítelo
4. Mantén las respuestas breves pero informativas
5. Usa emojis ocasionalmente para dar un toque amigable
6. Si el usuario necesita registrarse, sugiérele escribir "registro"
7. Si no puedes ayudar con algo específico, ofrece alternativas

Tu objetivo es ayudar a los usuarios de la manera más eficiente y amable posible.`
        )
        console.log('Behavior prompt created:', behaviorPrompt)

        // 4. Create knowledge prompts
        console.log('Creating knowledge prompts...')
        const knowledgePrompts = await Promise.all([
            PromptsService.createKnowledgePrompt(
                DEFAULT_USER_ID,
                chatbot.id,
                `Información General de la Empresa:
- Somos una empresa tecnológica especializada en soluciones digitales
- Horario de atención: Lunes a Viernes de 9:00 AM a 6:00 PM
- Ubicación: Ciudad de México
- Teléfono: +52 55 1234 5678
- Email: info@tecnobot.com`,
                'general'
            ),
            PromptsService.createKnowledgePrompt(
                DEFAULT_USER_ID,
                chatbot.id,
                `Productos y Servicios:
1. Desarrollo de Software
   - Aplicaciones Web
   - Aplicaciones Móviles
   - Sistemas Empresariales
2. Consultoría IT
   - Asesoría Tecnológica
   - Transformación Digital
3. Soporte Técnico
   - Soporte 24/7
   - Mantenimiento Preventivo`,
                'productos'
            ),
            PromptsService.createKnowledgePrompt(
                DEFAULT_USER_ID,
                chatbot.id,
                `Políticas de Servicio:
- Garantía de satisfacción del cliente
- Soporte técnico incluido por 3 meses
- Actualizaciones gratuitas durante el primer año
- Confidencialidad de datos garantizada
- Tiempo de respuesta máximo: 24 horas hábiles`,
                'politicas'
            )
        ])
        console.log('Knowledge prompts created:', knowledgePrompts)

        console.log('¡Inicialización completada con éxito!')
        return { chatbot, welcome, behaviorPrompt, knowledgePrompts }
    } catch (error) {
        console.error('Error durante la inicialización:', error)
        throw error
    }
}

// Ejecutar la inicialización
initChatbot()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Error fatal:', error)
        process.exit(1)
    }) 