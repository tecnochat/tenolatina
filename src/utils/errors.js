/**
 * Sistema de manejo de errores personalizado
 * Proporciona clases de error específicas y middleware de manejo
 */

const logger = require('./logger');

/**
 * Clase base para errores de aplicación
 */
class AppError extends Error {
    constructor(message, statusCode = 500, details = null, isOperational = true) {
        super(message);
        
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = isOperational;
        this.details = details;
        this.timestamp = new Date().toISOString();
        
        Error.captureStackTrace(this, this.constructor);
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            statusCode: this.statusCode,
            status: this.status,
            details: this.details,
            timestamp: this.timestamp,
            ...(process.env.NODE_ENV === 'development' && { stack: this.stack })
        };
    }
}

/**
 * Error de validación
 */
class ValidationError extends AppError {
    constructor(message, details = null) {
        super(message, 400, details);
    }
}

/**
 * Error de autenticación
 */
class AuthenticationError extends AppError {
    constructor(message = 'Authentication failed', details = null) {
        super(message, 401, details);
    }
}

/**
 * Error de autorización
 */
class AuthorizationError extends AppError {
    constructor(message = 'Access denied', details = null) {
        super(message, 403, details);
    }
}

/**
 * Error de recurso no encontrado
 */
class NotFoundError extends AppError {
    constructor(resource = 'Resource', id = null) {
        const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
        super(message, 404);
    }
}

/**
 * Error de conflicto (recurso ya existe)
 */
class ConflictError extends AppError {
    constructor(message, details = null) {
        super(message, 409, details);
    }
}

/**
 * Error de límite de velocidad
 */
class RateLimitError extends AppError {
    constructor(message = 'Rate limit exceeded', retryAfter = null) {
        super(message, 429, { retryAfter });
    }
}

/**
 * Error de servicio externo
 */
class ExternalServiceError extends AppError {
    constructor(service, message, originalError = null) {
        super(`${service} service error: ${message}`, 502, {
            service,
            originalError: originalError?.message
        });
    }
}

/**
 * Error de base de datos
 */
class DatabaseError extends AppError {
    constructor(message, originalError = null) {
        super(`Database error: ${message}`, 500, {
            originalError: originalError?.message
        });
    }
}

/**
 * Error de configuración
 */
class ConfigurationError extends AppError {
    constructor(message, details = null) {
        super(`Configuration error: ${message}`, 500, details);
    }
}

/**
 * Error de límite de plan
 */
class PlanLimitError extends AppError {
    constructor(feature, currentPlan, requiredPlan = null) {
        const message = requiredPlan 
            ? `Feature '${feature}' requires ${requiredPlan} plan. Current plan: ${currentPlan}`
            : `Feature '${feature}' not available in ${currentPlan} plan`;
        
        super(message, 402, {
            feature,
            currentPlan,
            requiredPlan,
            upgradeRequired: true
        });
    }
}

/**
 * Error de mantenimiento
 */
class MaintenanceError extends AppError {
    constructor(message = 'Service temporarily unavailable due to maintenance', estimatedTime = null) {
        super(message, 503, {
            maintenance: true,
            estimatedTime
        });
    }
}

/**
 * Mapeo de errores comunes de Supabase/PostgreSQL
 */
const mapDatabaseError = (error) => {
    if (!error.code) return error;

    switch (error.code) {
        case '23505': // unique_violation
            return new ConflictError('Resource already exists', {
                constraint: error.constraint,
                detail: error.detail
            });
        
        case '23503': // foreign_key_violation
            return new ValidationError('Referenced resource does not exist', {
                constraint: error.constraint,
                detail: error.detail
            });
        
        case '23502': // not_null_violation
            return new ValidationError('Required field is missing', {
                column: error.column,
                detail: error.detail
            });
        
        case '23514': // check_violation
            return new ValidationError('Invalid value provided', {
                constraint: error.constraint,
                detail: error.detail
            });
        
        case '42P01': // undefined_table
            return new DatabaseError('Table does not exist', error);
        
        case '42703': // undefined_column
            return new DatabaseError('Column does not exist', error);
        
        case '28P01': // invalid_password
            return new AuthenticationError('Invalid database credentials');
        
        case '53300': // too_many_connections
            return new DatabaseError('Database connection limit reached', error);
        
        default:
            return new DatabaseError(error.message || 'Unknown database error', error);
    }
};

/**
 * Mapeo de errores HTTP comunes
 */
