import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import { AppConfig, validateConfig } from './config/app-config.js'
import { injectSupabaseClient } from './config/supabase.js'
import { tenantIsolationMiddleware } from './middleware/tenant-isolation.js'
import { tenantIsolationMiddleware as tenantIsolationV2 } from './middleware/tenant-isolation-v2.js'
import { injectUserPermissions } from './middleware/rbac.js'
import { AuthService } from './services/auth-service.js'
import AuthServiceV2 from './services/auth-service-v2.js'
import { MultiSessionManager } from './services/multi-session-manager.js'

// Validar configuración al inicio
validateConfig()

const app = express()
const PORT = AppConfig.server.port

// Inicializar servicios globales
const authService = new AuthService()
const sessionManager = new MultiSessionManager()

// Middleware de seguridad
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:", "https:"],
        },
    },
    crossOriginEmbedderPolicy: false
}))

// CORS configurado
app.use(cors(AppConfig.server.cors))

// Compresión
app.use(compression())

// Rate limiting global
const limiter = rateLimit({
    windowMs: AppConfig.rateLimit.windowMs,
    max: AppConfig.rateLimit.maxRequests,
    message: {
        error: 'Demasiadas solicitudes',
        message: 'Has excedido el límite de solicitudes. Intenta de nuevo más tarde.',
        retryAfter: Math.ceil(AppConfig.rateLimit.windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Saltar rate limiting para health checks
        return req.path === '/health' || req.path === '/api/health'
    }
})
app.use(limiter)

// Parsing de JSON y URL encoded
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Middleware de logging personalizado
app.use((req, res, next) => {
    const start = Date.now()
    const originalSend = res.send
    
    res.send = function(data) {
        const duration = Date.now() - start
        console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`)
        return originalSend.call(this, data)
    }
    
    next()
})

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: AppConfig.server.environment,
        version: process.env.npm_package_version || '1.0.0',
        services: {
            database: 'connected',
            whatsapp: `${sessionManager.getActiveSessionsCount()} sesiones activas`,
            memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
        }
    })
})

// Middleware de Supabase (debe ir antes de los middlewares de autenticación)
app.use(injectSupabaseClient)

// Rutas públicas (sin autenticación)
app.use('/api/auth', await import('./routes/auth.js').then(m => m.default))
app.use('/api/public', await import('./routes/public.js').then(m => m.default))

// Rutas de gestión de tenants (algunas públicas, otras protegidas)
app.use('/api/tenants', await import('./routes/tenant-management.js').then(m => m.default))

// Middleware de autenticación y tenant isolation (para rutas protegidas)
// Usar el middleware v2 mejorado para mejor aislamiento
app.use('/api/chatbots', tenantIsolationV2)
app.use('/api/flows', tenantIsolationV2)
app.use('/api/welcomes', tenantIsolationV2)
app.use('/api/whatsapp', tenantIsolationV2)
app.use('/api/ai', tenantIsolationV2)
app.use('/api/analytics', tenantIsolationV2)
app.use('/api/team', tenantIsolationV2)
app.use('/api/admin', tenantIsolationV2)

// Inyectar permisos de usuario después del aislamiento de tenant
app.use('/api', injectUserPermissions)

// Rutas protegidas
app.use('/api/chatbots', await import('./routes/chatbots.js').then(m => m.default))
app.use('/api/flows', await import('./routes/flows.js').then(m => m.default))
app.use('/api/welcomes', await import('./routes/welcomes.js').then(m => m.default))
app.use('/api/whatsapp', await import('./routes/whatsapp.js').then(m => m.default))
app.use('/api/ai', await import('./routes/ai.js').then(m => m.default))
app.use('/api/analytics', await import('./routes/analytics.js').then(m => m.default))
app.use('/api/team', await import('./routes/team.js').then(m => m.default))
app.use('/api/admin', await import('./routes/admin.js').then(m => m.default))

// Webhook para WhatsApp (sin autenticación pero con validación)
app.use('/webhook', await import('./routes/webhook.js').then(m => m.default))

// Servir archivos estáticos del dashboard (en producción)
if (AppConfig.server.environment === 'production') {
    app.use(express.static('dist'))
    
    // Catch-all handler: enviar index.html para rutas del frontend
    app.get('*', (req, res) => {
        res.sendFile(path.join(process.cwd(), 'dist', 'index.html'))
    })
}

// Documentación de API (solo en desarrollo)
if (AppConfig.development.enableSwagger && AppConfig.server.environment !== 'production') {
    const swaggerUi = await import('swagger-ui-express')
    const swaggerDocument = await import('./docs/swagger.json', { assert: { type: 'json' } })
    
    app.use('/api/docs', swaggerUi.default.serve, swaggerUi.default.setup(swaggerDocument.default))
    console.log(`📚 Documentación API disponible en: http://${AppConfig.server.host}:${PORT}/api/docs`)
}

// Middleware de manejo de errores
app.use((err, req, res, next) => {
    console.error('❌ Error no manejado:', err)
    
    // Error de validación de JWT
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            error: 'Token inválido',
            message: 'El token de autenticación no es válido'
        })
    }
    
    // Error de token expirado
    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            error: 'Token expirado',
            message: 'El token de autenticación ha expirado'
        })
    }
    
    // Error de rate limiting
    if (err.status === 429) {
        return res.status(429).json({
            error: 'Demasiadas solicitudes',
            message: 'Has excedido el límite de solicitudes'
        })
    }
    
    // Error genérico del servidor
    res.status(err.status || 500).json({
        error: 'Error interno del servidor',
        message: AppConfig.server.environment === 'development' ? err.message : 'Algo salió mal',
        ...(AppConfig.server.environment === 'development' && { stack: err.stack })
    })
})

