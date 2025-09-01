import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'

const execAsync = promisify(exec)

async function cleanProject() {
    try {
        console.log('🧹 Iniciando limpieza del proyecto...')

        // Eliminar node_modules
        await fs.rm('node_modules', { recursive: true, force: true })
        console.log('✅ node_modules eliminado')

        // Limpiar caché
        await execAsync('pnpm store prune')
        console.log('✅ Cache de pnpm limpiado')

        // Limpiar temporales
        await fs.rm('tmp', { recursive: true, force: true })
        console.log('✅ Archivos temporales eliminados')

        // Manejo específico de sharp
        console.log('📦 Reinstalando sharp...')
        await execAsync('pnpm uninstall sharp')
        await execAsync('pnpm install sharp')
        console.log('✅ Sharp reinstalado correctamente')

        // Reinstalar dependencias
        await execAsync('pnpm install')
        console.log('✅ Dependencias reinstaladas')

        console.log('🎉 Limpieza completada')
    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    }
}

cleanProject()
