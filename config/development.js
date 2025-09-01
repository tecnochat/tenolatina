/**
 * Configuración para entorno de desarrollo
 * TecnoBot SAAS - Multi-tenant WhatsApp Chatbot Platform
 */

module.exports = {
  // Configuración del servidor
  server: {
    port: process.env.PORT || 3010,
    host: process.env.HOST || 'localhost',
    cors: {
      origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:3010'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID']
    }
  },

  // Base de datos
  database: {
    supabase: {
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      options: {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false
        },
        db: {
          schema: 'public'
        },
        global: {
          headers: {
            'x-application-name': 'tecnobot-saas-dev'
          }
        }
      }
    }
  },

  // Autenticación JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    algorithm: 'HS256',
    issuer: 'tecnobot-saas',
    audience: 'tecnobot-users'
  },

  // Encriptación
  encryption: {
    key: process.env.ENCRYPTION_KEY || 'dev-encryption-key-32-characters',
    algorithm: 'aes-256-gcm'
  },

  // WhatsApp Business API
  whatsapp: {
    // Configuración para Baileys
    baileys: {
      printQRInTerminal: true,
      browser: ['TecnoBot SAAS', 'Chrome', '1.0.0'],
      auth: {
        creds: 'sessions/auth_info_baileys.json',
        keys: 'sessions/pre_auth_keys.json'
      },
      logger: {
        level: 'debug'
      },
      markOnlineOnConnect: true,
      syncFullHistory: false,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000
    },
    
    // Configuración para WhatsApp Business API (Cloud API)
    businessApi: {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
      webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
      apiVersion: 'v18.0',
      baseUrl: 'https://graph.facebook.com'
    }
  },

  // Servicios de IA
  ai: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      organization: process.env.OPENAI_ORGANIZATION,
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 1000,
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7,
      timeout: 30000
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229',
      maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS) || 1000,
      timeout: 30000
    }
  },

  // Caché Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB) || 0,
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'tecnobot:dev:',
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'debug',
    format: 'combined',
    colorize: true,
    timestamp: true,
    files: {
      error: 'logs/error.log',
      combined: 'logs/combined.log',
      access: 'logs/access.log'
    },
    rotation: {
      maxSize: '20m',
      maxFiles: '14d',
      datePattern: 'YYYY-MM-DD'
    }
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // Más permisivo en desarrollo
    message: 'Demasiadas solicitudes desde esta IP, intenta de nuevo más tarde.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Saltar rate limiting para rutas de desarrollo
      return req.path.startsWith('/dev') || req.path.startsWith('/docs');
    }
  },

  // Almacenamiento de archivos
  storage: {
    type: process.env.STORAGE_TYPE || 'local',
    local: {
      uploadPath: 'uploads/',
      maxFileSize: 10 * 1024 * 1024, // 10MB
      allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'audio/mpeg', 'audio/ogg', 'video/mp4']
    },
    aws: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1',
      bucket: process.env.AWS_S3_BUCKET,
      cloudFrontUrl: process.env.AWS_CLOUDFRONT_URL
    }
  },

  // Email
  email: {
    provider: process.env.EMAIL_PROVIDER || 'smtp',
    smtp: {
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    },
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY,
      fromEmail: process.env.SENDGRID_FROM_EMAIL,
      fromName: process.env.SENDGRID_FROM_NAME || 'TecnoBot SAAS'
    },
    templates: {
      welcome: 'welcome',
      passwordReset: 'password-reset',
      invitation: 'team-invitation'
    }
  },

  // SMS (Twilio)
  sms: {
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      fromNumber: process.env.TWILIO_FROM_NUMBER
    }
  },

  // Push Notifications
  pushNotifications: {
    firebase: {
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL
    }
  },

  // Webhooks
  webhooks: {
    timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 10000,
    retries: parseInt(process.env.WEBHOOK_RETRIES) || 3,
    retryDelay: parseInt(process.env.WEBHOOK_RETRY_DELAY) || 1000,
    maxPayloadSize: '1mb',
    userAgent: 'TecnoBot-SAAS-Webhook/1.0'
  },

  // Analytics
  analytics: {
    enabled: process.env.ANALYTICS_ENABLED !== 'false',
    batchSize: parseInt(process.env.ANALYTICS_BATCH_SIZE) || 100,
    flushInterval: parseInt(process.env.ANALYTICS_FLUSH_INTERVAL) || 10000,
    googleAnalytics: {
      trackingId: process.env.GA_TRACKING_ID,
      measurementId: process.env.GA_MEASUREMENT_ID
    }
  },

  // Monitoreo y errores
  monitoring: {
    sentry: {
      dsn: process.env.SENTRY_DSN,
      environment: 'development',
      tracesSampleRate: 1.0,
      debug: true
    },
    healthCheck: {
      interval: 30000,
      timeout: 5000,
      endpoints: [
        '/health',
        '/health/db',
        '/health/redis',
        '/health/ai'
      ]
    }
  },

  // Pagos (Stripe)
  payments: {
    stripe: {
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      secretKey: process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      currency: 'mxn'
    }
  },

  // Límites por plan
  planLimits: {
    free: {
      maxChatbots: 1,
      maxConversationsPerMonth: 100,
      maxMessagesPerMonth: 1000,
      aiEnabled: false,
      analyticsRetentionDays: 7,
      webhooksEnabled: false,
      customBrandingEnabled: false
    },
    basic: {
      maxChatbots: 3,
      maxConversationsPerMonth: 1000,
      maxMessagesPerMonth: 10000,
      aiEnabled: true,
      analyticsRetentionDays: 30,
      webhooksEnabled: true,
      customBrandingEnabled: false
    },
    pro: {
      maxChatbots: 10,
      maxConversationsPerMonth: 10000,
      maxMessagesPerMonth: 100000,
      aiEnabled: true,
      analyticsRetentionDays: 90,
      webhooksEnabled: true,
      customBrandingEnabled: true
    },
    enterprise: {
      maxChatbots: -1, // Ilimitado
      maxConversationsPerMonth: -1,
      maxMessagesPerMonth: -1,
      aiEnabled: true,
      analyticsRetentionDays: 365,
      webhooksEnabled: true,
      customBrandingEnabled: true
    }
  },

  // Configuración de desarrollo específica
  development: {
    enableMocks: process.env.ENABLE_MOCKS === 'true',
    mockWhatsApp: process.env.MOCK_WHATSAPP === 'true',
    mockAI: process.env.MOCK_AI === 'true',
    mockPayments: process.env.MOCK_PAYMENTS === 'true',
    enableDebugRoutes: true,
    enableSwagger: true,
    enableCorsAll: true,
    logSqlQueries: process.env.LOG_SQL_QUERIES === 'true',
    seedDatabase: process.env.SEED_DATABASE === 'true',
    hotReload: true,
    debugPort: 9229
  },

  // Seguridad
  security: {
    helmet: {
      contentSecurityPolicy: false, // Deshabilitado en desarrollo
      crossOriginEmbedderPolicy: false
    },
    session: {
      secret: process.env.SESSION_SECRET || 'dev-session-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false, // HTTP en desarrollo
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 horas
      }
    },
    bcrypt: {
      saltRounds: 10
    }
  },

  // Localización
  i18n: {
    defaultLocale: process.env.DEFAULT_LOCALE || 'es',
    supportedLocales: ['es', 'en'],
    directory: './locales',
    autoReload: true,
    updateFiles: true
  },

  // Integraciones externas
  integrations: {
    zapier: {
      enabled: process.env.ZAPIER_ENABLED === 'true',
      webhookUrl: process.env.ZAPIER_WEBHOOK_URL
    },
    make: {
      enabled: process.env.MAKE_ENABLED === 'true',
      webhookUrl: process.env.MAKE_WEBHOOK_URL
    }
  },

  // Feature flags
  features: {
    enableAI: process.env.FEATURE_AI !== 'false',
    enableAnalytics: process.env.FEATURE_ANALYTICS !== 'false',
    enableWebhooks: process.env.FEATURE_WEBHOOKS !== 'false',
    enablePayments: process.env.FEATURE_PAYMENTS !== 'false',
    enableTeams: process.env.FEATURE_TEAMS !== 'false',
    enableCustomBranding: process.env.FEATURE_CUSTOM_BRANDING !== 'false'
  }
};