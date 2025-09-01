import dotenv from 'dotenv'

// Cargar variables de entorno
dotenv.config()

/**
 * Configuración centralizada de la aplicación
 * Todas las configuraciones del sistema multi-tenant
 */
export const AppConfig = {
    // Configuración del servidor
    server: {
        port: parseInt(process.env.PORT) || 3010,
        memoryLimit: parseInt(process.env.MEMORY_LIMIT) || 512,
        nodeEnv: process.env.NODE_ENV || 'development',
        debugMode: process.env.DEBUG_MODE === 'true',
        apiDocsEnabled: process.env.API_DOCS_ENABLED === 'true'
    },

    // Configuración de logging
    logging: {
        level: process.env.LOG_LEVEL || 'debug',
        retentionDays: parseInt(process.env.LOG_RETENTION_DAYS) || 30
    },

    // Configuración de Supabase
    supabase: {
        url: process.env.SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
    },

    // Configuración JWT
    jwt: {
        secret: process.env.JWT_SECRET || 'default_secret_key',
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
    },

    // Configuración Multi-Tenant
    multiTenant: {
        enabled: process.env.TENANT_ISOLATION_ENABLED === 'true',
        defaultPlan: process.env.DEFAULT_TENANT_PLAN || 'basic',
        maxTenantsPerInstance: parseInt(process.env.MAX_TENANTS_PER_INSTANCE) || 1000,
        cacheTTL: parseInt(process.env.TENANT_CACHE_TTL) || 300
    },

    // Planes y límites
    plans: {
        basic: {
            name: 'Basic',
            price: 0,
            limits: {
                chatbots: parseInt(process.env.BASIC_PLAN_CHATBOTS) || 3,
                whatsappSessions: parseInt(process.env.BASIC_PLAN_WHATSAPP_SESSIONS) || 1,
                teamMembers: parseInt(process.env.BASIC_PLAN_TEAM_MEMBERS) || 2,
                messagesPerMonth: parseInt(process.env.BASIC_PLAN_MESSAGES_PER_MONTH) || 1000,
                storageMB: parseInt(process.env.BASIC_PLAN_STORAGE_MB) || 100
            },
            features: [
                'Chatbots básicos',
                'Integración WhatsApp',
                'Soporte por email',
                'Análisis básicos'
            ]
        },
        pro: {
            name: 'Pro',
            price: 29,
            limits: {
                chatbots: parseInt(process.env.PRO_PLAN_CHATBOTS) || 10,
                whatsappSessions: parseInt(process.env.PRO_PLAN_WHATSAPP_SESSIONS) || 3,
                teamMembers: parseInt(process.env.PRO_PLAN_TEAM_MEMBERS) || 5,
                messagesPerMonth: parseInt(process.env.PRO_PLAN_MESSAGES_PER_MONTH) || 10000,
                storageMB: parseInt(process.env.PRO_PLAN_STORAGE_MB) || 1000
            },
            features: [
                'Chatbots avanzados',
                'Múltiples sesiones WhatsApp',
                'Webhooks personalizados',
                'Análisis avanzados',
                'Soporte prioritario',
                'Integraciones API'
            ]
        },
        enterprise: {
            name: 'Enterprise',
            price: 99,
            limits: {
                chatbots: parseInt(process.env.ENTERPRISE_PLAN_CHATBOTS) || 50,
                whatsappSessions: parseInt(process.env.ENTERPRISE_PLAN_WHATSAPP_SESSIONS) || 10,
                teamMembers: parseInt(process.env.ENTERPRISE_PLAN_TEAM_MEMBERS) || 20,
                messagesPerMonth: parseInt(process.env.ENTERPRISE_PLAN_MESSAGES_PER_MONTH) || 100000,
                storageMB: parseInt(process.env.ENTERPRISE_PLAN_STORAGE_MB) || 10000
            },
            features: [
                'Chatbots ilimitados',
                'Múltiples sesiones WhatsApp',
                'Webhooks personalizados',
                'Análisis completos',
                'Soporte 24/7',
                'Integraciones personalizadas',
                'White-label',
                'SLA garantizado'
            ]
        }
    },

    // Configuración de seguridad
    security: {
        password: {
            minLength: parseInt(process.env.PASSWORD_MIN_LENGTH) || 8,
            requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE === 'true',
            requireLowercase: process.env.PASSWORD_REQUIRE_LOWERCASE === 'true',
            requireNumbers: process.env.PASSWORD_REQUIRE_NUMBERS === 'true',
            requireSymbols: process.env.PASSWORD_REQUIRE_SYMBOLS === 'true'
        },
        login: {
            maxAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
            lockoutDuration: parseInt(process.env.LOCKOUT_DURATION) || 900
        }
    },

    // Configuración de sesiones
    session: {
        timeout: parseInt(process.env.SESSION_TIMEOUT) || 3600,
        maxConcurrent: parseInt(process.env.MAX_CONCURRENT_SESSIONS) || 3,
        cleanupInterval: parseInt(process.env.SESSION_CLEANUP_INTERVAL) || 300
    },

    // Configuración de rate limiting
    rateLimit: {
        maxRequestsPerMinute: parseInt(process.env.MAX_REQUESTS_PER_MINUTE) || 60,
        cooldownPeriod: parseInt(process.env.COOLDOWN_PERIOD) || 60000,
        maxMessages: parseInt(process.env.RATE_LIMIT_MAX_MESSAGES) || 30,
        cooldown: parseInt(process.env.RATE_LIMIT_COOLDOWN) || 60000
    },

    // Configuración de webhooks
    webhooks: {
        timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 10000,
        retryAttempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS) || 3,
        retryDelay: parseInt(process.env.WEBHOOK_RETRY_DELAY) || 1000,
        verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'default_verify_token'
    },

    // Configuración de archivos
    files: {
        maxSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB
        allowedTypes: process.env.ALLOWED_FILE_TYPES?.split(',') || [
            'image/jpeg',
            'image/png',
            'image/gif',
            'application/pdf',
            'text/plain'
        ],
        uploadPath: process.env.UPLOAD_PATH || './uploads'
    },

    // Configuración de base de datos
    database: {
        pool: {
            min: parseInt(process.env.DB_POOL_MIN) || 2,
            max: parseInt(process.env.DB_POOL_MAX) || 10
        },
        timeouts: {
            connection: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 60000,
            query: parseInt(process.env.DB_QUERY_TIMEOUT) || 30000
        }
    },

    // Configuración de caché
    cache: {
        redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
        defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL) || 3600,
        maxKeys: parseInt(process.env.CACHE_MAX_KEYS) || 10000
    },

    // Configuración de OpenAI
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        defaultModel: process.env.AI_DEFAULT_MODEL || 'gpt-3.5-turbo',
        defaultTemperature: parseFloat(process.env.AI_DEFAULT_TEMPERATURE) || 0.7,
        defaultMaxTokens: parseInt(process.env.AI_DEFAULT_MAX_TOKENS) || 150,
        requestTimeout: parseInt(process.env.AI_REQUEST_TIMEOUT) || 30000,
        maxRequestsPerMinute: parseInt(process.env.AI_MAX_REQUESTS_PER_MINUTE) || 60
    },

    // Configuración de Google Cloud
    googleCloud: {
        projectId: process.env.GOOGLE_PROJECT_ID,
        clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
        privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    },

    // Configuración de WhatsApp
    whatsapp: {
        apiVersion: process.env.WHATSAPP_API_VERSION || 'v18.0',
        timeout: parseInt(process.env.WHATSAPP_TIMEOUT) || 30000
    },

    // Configuración de email
    email: {
        smtp: {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        },
        from: {
            email: process.env.FROM_EMAIL || 'noreply@tecnobot.com',
            name: process.env.FROM_NAME || 'TecnoBot SAAS'
        }
    },

    // Configuración de monitoreo
    monitoring: {
        analyticsEnabled: process.env.ANALYTICS_ENABLED === 'true',
        metricsInterval: parseInt(process.env.METRICS_COLLECTION_INTERVAL) || 60,
        errorReportingEnabled: process.env.ERROR_REPORTING_ENABLED === 'true'
    },

    // Configuración de backup
    backup: {
        enabled: process.env.BACKUP_ENABLED === 'true',
        interval: parseInt(process.env.BACKUP_INTERVAL) || 86400,
        retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS) || 7,
        path: process.env.BACKUP_PATH || './backups'
    },

    // Configuración de chat
    chat: {
        maxHistory: parseInt(process.env.MAX_CHAT_HISTORY) || 5
    },

    // Configuración de IA por defecto
    ai: {
        defaultProvider: process.env.AI_DEFAULT_PROVIDER || 'openai',
        defaultSystemPrompt: 'Eres un asistente virtual útil y amigable. Responde de manera clara y concisa.'
    },

    // Roles y permisos del sistema
    roles: {
        PLATFORM_ADMIN: 'platform_admin',
        TENANT_ADMIN: 'tenant_admin', 
        CHATBOT_EDITOR: 'chatbot_editor',
        OPERATOR: 'operator',
        VIEWER: 'viewer'
    },

    // Estados de tenant
    tenantStatus: {
        ACTIVE: 'active',
        SUSPENDED: 'suspended',
        DELETED: 'deleted',
        TRIAL: 'trial'
    },

    // Estados de chatbot
    chatbotStatus: {
        ACTIVE: 'active',
        INACTIVE: 'inactive',
        MAINTENANCE: 'maintenance'
    },

    // Estados de conversación
    conversationStatus: {
        ACTIVE: 'active',
        CLOSED: 'closed',
        ARCHIVED: 'archived'
    },

    // Tipos de mensaje
    messageTypes: {
        INCOMING: 'incoming',
        OUTGOING: 'outgoing',
        SYSTEM: 'system'
    },

    // Eventos de webhook
    webhookEvents: {
        MESSAGE_RECEIVED: 'message_received',
        MESSAGE_SENT: 'message_sent',
        CONVERSATION_STARTED: 'conversation_started',
        CONVERSATION_ENDED: 'conversation_ended',
        CHATBOT_ACTIVATED: 'chatbot_activated',
        CHATBOT_DEACTIVATED: 'chatbot_deactivated'
    }
}

