import fs from 'fs'
import path from 'path'

const cleanSessions = async () => {
    try {
        console.log('🧹 Limpiando sesiones de WhatsApp...')
        
        // Directorios a limpiar
        const authDir = './auth_info_baileys'
        const sessionsDir = './sessions'
        
        // Limpiar directorio auth_info_baileys
        if (fs.existsSync(authDir)) {
            console.log('Eliminando directorio auth_info_baileys...')
            fs.rmSync(authDir, { recursive: true, force: true })
            console.log('✅ Directorio auth_info_baileys eliminado')
        }
        
        // Limpiar directorio sessions
        if (fs.existsSync(sessionsDir)) {
            console.log('Eliminando directorio sessions...')
            fs.rmSync(sessionsDir, { recursive: true, force: true })
            console.log('✅ Directorio sessions eliminado')
        }
        
        console.log('✨ Sesiones limpiadas exitosamente')
        return true
    } catch (error) {
        console.error('❌ Error limpiando sesiones:', error)
        throw error
    }
}

// Ejecutar la limpieza
cleanSessions()
    .then(() => {
        console.log('🎉 Proceso completado')
        process.exit(0)
    })
    .catch(error => {
        console.error('💥 Error fatal:', error)
        process.exit(1)
    }) 