// Middleware para rutas no encontradas
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Ruta no encontrada',
        message: `La ruta ${req.originalUrl} no existe`,
        availableRoutes: [
            '/api/auth',
            '/api/chatbots',
            '/api/flows',
            '/api/welcomes',
            '/api/whatsapp',
            '/api/ai',
            '/api/analytics',
            '/api/team',
            '/webhook',
            '/health'
        ]
    })
})

// Manejo de señales del sistema para cierre graceful
process.on('SIGTERM', async () => {
    console.log('🔄 Recibida señal SIGTERM, cerrando servidor...')
    await gracefulShutdown()
})

process.on('SIGINT', async () => {
    console.log('🔄 Recibida señal SIGINT, cerrando servidor...')
    await gracefulShutdown()
})

// Función de cierre graceful
const gracefulShutdown = async () => {
    try {
        console.log('📱 Cerrando sesiones de WhatsApp...')
        await sessionManager.destroyAllSessions()
        
        console.log('🗄️  Cerrando conexiones de base de datos...')
        // Aquí podrías cerrar conexiones de DB si fuera necesario
        
        console.log('✅ Cierre graceful completado')
        process.exit(0)
    } catch (error) {
        console.error('❌ Error durante el cierre graceful:', error)
        process.exit(1)
    }
}

// Iniciar servidor
const server = app.listen(PORT, AppConfig.server.host, () => {
    console.log('🚀 ==================================')
    console.log('🤖 TecnoBot SAAS Server Iniciado')
    console.log('🚀 ==================================')
    console.log(`📍 URL: http://${AppConfig.server.host}:${PORT}`)
    console.log(`🌍 Entorno: ${AppConfig.server.environment}`)
    console.log(`📊 API: http://${AppConfig.server.host}:${PORT}/api`)
    console.log(`💚 Health: http://${AppConfig.server.host}:${PORT}/health`)
    console.log(`📱 WhatsApp Sessions: ${sessionManager.getActiveSessionsCount()}`)
    console.log('🚀 ==================================')
})

// Configurar timeout del servidor
server.timeout = 30000 // 30 segundos

// Exportar para testing
export { app, server, sessionManager, authService }
export default app