/**
 * Validar configuración requerida
 */
export const validateConfig = () => {
    const requiredEnvVars = [
        'SUPABASE_URL',
        'SUPABASE_ANON_KEY',
        'SUPABASE_SERVICE_ROLE_KEY',
        'JWT_SECRET'
    ]

    const missing = requiredEnvVars.filter(envVar => !process.env[envVar])
    
    if (missing.length > 0) {
        throw new Error(`Variables de entorno requeridas faltantes: ${missing.join(', ')}`)
    }

    // Validar configuración de Supabase
    if (!AppConfig.supabase.url || !AppConfig.supabase.url.startsWith('https://')) {
        throw new Error('SUPABASE_URL debe ser una URL válida que comience con https://')
    }

    // Validar JWT secret en producción
    if (AppConfig.server.nodeEnv === 'production' && AppConfig.jwt.secret === 'default_secret_key') {
        throw new Error('JWT_SECRET debe ser configurado en producción')
    }

    console.log('✅ Configuración validada correctamente')
}

/**
 * Obtener límites del plan
 */
export const getPlanLimits = (planType) => {
    return AppConfig.plans[planType]?.limits || AppConfig.plans.basic.limits
}

/**
 * Verificar si una característica está habilitada para un plan
 */
export const isPlanFeatureEnabled = (planType, feature) => {
    const plan = AppConfig.plans[planType]
    return plan?.features.includes(feature) || false
}

/**
 * Obtener configuración de entorno
 */
export const getEnvironmentConfig = () => {
    return {
        isDevelopment: AppConfig.server.nodeEnv === 'development',
        isProduction: AppConfig.server.nodeEnv === 'production',
        isStaging: AppConfig.server.nodeEnv === 'staging',
        debugMode: AppConfig.server.debugMode,
        apiDocsEnabled: AppConfig.server.apiDocsEnabled
    }
}

export default AppConfig