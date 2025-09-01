/**
 * Logger especializado para TecnoBot SAAS
 * Proporciona logging estructurado con contexto de tenant
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Crear directorio de logs si no existe
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Formato personalizado para logs
const customFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, stack, tenantId, userId, requestId, ...meta }) => {
        const logObject = {
            timestamp,
            level: level.toUpperCase(),
            message,
            ...(tenantId && { tenantId }),
            ...(userId && { userId }),
            ...(requestId && { requestId }),
            ...(stack && { stack }),
            ...meta
        };
        
        return JSON.stringify(logObject);
    })
);

// Formato para consola en desarrollo
const consoleFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'HH:mm:ss'
    }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, tenantId, userId, requestId }) => {
        let logMessage = `${timestamp} [${level}] ${message}`;
        
        if (tenantId) {
            logMessage += ` [tenant:${tenantId}]`;
        }
        
        if (userId) {
            logMessage += ` [user:${userId}]`;
        }
        
        if (requestId) {
            logMessage += ` [req:${requestId.substring(0, 8)}]`;
        }
        
        return logMessage;
    })
);

// Configuración de transports
const transports = [];

// Console transport (solo en desarrollo)
if (process.env.NODE_ENV !== 'production') {
    transports.push(
        new winston.transports.Console({
            format: consoleFormat,
            level: process.env.LOG_LEVEL || 'debug'
        })
    );
}

// File transports
transports.push(
    // Logs de error
    new DailyRotateFile({
        filename: path.join(logsDir, 'error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        format: customFormat,
        maxSize: '20m',
        maxFiles: '14d',
        zippedArchive: true
    }),
    
    // Logs combinados
    new DailyRotateFile({
        filename: path.join(logsDir, 'combined-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        format: customFormat,
        maxSize: '20m',
        maxFiles: '14d',
        zippedArchive: true
    }),
    
    // Logs de acceso/requests
    new DailyRotateFile({
        filename: path.join(logsDir, 'access-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        level: 'http',
        format: customFormat,
        maxSize: '20m',
        maxFiles: '30d',
        zippedArchive: true
    }),
    
    // Logs de auditoría
    new DailyRotateFile({
        filename: path.join(logsDir, 'audit-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        level: 'info',
        format: customFormat,
        maxSize: '20m',
        maxFiles: '90d',
        zippedArchive: true,
        // Solo logs que contengan información de auditoría
        filter: (info) => info.audit === true
    })
);

// Crear logger principal
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: customFormat,
    transports,
    exitOnError: false
});

// Clase Logger con métodos de conveniencia
class SAASLogger {
    constructor(defaultContext = {}) {
        this.defaultContext = defaultContext;
        this.logger = logger;
    }

    /**
     * Crear un logger con contexto específico
     */
    child(context = {}) {
        return new SAASLogger({ ...this.defaultContext, ...context });
    }

    /**
     * Log de debug
     */
    debug(message, meta = {}) {
        this.logger.debug(message, { ...this.defaultContext, ...meta });
    }

    /**
     * Log de información
     */
    info(message, meta = {}) {
        this.logger.info(message, { ...this.defaultContext, ...meta });
    }

    /**
     * Log de advertencia
     */
    warn(message, meta = {}) {
        this.logger.warn(message, { ...this.defaultContext, ...meta });
    }

    /**
     * Log de error
     */
    error(message, error = null, meta = {}) {
        const errorMeta = { ...this.defaultContext, ...meta };
        
        if (error instanceof Error) {
            errorMeta.error = {
                name: error.name,
                message: error.message,
                stack: error.stack
            };
        } else if (error) {
            errorMeta.error = error;
        }
        
        this.logger.error(message, errorMeta);
    }

    /**
     * Log de request HTTP
     */
    http(message, meta = {}) {
        this.logger.http(message, { ...this.defaultContext, ...meta });
    }

    /**
     * Log de auditoría
     */
    audit(action, details = {}, meta = {}) {
        this.logger.info(`AUDIT: ${action}`, {
            ...this.defaultContext,
            ...meta,
            audit: true,
            action,
            details
        });
    }

    /**
     * Log de seguridad
     */
    security(event, details = {}, meta = {}) {
        this.logger.warn(`SECURITY: ${event}`, {
            ...this.defaultContext,
            ...meta,
            security: true,
            event,
            details
        });
    }

    /**
     * Log de performance
     */
    performance(operation, duration, meta = {}) {
        this.logger.info(`PERFORMANCE: ${operation}`, {
            ...this.defaultContext,
            ...meta,
            performance: true,
            operation,
            duration,
            slow: duration > 1000 // Marcar como lento si toma más de 1 segundo
        });
    }

    /**
     * Log de WhatsApp
     */
    whatsapp(event, details = {}, meta = {}) {
        this.logger.info(`WHATSAPP: ${event}`, {
            ...this.defaultContext,
            ...meta,
            whatsapp: true,
            event,
            details
        });
    }

    /**
     * Log de AI
     */
    ai(operation, details = {}, meta = {}) {
        this.logger.info(`AI: ${operation}`, {
            ...this.defaultContext,
            ...meta,
            ai: true,
            operation,
            details
        });
    }

    /**
     * Log de base de datos
     */
    database(operation, details = {}, meta = {}) {
        this.logger.debug(`DATABASE: ${operation}`, {
            ...this.defaultContext,
            ...meta,
            database: true,
            operation,
            details
        });
    }

    /**
     * Log de cache
     */
    cache(operation, details = {}, meta = {}) {
        this.logger.debug(`CACHE: ${operation}`, {
            ...this.defaultContext,
            ...meta,
            cache: true,
            operation,
            details
        });
    }

    /**
     * Crear un timer para medir duración
     */
    timer(label) {
        const start = Date.now();
        return {
            end: (meta = {}) => {
                const duration = Date.now() - start;
                this.performance(label, duration, meta);
                return duration;
            }
        };
    }

    /**
     * Log con contexto de request
     */
    withRequest(req) {
        const requestContext = {
            requestId: req.id || req.headers['x-request-id'],
            method: req.method,
            url: req.originalUrl || req.url,
            userAgent: req.headers['user-agent'],
            ip: req.ip || req.connection.remoteAddress,
            tenantId: req.tenantId,
            userId: req.user?.id
        };
        
        return this.child(requestContext);
    }

    /**
     * Log con contexto de tenant
     */
    withTenant(tenantId) {
        return this.child({ tenantId });
    }

    /**
     * Log con contexto de usuario
     */
    withUser(userId) {
        return this.child({ userId });
    }
}

// Crear instancia principal del logger
const saasLogger = new SAASLogger();

// Manejar errores del logger
logger.on('error', (error) => {
    console.error('Error en el logger:', error);
});

// Exportar tanto la clase como la instancia
module.exports = saasLogger;
module.exports.SAASLogger = SAASLogger;
module.exports.winston = winston;

// Para compatibilidad con import
module.exports.default = saasLogger;