const mapHttpError = (error, service = 'External service') => {
    if (!error.response) {
        return new ExternalServiceError(service, 'Network error or service unavailable', error);
    }

    const { status, data } = error.response;
    const message = data?.message || data?.error || `HTTP ${status} error`;

    switch (status) {
        case 400:
            return new ValidationError(`${service}: ${message}`, data);
        case 401:
            return new AuthenticationError(`${service}: ${message}`, data);
        case 403:
            return new AuthorizationError(`${service}: ${message}`, data);
        case 404:
            return new NotFoundError(`${service} resource`, data?.id);
        case 409:
            return new ConflictError(`${service}: ${message}`, data);
        case 429:
            return new RateLimitError(`${service}: ${message}`, data?.retryAfter);
        case 500:
        case 502:
        case 503:
        case 504:
            return new ExternalServiceError(service, message, error);
        default:
            return new ExternalServiceError(service, message, error);
    }
};

/**
 * Middleware para capturar errores no manejados
 */
const catchAsync = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * Middleware global de manejo de errores
 */
const globalErrorHandler = (err, req, res, next) => {
    // Log del error
    logger.error('Global error handler:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id,
        tenantId: req.tenant?.id
    });

    // Mapear errores de base de datos
    if (err.code && typeof err.code === 'string') {
        err = mapDatabaseError(err);
    }

    // Mapear errores HTTP
    if (err.response && err.config) {
        err = mapHttpError(err);
    }

    // Convertir errores no operacionales a AppError
    if (!(err instanceof AppError)) {
        err = new AppError(
            process.env.NODE_ENV === 'production' 
                ? 'Something went wrong' 
                : err.message,
            500,
            process.env.NODE_ENV === 'development' ? { originalError: err.message } : null,
            false
        );
    }

    // Respuesta de error
    const errorResponse = {
        success: false,
        error: {
            message: err.message,
            statusCode: err.statusCode,
            status: err.status,
            timestamp: err.timestamp || new Date().toISOString()
        }
    };

    // Agregar detalles en desarrollo o si es error operacional
    if (err.details && (process.env.NODE_ENV === 'development' || err.isOperational)) {
        errorResponse.error.details = err.details;
    }

    // Agregar stack trace en desarrollo
    if (process.env.NODE_ENV === 'development' && err.stack) {
        errorResponse.error.stack = err.stack;
    }

    // Headers especiales para ciertos tipos de error
    if (err instanceof RateLimitError && err.details?.retryAfter) {
        res.set('Retry-After', err.details.retryAfter);
    }

    if (err instanceof MaintenanceError) {
        res.set('Retry-After', '3600'); // 1 hora por defecto
    }

    res.status(err.statusCode).json(errorResponse);
};

/**
 * Middleware para manejar rutas no encontradas
 */
const notFoundHandler = (req, res, next) => {
    const error = new NotFoundError(`Route ${req.method} ${req.originalUrl}`);
    next(error);
};

/**
 * Función para crear errores de validación desde express-validator
 */
const createValidationError = (errors) => {
    const details = errors.map(error => ({
        field: error.path || error.param,
        message: error.msg,
        value: error.value
    }));
    
    return new ValidationError('Validation failed', { errors: details });
};

/**
 * Función para verificar si un error es operacional
 */
const isOperationalError = (error) => {
    if (error instanceof AppError) {
        return error.isOperational;
    }
    return false;
};

/**
 * Función para log de errores críticos
 */
const logCriticalError = (error, context = {}) => {
    logger.error('Critical error occurred:', {
        error: error.message,
        stack: error.stack,
        context,
        timestamp: new Date().toISOString()
    });

    // Aquí podrías agregar notificaciones adicionales
    // como envío de emails, Slack, etc.
};

/**
 * Manejador de promesas rechazadas no capturadas
 */
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', {
        promise,
        reason: reason?.message || reason
    });
    
    // En producción, podrías querer cerrar el proceso gracefully
    if (process.env.NODE_ENV === 'production') {
        process.exit(1);
    }
});

/**
 * Manejador de excepciones no capturadas
 */
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', {
        error: error.message,
        stack: error.stack
    });
    
    // Cerrar el proceso ya que el estado es incierto
    process.exit(1);
});

module.exports = {
    // Clases de error
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    RateLimitError,
    ExternalServiceError,
    DatabaseError,
    ConfigurationError,
    PlanLimitError,
    MaintenanceError,
    
    // Funciones de mapeo
    mapDatabaseError,
    mapHttpError,
    
    // Middlewares
    catchAsync,
    globalErrorHandler,
    notFoundHandler,
    
    // Utilidades
    createValidationError,
    isOperationalError,
    logCriticalError
};