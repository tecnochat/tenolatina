import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import { CONFIG } from '../config/constants.js'

class MemoryManager extends EventEmitter {
    constructor() {
        super()
        this.memoryUsage = {
            heapTotal: 0,
            heapUsed: 0,
            rss: 0,
            external: 0
        }
        this.memoryLimit = process.env.MEMORY_LIMIT || 512 // MB
        this.warningThreshold = 0.8 // 80% del límite
        this.criticalThreshold = 0.9 // 90% del límite
        this.tmpFiles = new Set()
        this.cleanupInterval = 300000 // 5 minutos
        
        // Iniciar monitoreo
        this.startMonitoring()
    }

    // Monitoreo periódico de memoria
    startMonitoring() {
        setInterval(() => {
            this.checkMemoryUsage()
            this.cleanupTmpFiles()
        }, 60000) // Cada minuto
    }

    // Verificar uso de memoria
    checkMemoryUsage() {
        const usage = process.memoryUsage()
        this.memoryUsage = {
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
            rss: Math.round(usage.rss / 1024 / 1024),
            external: Math.round(usage.external / 1024 / 1024)
        }

        const memoryUsedPercent = this.memoryUsage.rss / this.memoryLimit

        if (memoryUsedPercent >= this.criticalThreshold) {
            this.emit('memory-critical', this.memoryUsage)
            this.forceCleanup()
        } else if (memoryUsedPercent >= this.warningThreshold) {
            this.emit('memory-warning', this.memoryUsage)
            global.gc?.()
        }

        return this.memoryUsage
    }

    // Registrar archivo temporal
    trackTmpFile(filePath) {
        this.tmpFiles.add(filePath)
    }

    // Limpiar archivo temporal específico
    async cleanupTmpFile(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath)
                this.tmpFiles.delete(filePath)
                console.log('🧹 Archivo temporal eliminado:', filePath)
            }
        } catch (error) {
            console.error('Error eliminando archivo temporal:', error)
        }
    }

    // Limpiar todos los archivos temporales
    async cleanupTmpFiles() {
        const tmpDir = path.join(process.cwd(), 'tmp')
        
        try {
            // Limpiar archivos registrados
            for (const filePath of this.tmpFiles) {
                await this.cleanupTmpFile(filePath)
            }

            // Limpiar directorio tmp
            const files = await fs.promises.readdir(tmpDir)
            const now = Date.now()
            
            for (const file of files) {
                const filePath = path.join(tmpDir, file)
                try {
                    const stats = await fs.promises.stat(filePath)
                    const age = now - stats.mtimeMs
                    
                    // Eliminar archivos más antiguos que 1 hora
                    if (age > 3600000) {
                        await fs.promises.unlink(filePath)
                        console.log('🧹 Archivo antiguo eliminado:', file)
                    }
                } catch (error) {
                    console.error(`Error procesando archivo ${file}:`, error)
                }
            }
        } catch (error) {
            console.error('Error en limpieza de archivos:', error)
        }
    }

    // Limpieza forzada cuando la memoria está crítica
    async forceCleanup() {
        console.log('⚠️ Iniciando limpieza forzada de memoria')
        
        // Forzar garbage collection
        global.gc?.()
        
        // Limpiar todos los archivos temporales
        await this.cleanupTmpFiles()
        
        // Limpiar caché de respuestas
        this.emit('clear-response-cache')
        
        // Reiniciar contadores
        this.tmpFiles.clear()
        
        console.log('✅ Limpieza forzada completada')
    }

    // Obtener estadísticas de memoria
    getStats() {
        return {
            ...this.checkMemoryUsage(),
            tmpFiles: this.tmpFiles.size,
            limit: this.memoryLimit
        }
    }
}

// Exportar instancia única
export const memoryManager = new MemoryManager()