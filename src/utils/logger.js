import fs from 'fs'
import path from 'path'
import { EventEmitter } from 'events'

class Logger extends EventEmitter {
    constructor() {
        super()
        this.isDevelopment = process.env.NODE_ENV === 'development'
        this.logLevel = process.env.LOG_LEVEL || 'info'
        this.logDir = path.join(process.cwd(), 'logs')
        this.maxLogSize = 5 * 1024 * 1024 // 5MB
        
        this.levels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        }

        // Crear directorio de logs si no existe
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true })
        }

        // Archivos de log por nivel
        this.logFiles = {
            error: path.join(this.logDir, 'error.log'),
            combined: path.join(this.logDir, 'combined.log')
        }
    }

    shouldLog(level) {
        return this.isDevelopment || 
               this.levels[level] >= this.levels[this.logLevel]
    }

    formatMessage(level, ...args) {
        const timestamp = new Date().toISOString()
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : arg
        ).join(' ')
        return `[${timestamp}] ${level.toUpperCase()}: ${message}\n`
    }

    async writeToFile(filePath, message) {
        try {
            // Verificar tamaño del archivo
            try {
                const stats = await fs.promises.stat(filePath)
                if (stats.size > this.maxLogSize) {
                    // Rotar archivo
                    const backupPath = `${filePath}.${Date.now()}.bak`
                    await fs.promises.rename(filePath, backupPath)
                }
            } catch (error) {
                // Archivo no existe, se creará
            }

            // Escribir log
            await fs.promises.appendFile(filePath, message)
        } catch (error) {
            console.error(`Error writing to log file: ${error.message}`)
        }
    }

    debug(...args) {
        if (this.shouldLog('debug')) {
            const message = this.formatMessage('debug', ...args)
            if (this.isDevelopment) {
                console.log('🐛', ...args)
            }
            this.writeToFile(this.logFiles.combined, message)
        }
    }

    info(...args) {
        if (this.shouldLog('info')) {
            const message = this.formatMessage('info', ...args)
            if (this.isDevelopment) {
                console.info('ℹ️', ...args)
            }
            this.writeToFile(this.logFiles.combined, message)
        }
    }

    warn(...args) {
        if (this.shouldLog('warn')) {
            const message = this.formatMessage('warn', ...args)
            if (this.isDevelopment) {
                console.warn('⚠️', ...args)
            }
            this.writeToFile(this.logFiles.combined, message)
        }
    }

    error(...args) {
        // Errores siempre se registran
        const message = this.formatMessage('error', ...args)
        console.error('❌', ...args)
        
        // Guardar en archivo de errores y combined
        this.writeToFile(this.logFiles.error, message)
        this.writeToFile(this.logFiles.combined, message)
        
        // Emitir evento para manejo externo
        this.emit('error', ...args)
    }

    async cleanOldLogs(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 días
        try {
            const files = await fs.promises.readdir(this.logDir)
            const now = Date.now()

            for (const file of files) {
                if (file.includes('.bak')) {
                    const filePath = path.join(this.logDir, file)
                    const stats = await fs.promises.stat(filePath)
                    const age = now - stats.mtimeMs

                    if (age > maxAge) {
                        await fs.promises.unlink(filePath)
                        this.debug(`Deleted old log file: ${file}`)
                    }
                }
            }
        } catch (error) {
            console.error(`Error cleaning old logs: ${error.message}`)
        }
    }
}

// Exportar instancia única
export const logger = new Logger()

// Limpiar logs antiguos periódicamente
setInterval(() => {
    logger.cleanOldLogs()
}, 24 * 60 * 60 * 1000) // Cada 24 horas