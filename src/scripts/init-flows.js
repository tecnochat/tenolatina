import dotenv from 'dotenv'
import { ChatbotService } from '../services/database/chatbots.js'
import { FlowService } from '../services/database/flows.js'

dotenv.config()

const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID

const initFlows = async () => {
    try {
        console.log('🚀 Iniciando creación de flujos...')

        // 1. Obtener el chatbot más reciente
        const chatbots = await ChatbotService.listUserChatbots(DEFAULT_USER_ID)
        if (!chatbots || chatbots.length === 0) {
            throw new Error('No se encontró ningún chatbot')
        }
        const chatbot = chatbots[0]
        console.log('🤖 Usando chatbot:', chatbot.name_chatbot)

        // 2. Crear flujos de prueba
        const flows = [
            {
                keyword: ['menu', 'servicios', 'productos'],
                response_text: `🌟 Nuestros Servicios:

1. 💻 Desarrollo Web
   - Sitios corporativos
   - E-commerce
   - Aplicaciones web

2. 📱 Desarrollo Móvil
   - Apps Android
   - Apps iOS
   - Apps híbridas

3. 🤖 Inteligencia Artificial
   - Chatbots
   - Automatización
   - Análisis de datos

¿En cuál de nuestros servicios estás interesado?`,
                priority: 1
            },
            {
                keyword: ['precio', 'costo', 'valor', 'planes'],
                response_text: `💰 Nuestros Planes:

📦 Plan Básico: $500
- Web responsive
- Hosting incluido
- Soporte básico

🌟 Plan Pro: $1000
- Web + App móvil
- Hosting premium
- Soporte 24/7

🔥 Plan Enterprise: $2000
- Solución completa
- Infraestructura dedicada
- Soporte prioritario

¿Te gustaría más información sobre algún plan específico?`,
                priority: 2
            },
            {
                keyword: ['contacto', 'comunicar', 'asesor'],
                response_text: `📞 Información de Contacto:

🏢 Oficina Central:
   Ciudad de México

📧 Email:
   info@empresa.com

☎️ Teléfonos:
   - Ventas: +52 55 1234 5678
   - Soporte: +52 55 8765 4321

⏰ Horario de atención:
   Lunes a Viernes de 9:00 a 18:00

¿En qué podemos ayudarte?`,
                priority: 3
            }
        ]

        // Crear cada flujo
        for (const flowData of flows) {
            console.log(`📝 Creando flujo para keywords:`, flowData.keyword)
            await FlowService.createFlow(
                DEFAULT_USER_ID,
                chatbot.id,
                flowData
            )
        }

        console.log('✅ Flujos creados exitosamente')
    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    }
}

// Ejecutar la inicialización
initFlows()
    .then(() => {
        console.log('🎉 Proceso completado')
        process.exit(0)
    })
    .catch(error => {
        console.error('💥 Error fatal:', error)
        process.exit(1)
    }) 