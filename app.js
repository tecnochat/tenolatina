/**
 * TecnoBot - Multi-tenant SaaS Chatbot Platform
 * Aplicación principal Express.js
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');

// Importar configuración
require('dotenv').config();
const { supabaseConfig } = require('./src/config/supabase');
const { logger } = require('./src/utils/logger');

// Importar middlewares
const { authMiddleware } = require('./src/middleware/auth');
const { tenantMiddleware } = require('./src/middleware/tenant');
const { errorHandler, notFoundHandler, globalErrorHandler } = require('./src/utils/errors');
const { requestLogger } = require('./src/utils/logger');

// Importar rutas
const authRoutes = require('./src/routes/auth');
const chatbotRoutes = require('./src/routes/chatbots');
const flowRoutes = require('./src/routes/flows');
const welcomeRoutes = require('./src/routes/welcomes');
const aiRoutes = require('./src/routes/ai');
const teamRoutes = require('./src/routes/team');
const analyticsRoutes = require('./src/routes/analytics');
const webhookRoutes = require('./src/routes/webhook');
const publicRoutes = require('./src/routes/public');

// Importar servicios
const { whatsappService } = require('./src/services/whatsapp');
const { aiService } = require('./src/services/ai');
const { notificationService } = require('./src/services/notifications');
const { analyticsService } = require('./src/services/analytics');

// Crear aplicación Express
const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Configuración de seguridad
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'https://api.openai.com', supabaseConfig.url]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// Configuración de CORS
const corsOptions = {
    origin: function (origin, callback) {
        // Permitir requests sin origin (mobile apps, postman, etc.)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:5173', // Vite dev server
            'https://tecnobot.app',
            'https://app.tecnobot.app',
            'https://dashboard.tecnobot.app'
        ];
        
        // En desarrollo, permitir cualquier localhost
        if (NODE_ENV === 'development' && origin.includes('localhost')) {
            return callback(null, true);
        }
        
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-API-Key']
};

app.use(cors(corsOptions));

// Middleware de compresión
app.use(compression());

// Rate limiting global
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 1000, // límite de requests por IP
    message: {
        error: 'Too many requests from this IP',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting para webhooks y health checks
        return req.path.startsWith('/api/webhook') || 
               req.path === '/api/public/health' ||
               req.path === '/health';
    }
});

app.use(globalLimiter);

// Middleware de parsing
app.use(express.json({ 
    limit: '10mb',
    verify: (req, res, buf) => {
        // Guardar raw body para verificación de webhooks
        if (req.path.startsWith('/api/webhook')) {
            req.rawBody = buf;
        }
    }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware de logging
app.use(requestLogger);

// Health check endpoint (sin autenticación)
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: NODE_ENV,
        services: {
            database: 'connected',
            whatsapp: whatsappService.getAllConnectionsStatus(),
            ai: aiService.getProvidersStatus(),
            notifications: notificationService.getProvidersStatus()
        }
    });
});

// Rutas públicas (sin autenticación)
app.use('/api/public', publicRoutes);

// Rutas de webhooks (autenticación especial)
app.use('/api/webhook', webhookRoutes);

// Rutas de autenticación
app.use('/api/auth', authRoutes);

// Middleware de autenticación para rutas protegidas
app.use('/api', authMiddleware);

// Middleware de tenant para rutas que lo requieren
app.use('/api', tenantMiddleware);

// Rutas protegidas
app.use('/api/chatbots', chatbotRoutes);
app.use('/api/flows', flowRoutes);
app.use('/api/welcomes', welcomeRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/analytics', analyticsRoutes);

// Ruta para servir archivos estáticos del dashboard (en producción)
if (NODE_ENV === 'production') {
    const path = require('path');
    
    // Servir archivos estáticos del build del frontend
    app.use(express.static(path.join(__dirname, 'dist')));
    
    // Proxy para el dashboard (SPA routing)
    app.get('/dashboard/*', (req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
    
    // Ruta principal redirige al dashboard
    app.get('/', (req, res) => {
        res.redirect('/dashboard');
    });
} else {
    // En desarrollo, mostrar información de la API
    app.get('/', (req, res) => {
        res.json({
            name: 'TecnoBot API',
            version: '1.0.0',
            environment: NODE_ENV,
            documentation: '/api/docs',
            endpoints: {
                public: '/api/public',
                auth: '/api/auth',
                chatbots: '/api/chatbots',
                flows: '/api/flows',
                welcomes: '/api/welcomes',
                ai: '/api/ai',
                team: '/api/team',
                analytics: '/api/analytics',
                webhooks: '/api/webhook'
            },
            dashboard: 'http://localhost:5173' // URL del dev server del frontend
        });
    });
}

// Documentación de la API (desarrollo)
if (NODE_ENV === 'development') {
    app.get('/api/docs', (req, res) => {
        res.json({
            title: 'TecnoBot API Documentation',
            version: '1.0.0',
            description: 'Multi-tenant SaaS Chatbot Platform API',
            baseUrl: `http://localhost:${PORT}/api`,
            authentication: {
                type: 'Bearer Token',
                header: 'Authorization: Bearer <token>',
                obtain: 'POST /api/auth/login'
            },
            tenant: {
                header: 'X-Tenant-ID: <tenant_uuid>',
                description: 'Required for most endpoints after authentication'
            },
            endpoints: {
                // Documentación básica de endpoints
                'Authentication': {
                    'POST /auth/register': 'Register new user',
                    'POST /auth/login': 'Login user',
                    'POST /auth/logout': 'Logout user',
                    'GET /auth/profile': 'Get user profile',
                    'PUT /auth/profile': 'Update user profile'
                },
                'Chatbots': {
                    'GET /chatbots': 'List chatbots',
                    'POST /chatbots': 'Create chatbot',
                    'GET /chatbots/:id': 'Get chatbot',
                    'PUT /chatbots/:id': 'Update chatbot',
                    'DELETE /chatbots/:id': 'Delete chatbot'
                },
                'Flows': {
                    'GET /flows': 'List flows',
                    'POST /flows': 'Create flow',
                    'GET /flows/:id': 'Get flow',
                    'PUT /flows/:id': 'Update flow',
                    'DELETE /flows/:id': 'Delete flow'
                },
                'Analytics': {
                    'GET /analytics/dashboard': 'Dashboard metrics',
                    'GET /analytics/charts/:metric': 'Chart data',
                    'POST /analytics/reports': 'Generate custom report'
                },
                'Team': {
                    'GET /team/members': 'List team members',
                    'POST /team/invite': 'Invite team member',
                    'PUT /team/members/:id': 'Update member role',
                    'DELETE /team/members/:id': 'Remove team member'
                }
            },
            examples: {
                'Create Chatbot': {
                    method: 'POST',
                    url: '/api/chatbots',
                    headers: {
                        'Authorization': 'Bearer <token>',
                        'X-Tenant-ID': '<tenant_id>',
                        'Content-Type': 'application/json'
                    },
                    body: {
                        name: 'Mi Chatbot',
                        description: 'Chatbot de atención al cliente',
                        phone_number: '+1234567890',
                        welcome_message: 'Hola, ¿en qué puedo ayudarte?'
                    }
                }
            }
        });
    });
}

// Middleware de manejo de errores 404
app.use(notFoundHandler);

// Middleware global de manejo de errores
app.use(globalErrorHandler);

// Configurar eventos de servicios
setupServiceEvents();

// Función para configurar eventos entre servicios
function setupServiceEvents() {
    // Eventos de WhatsApp
    whatsappService.on('message_received', async (messageData) => {
        try {
            // Registrar evento de analytics
            await analyticsService.trackEvent(messageData.tenantId, 'message_received', {
                chatbot_id: messageData.chatbotId,
                conversation_id: messageData.conversationId,
                message_type: messageData.type,
                from: messageData.from
            });

            logger.info('Message received event tracked', {
                tenantId: messageData.tenantId,
                messageId: messageData.id
            });
        } catch (error) {
            logger.error('Failed to track message received event', {
                error: error.message
            });
        }
    });

    whatsappService.on('message_sent', async (data) => {
        try {
            await analyticsService.trackEvent(data.tenantId, 'message_sent', {
                message_id: data.messageId,
                result: data.result
            });
        } catch (error) {
            logger.error('Failed to track message sent event', {
                error: error.message
            });
        }
    });

    // Eventos de IA
    aiService.on('response_generated', async (data) => {
        try {
            await analyticsService.trackEvent(data.tenantId, 'ai_response_generated', {
                chatbot_id: data.chatbotId,
                conversation_id: data.conversationId,
                response_time: data.responseTime,
                tokens_used: data.tokensUsed
            });
        } catch (error) {
            logger.error('Failed to track AI response event', {
                error: error.message
            });
        }
    });

    // Eventos de notificaciones
    notificationService.on('notification_sent', async (data) => {
        try {
            await analyticsService.trackEvent(data.tenantId || 'system', 'notification_sent', {
                notification_id: data.id,
                type: data.type,
                recipient: data.recipient,
                status: data.result?.status || 'unknown'
            });
        } catch (error) {
            logger.error('Failed to track notification event', {
                error: error.message
            });
        }
    });

    logger.info('Service events configured successfully');
}

// Manejo de señales del sistema
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown(signal) {
    logger.info(`Received ${signal}, starting graceful shutdown...`);
    
    // Cerrar servidor HTTP
    server.close(() => {
        logger.info('HTTP server closed');
        
        // Limpiar recursos
        Promise.all([
            // Desconectar todas las conexiones de WhatsApp
            Promise.all(
                Array.from(whatsappService.connections.keys()).map(tenantId => 
                    whatsappService.disconnectConnection(tenantId).catch(err => 
                        logger.error('Error disconnecting WhatsApp', { tenantId, error: err.message })
                    )
                )
            ),
            // Procesar eventos pendientes de analytics
            analyticsService.processEventBatch().catch(err => 
                logger.error('Error processing analytics batch', { error: err.message })
            ),
            // Procesar notificaciones pendientes
            notificationService.processQueue().catch(err => 
                logger.error('Error processing notification queue', { error: err.message })
            )
        ]).then(() => {
            logger.info('Graceful shutdown completed');
            process.exit(0);
        }).catch((error) => {
            logger.error('Error during graceful shutdown', { error: error.message });
            process.exit(1);
        });
    });
    
    // Forzar cierre después de 30 segundos
    setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
    }, 30000);
}

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack
    });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', {
        reason: reason,
        promise: promise
    });
    process.exit(1);
});

// Iniciar servidor
const server = app.listen(PORT, () => {
    logger.info(`TecnoBot API server started`, {
        port: PORT,
        environment: NODE_ENV,
        timestamp: new Date().toISOString(),
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform
    });
    
    // Mostrar información útil en desarrollo
    if (NODE_ENV === 'development') {
        console.log('\n🚀 TecnoBot API Server Started!');
        console.log(`📡 API: http://localhost:${PORT}/api`);
        console.log(`📚 Docs: http://localhost:${PORT}/api/docs`);
        console.log(`🏥 Health: http://localhost:${PORT}/health`);
        console.log(`🌐 Public: http://localhost:${PORT}/api/public`);
        console.log('\n📋 Available endpoints:');
        console.log('  • POST /api/auth/register - Register new user');
        console.log('  • POST /api/auth/login - Login user');
        console.log('  • GET /api/chatbots - List chatbots (requires auth)');
        console.log('  • GET /api/public/health - System health');
        console.log('  • GET /api/public/info - Public information');
        console.log('\n💡 Use X-Tenant-ID header for tenant-specific operations');
        console.log('💡 Use Authorization: Bearer <token> for authenticated requests\n');
    }
});

// Exportar app para testing
module.exports = { app, server };