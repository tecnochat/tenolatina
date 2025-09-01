import dotenv from 'dotenv'

dotenv.config()

/**
 * Configuración centralizada de la aplicación TecnoBot SAAS
 */
export const AppConfig = {
    // Configuración del servidor
    server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || 'localhost',
        environment: process.env.NODE_ENV || 'development',
        cors: {
            origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
            credentials: true
        }
    },

    // Configuración de autenticación
    auth: {
        jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
        jwtExpiration: process.env.JWT_EXPIRATION || '24h',
        refreshTokenExpiration: process.env.REFRESH_TOKEN_EXPIRATION || '7d',
        bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
        sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 24 * 60 * 60 * 1000, // 24 horas
        maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
        lockoutDuration: parseInt(process.env.LOCKOUT_DURATION) || 15 * 60 * 1000 // 15 minutos
    },

    // Configuración de Supabase
    supabase: {
        url: process.env.SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        maxConnections: parseInt(process.env.SUPABASE_MAX_CONNECTIONS) || 10,
        connectionTimeout: parseInt(process.env.SUPABASE_CONNECTION_TIMEOUT) || 30000
    },

    // Configuración de WhatsApp (Baileys)
    whatsapp: {
        maxSessions: parseInt(process.env.MAX_WHATSAPP_SESSIONS) || 50,
        sessionTimeout: parseInt(process.env.WHATSAPP_SESSION_TIMEOUT) || 30 * 60 * 1000, // 30 minutos
        reconnectAttempts: parseInt(process.env.WHATSAPP_RECONNECT_ATTEMPTS) || 3,
        reconnectDelay: parseInt(process.env.WHATSAPP_RECONNECT_DELAY) || 5000,
        qrTimeout: parseInt(process.env.QR_TIMEOUT) || 60000, // 1 minuto
        cleanupInterval: parseInt(process.env.WHATSAPP_CLEANUP_INTERVAL) || 5 * 60 * 1000, // 5 minutos
        maxMessageLength: parseInt(process.env.MAX_MESSAGE_LENGTH) || 4096
    },

    // Configuración de OpenAI
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 1000,
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7,
        timeout: parseInt(process.env.OPENAI_TIMEOUT) || 30000
    },

    // Configuración de Google APIs
    google: {
        apiKey: process.env.GOOGLE_API_KEY,
        searchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID,
        maxResults: parseInt(process.env.GOOGLE_MAX_RESULTS) || 5
    },

    // Configuración de Rate Limiting
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutos
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
        skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true',
        skipFailedRequests: process.env.RATE_LIMIT_SKIP_FAILED === 'true'
    },

    // Configuración de planes y límites
    plans: {
        free: {
            name: 'Gratuito',
            maxChatbots: 1,
            maxMonthlyMessages: 1000,
            maxWhatsappSessions: 1,
            maxTeamMembers: 1,
            features: ['basic_ai', 'basic_flows']
        },
        basic: {
            name: 'Básico',
            maxChatbots: 3,
            maxMonthlyMessages: 10000,
            maxWhatsappSessions: 3,
            maxTeamMembers: 3,
            features: ['advanced_ai', 'custom_flows', 'analytics']
        },
        pro: {
            name: 'Profesional',
            maxChatbots: 10,
            maxMonthlyMessages: 50000,
            maxWhatsappSessions: 10,
            maxTeamMembers: 10,
            features: ['premium_ai', 'advanced_flows', 'advanced_analytics', 'api_access']
        },
        enterprise: {
            name: 'Empresarial',
            maxChatbots: -1, // Ilimitado
            maxMonthlyMessages: -1, // Ilimitado
            maxWhatsappSessions: 50,
            maxTeamMembers: -1, // Ilimitado
            features: ['all_features', 'priority_support', 'custom_integrations']
        }
    },

    // Configuración de logging
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.LOG_FORMAT || 'combined',
        maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
        maxSize: process.env.LOG_MAX_SIZE || '10m',
        enableConsole: process.env.LOG_CONSOLE !== 'false'
    },

    // Configuración de cache
    cache: {
        ttl: parseInt(process.env.CACHE_TTL) || 300, // 5 minutos
        maxKeys: parseInt(process.env.CACHE_MAX_KEYS) || 1000,
        checkPeriod: parseInt(process.env.CACHE_CHECK_PERIOD) || 600 // 10 minutos
    },

    // Configuración de archivos y storage
    storage: {
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
        allowedMimeTypes: process.env.ALLOWED_MIME_TYPES?.split(',') || [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'application/pdf',
            'text/plain'
        ],
        uploadPath: process.env.UPLOAD_PATH || './uploads',
        cdnUrl: process.env.CDN_URL || null
    },

    // Configuración de notificaciones
    notifications: {
        email: {
            enabled: process.env.EMAIL_NOTIFICATIONS === 'true',
            provider: process.env.EMAIL_PROVIDER || 'smtp',
            from: process.env.EMAIL_FROM || 'noreply@tecnobot.com'
        },
        webhook: {
            enabled: process.env.WEBHOOK_NOTIFICATIONS === 'true',
            timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 5000,
            retries: parseInt(process.env.WEBHOOK_RETRIES) || 3
        }
    },

    // Configuración de métricas y analytics
    analytics: {
        enabled: process.env.ANALYTICS_ENABLED !== 'false',
        retentionDays: parseInt(process.env.ANALYTICS_RETENTION_DAYS) || 90,
        batchSize: parseInt(process.env.ANALYTICS_BATCH_SIZE) || 100,
        flushInterval: parseInt(process.env.ANALYTICS_FLUSH_INTERVAL) || 60000 // 1 minuto
    },

    // URLs y endpoints importantes
    urls: {
        frontend: process.env.FRONTEND_URL || 'http://localhost:5173',
        api: process.env.API_URL || 'http://localhost:3000/api',
        webhook: process.env.WEBHOOK_URL || 'http://localhost:3000/webhook',
        docs: process.env.DOCS_URL || 'http://localhost:3000/docs'
    },

    // Configuración de desarrollo
    development: {
        enableSwagger: process.env.ENABLE_SWAGGER !== 'false',
        enableCors: process.env.ENABLE_CORS !== 'false',
        enableMockData: process.env.ENABLE_MOCK_DATA === 'true',
        debugMode: process.env.DEBUG_MODE === 'true'
    }
}

