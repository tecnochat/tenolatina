import supabase from '../config/supabase.js'
import { TABLES } from '../config/constants.js'
import dotenv from 'dotenv'

dotenv.config()

const cleanDatabase = async () => {
    try {
        console.log('🧹 Limpiando base de datos...')

        // Eliminar registros de todas las tablas en orden para evitar conflictos de foreign keys
        const tables = [
            TABLES.CHAT_HISTORY,
            TABLES.WELCOME_TRACKING,
            TABLES.CLIENT_DATA,
            TABLES.WELCOMES,
            TABLES.BEHAVIOR_PROMPTS,
            TABLES.KNOWLEDGE_PROMPTS,
            'bot_flows', // Agregamos la tabla bot_flows antes de chatbots
            TABLES.CHATBOTS
        ]

        for (const table of tables) {
            console.log(`Limpiando tabla ${table}...`)
            const { error } = await supabase
                .from(table)
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000') // Truco para eliminar todos los registros

            if (error) {
                console.error(`Error limpiando ${table}:`, error)
                throw error
            }
            console.log(`✅ Tabla ${table} limpiada`)
        }

        console.log('✨ Base de datos limpiada exitosamente')
        return true
    } catch (error) {
        console.error('❌ Error limpiando la base de datos:', error)
        throw error
    }
}

// Ejecutar la limpieza
cleanDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Error fatal:', error)
        process.exit(1)
    }) 