/**
 * Validar configuración requerida
 */
export const validateConfig = () => {
    const requiredVars = [
        'SUPABASE_URL',
        'SUPABASE_ANON_KEY',
        'SUPABASE_SERVICE_ROLE_KEY',
        'JWT_SECRET'
    ]

    const missing = requiredVars.filter(varName => !process.env[varName])
    
    if (missing.length > 0) {
        throw new Error(`❌ Variables de entorno requeridas faltantes: ${missing.join(', ')}`)
    }

    // Validaciones adicionales
    if (AppConfig.auth.jwtSecret === 'your-super-secret-jwt-key') {
        console.warn('⚠️  ADVERTENCIA: Usando JWT_SECRET por defecto. Cambia esto en producción.')
    }

    if (!AppConfig.openai.apiKey) {
        console.warn('⚠️  ADVERTENCIA: OPENAI_API_KEY no configurada. Las funciones de IA no funcionarán.')
    }

    console.log('✅ Configuración validada correctamente')
    console.log(`🌍 Entorno: ${AppConfig.server.environment}`)
    console.log(`🚀 Servidor: ${AppConfig.server.host}:${AppConfig.server.port}`)
}

/**
 * Obtener configuración de plan por nombre
 */
export const getPlanConfig = (planName) => {
    return AppConfig.plans[planName] || AppConfig.plans.free
}

/**
 * Verificar si una característica está disponible en un plan
 */
export const hasFeature = (planName, feature) => {
    const plan = getPlanConfig(planName)
    return plan.features.includes(feature) || plan.features.includes('all_features')
}

/**
 * Obtener límites de un plan
 */
export const getPlanLimits = (planName) => {
    const plan = getPlanConfig(planName)
    return {
        maxChatbots: plan.maxChatbots,
        maxMonthlyMessages: plan.maxMonthlyMessages,
        maxWhatsappSessions: plan.maxWhatsappSessions,
        maxTeamMembers: plan.maxTeamMembers
    }
}

export default AppConfig