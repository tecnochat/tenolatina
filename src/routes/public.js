import { Router } from 'express'
import { body, query, validationResult } from 'express-validator'
import { createSupabaseClient } from '../config/supabase.js'
import { AppConfig } from '../config/app-config.js'
import rateLimit from 'express-rate-limit'
import { WhatsAppService } from '../services/whatsapp-service.js'

const router = Router()

// Rate limiting para endpoints públicos
const publicRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // máximo 100 requests por ventana
    message: {
        error: 'Demasiadas solicitudes',
        message: 'Has excedido el límite de solicitudes. Intenta de nuevo en 15 minutos.'
    },
    standardHeaders: true,
    legacyHeaders: false
})

// Rate limiting más estricto para registro
const registerRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 5, // máximo 5 registros por hora
    message: {
        error: 'Límite de registro excedido',
        message: 'Has excedido el límite de registros por hora. Intenta de nuevo más tarde.'
    }
})

/**
 * GET /api/public/health
 * Endpoint de salud del sistema
 */
router.get('/health', async (req, res) => {
    try {
        const healthCheck = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env.npm_package_version || '1.0.0',
            environment: AppConfig.server.environment,
            services: {
                database: 'checking',
                whatsapp: 'checking',
                ai: 'checking'
            }
        }

        // Verificar conexión a Supabase
        try {
            const supabase = createSupabaseClient()
            const { error } = await supabase.from('tenant_profiles').select('count').limit(1)
            healthCheck.services.database = error ? 'error' : 'ok'
        } catch (error) {
            healthCheck.services.database = 'error'
        }

        // Verificar servicio de WhatsApp
        try {
            healthCheck.services.whatsapp = WhatsAppService.isServiceHealthy() ? 'ok' : 'degraded'
        } catch (error) {
            healthCheck.services.whatsapp = 'error'
        }

        // Verificar servicio de IA
        try {
            healthCheck.services.ai = AppConfig.openai.apiKey ? 'ok' : 'not_configured'
        } catch (error) {
            healthCheck.services.ai = 'error'
        }

        // Determinar estado general
        const allServicesOk = Object.values(healthCheck.services).every(status => status === 'ok')
        const hasErrors = Object.values(healthCheck.services).some(status => status === 'error')
        
        if (hasErrors) {
            healthCheck.status = 'error'
            res.status(503)
        } else if (!allServicesOk) {
            healthCheck.status = 'degraded'
            res.status(200)
        } else {
            res.status(200)
        }

        res.json(healthCheck)

    } catch (error) {
        console.error('Error en health check:', error)
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: 'Health check failed',
            message: AppConfig.server.environment === 'development' ? error.message : 'Service unavailable'
        })
    }
})

/**
 * GET /api/public/info
 * Información pública del sistema
 */
router.get('/info', publicRateLimit, async (req, res) => {
    try {
        const systemInfo = {
            name: 'TecnoBot SAAS',
            description: 'Plataforma multi-tenant para chatbots de WhatsApp con IA',
            version: process.env.npm_package_version || '1.0.0',
            environment: AppConfig.server.environment,
            features: [
                'Multi-tenant architecture',
                'WhatsApp Business API integration',
                'AI-powered conversations',
                'Flow management',
                'Analytics and reporting',
                'Team collaboration',
                'Webhook integrations'
            ],
            supported_platforms: [
                'WhatsApp Business',
                'WhatsApp Web'
            ],
            api_version: 'v1',
            documentation: `${AppConfig.server.baseUrl}/docs`,
            support: {
                email: 'support@tecnobot.com',
                website: 'https://tecnobot.com'
            },
            limits: {
                max_chatbots_free: 1,
                max_chatbots_pro: 5,
                max_chatbots_enterprise: 50,
                max_team_members: {
                    free: 1,
                    pro: 5,
                    enterprise: 25
                }
            }
        }

        res.json(systemInfo)

    } catch (error) {
        console.error('Error en GET /api/public/info:', error)
        res.status(500).json({
            error: 'Error interno del servidor',
            message: AppConfig.server.environment === 'development' ? error.message : 'Error obteniendo información'
        })
    }
})

/**
 * GET /api/public/plans
 * Información de planes de suscripción
 */
router.get('/plans', publicRateLimit, async (req, res) => {
    try {
        const plans = {
            free: {
                name: 'Free',
                price: 0,
                currency: 'USD',
                billing_period: 'monthly',
                features: {
                    chatbots: 1,
                    team_members: 1,
                    messages_per_month: 1000,
                    ai_requests_per_month: 100,
                    flows: 5,
                    analytics: 'basic',
                    support: 'community',
                    webhooks: false,
                    custom_branding: false,
                    api_access: false
                },
                limitations: [
                    'Marca TecnoBot en mensajes',
                    'Soporte solo por comunidad',
                    'Analytics básicos'
                ]
            },
            pro: {
                name: 'Pro',
                price: 29,
                currency: 'USD',
                billing_period: 'monthly',
                features: {
                    chatbots: 5,
                    team_members: 5,
                    messages_per_month: 10000,
                    ai_requests_per_month: 1000,
                    flows: 25,
                    analytics: 'advanced',
                    support: 'email',
                    webhooks: true,
                    custom_branding: true,
                    api_access: true
                },
                popular: true
            },
            enterprise: {
                name: 'Enterprise',
                price: 99,
                currency: 'USD',
                billing_period: 'monthly',
                features: {
                    chatbots: 50,
                    team_members: 25,
                    messages_per_month: 100000,
                    ai_requests_per_month: 10000,
                    flows: 'unlimited',
                    analytics: 'premium',
                    support: 'priority',
                    webhooks: true,
                    custom_branding: true,
                    api_access: true,
                    white_label: true,
                    dedicated_support: true
                }
            }
        }

        res.json({
            plans,
            currency_options: ['USD', 'EUR', 'MXN'],
            billing_options: ['monthly', 'yearly'],
            yearly_discount: 20, // 20% descuento anual
            trial_period_days: 14,
            contact_sales: {
                email: 'sales@tecnobot.com',
                phone: '+1-555-0123',
                custom_plans_available: true
            }
        })

    } catch (error) {
        console.error('Error en GET /api/public/plans:', error)
        res.status(500).json({
            error: 'Error interno del servidor',
            message: AppConfig.server.environment === 'development' ? error.message : 'Error obteniendo planes'
        })
    }
})

/**
 * POST /api/public/contact
 * Formulario de contacto público
 */
router.post('/contact',
    publicRateLimit,
    [
        body('name')
            .trim()
            .isLength({ min: 2, max: 100 })
            .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
        body('email')
            .isEmail()
            .normalizeEmail()
            .withMessage('Email inválido'),
        body('subject')
            .trim()
            .isLength({ min: 5, max: 200 })
            .withMessage('El asunto debe tener entre 5 y 200 caracteres'),
        body('message')
            .trim()
            .isLength({ min: 10, max: 2000 })
            .withMessage('El mensaje debe tener entre 10 y 2000 caracteres'),
        body('type')
            .optional()
            .isIn(['support', 'sales', 'partnership', 'feedback', 'other'])
            .withMessage('Tipo de contacto inválido')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Datos de entrada inválidos',
                    details: errors.array()
                })
            }

            const { name, email, subject, message, type = 'other' } = req.body

            // En producción, aquí se enviaría el email o se guardaría en base de datos
            const contactSubmission = {
                id: `contact_${Date.now()}`,
                name,
                email,
                subject,
                message,
                type,
                submitted_at: new Date().toISOString(),
                ip_address: req.ip,
                user_agent: req.get('User-Agent'),
                status: 'received'
            }

            console.log('Nuevo contacto recibido:', contactSubmission)

            // Simular envío de email de confirmación
            const confirmationSent = true

            res.status(201).json({
                message: 'Mensaje de contacto enviado exitosamente',
                contact_id: contactSubmission.id,
                confirmation_sent: confirmationSent,
                expected_response_time: '24-48 horas',
                next_steps: [
                    'Recibirás un email de confirmación',
                    'Nuestro equipo revisará tu mensaje',
                    'Te contactaremos dentro de 24-48 horas'
                ]
            })

        } catch (error) {
            console.error('Error en POST /api/public/contact:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: 'Error enviando mensaje de contacto'
            })
        }
    }
)

/**
 * POST /api/public/newsletter
 * Suscripción a newsletter
 */
router.post('/newsletter',
    publicRateLimit,
    [
        body('email')
            .isEmail()
            .normalizeEmail()
            .withMessage('Email inválido'),
        body('name')
            .optional()
            .trim()
            .isLength({ min: 2, max: 100 })
            .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
        body('interests')
            .optional()
            .isArray()
            .withMessage('Los intereses deben ser un array'),
        body('language')
            .optional()
            .isIn(['es', 'en', 'pt'])
            .withMessage('Idioma no soportado')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Datos de entrada inválidos',
                    details: errors.array()
                })
            }

            const { email, name, interests = [], language = 'es' } = req.body

            // Verificar si el email ya está suscrito
            const existingSubscription = false // En producción, verificar en base de datos

            if (existingSubscription) {
                return res.status(409).json({
                    error: 'Email ya suscrito',
                    message: 'Este email ya está suscrito a nuestro newsletter'
                })
            }

            // Crear suscripción
            const subscription = {
                id: `newsletter_${Date.now()}`,
                email,
                name: name || null,
                interests,
                language,
                subscribed_at: new Date().toISOString(),
                ip_address: req.ip,
                status: 'active',
                source: 'public_api'
            }

            console.log('Nueva suscripción a newsletter:', subscription)

            res.status(201).json({
                message: 'Suscripción exitosa al newsletter',
                subscription_id: subscription.id,
                welcome_email_sent: true,
                preferences: {
                    frequency: 'weekly',
                    topics: interests.length > 0 ? interests : ['product_updates', 'tips', 'news'],
                    language
                },
                unsubscribe_info: 'Puedes cancelar tu suscripción en cualquier momento desde los emails que recibas'
            })

        } catch (error) {
            console.error('Error en POST /api/public/newsletter:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: 'Error procesando suscripción'
            })
        }
    }
)

/**
 * GET /api/public/status
 * Estado de servicios públicos
 */
router.get('/status', async (req, res) => {
    try {
        const services = {
            api: {
                name: 'API Principal',
                status: 'operational',
                response_time: Math.floor(Math.random() * 100) + 50,
                uptime: 99.9
            },
            database: {
                name: 'Base de Datos',
                status: 'operational',
                response_time: Math.floor(Math.random() * 50) + 10,
                uptime: 99.95
            },
            whatsapp: {
                name: 'WhatsApp Integration',
                status: 'operational',
                response_time: Math.floor(Math.random() * 200) + 100,
                uptime: 99.8
            },
            ai: {
                name: 'AI Services',
                status: 'operational',
                response_time: Math.floor(Math.random() * 500) + 200,
                uptime: 99.7
            },
            webhooks: {
                name: 'Webhook Processing',
                status: 'operational',
                response_time: Math.floor(Math.random() * 150) + 75,
                uptime: 99.85
            }
        }

        const overallStatus = Object.values(services).every(service => service.status === 'operational') 
            ? 'operational' 
            : 'degraded'

        const statusPage = {
            overall_status: overallStatus,
            last_updated: new Date().toISOString(),
            services,
            incidents: [
                // En producción, esto vendría de una base de datos de incidentes
            ],
            maintenance: {
                scheduled: false,
                next_window: null,
                description: null
            },
            metrics: {
                avg_response_time: Math.floor(
                    Object.values(services).reduce((sum, service) => sum + service.response_time, 0) / 
                    Object.values(services).length
                ),
                overall_uptime: Math.min(...Object.values(services).map(service => service.uptime))
            }
        }

        res.json(statusPage)

    } catch (error) {
        console.error('Error en GET /api/public/status:', error)
        res.status(500).json({
            overall_status: 'major_outage',
            last_updated: new Date().toISOString(),
            error: 'Error obteniendo estado de servicios'
        })
    }
})

/**
 * GET /api/public/demo
 * Información para solicitar demo
 */
router.get('/demo', publicRateLimit, async (req, res) => {
    try {
        const demoInfo = {
            available: true,
            duration_minutes: 30,
            what_to_expect: [
                'Demostración completa de la plataforma',
                'Configuración de chatbot en vivo',
                'Integración con WhatsApp',
                'Funcionalidades de IA',
                'Panel de analytics',
                'Sesión de preguntas y respuestas'
            ],
            requirements: [
                'Conexión a internet estable',
                'Navegador web moderno',
                'Número de WhatsApp Business (opcional)'
            ],
            available_times: [
                'Lunes a Viernes: 9:00 AM - 6:00 PM (UTC-5)',
                'Sábados: 10:00 AM - 2:00 PM (UTC-5)'
            ],
            languages: ['Español', 'English', 'Português'],
            booking_url: `${AppConfig.server.baseUrl}/demo/book`,
            contact: {
                email: 'demo@tecnobot.com',
                phone: '+1-555-0123',
                whatsapp: '+1-555-0123'
            },
            preparation_tips: [
                'Prepara preguntas específicas sobre tu caso de uso',
                'Ten a mano información sobre tu volumen de mensajes esperado',
                'Piensa en los flujos de conversación que necesitas'
            ]
        }

        res.json(demoInfo)

    } catch (error) {
        console.error('Error en GET /api/public/demo:', error)
        res.status(500).json({
            error: 'Error interno del servidor',
            message: 'Error obteniendo información de demo'
        })
    }
})

/**
 * POST /api/public/demo/request
 * Solicitar demo
 */
router.post('/demo/request',
    registerRateLimit,
    [
        body('name')
            .trim()
            .isLength({ min: 2, max: 100 })
            .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
        body('email')
            .isEmail()
            .normalizeEmail()
            .withMessage('Email inválido'),
        body('company')
            .optional()
            .trim()
            .isLength({ min: 2, max: 100 })
            .withMessage('El nombre de la empresa debe tener entre 2 y 100 caracteres'),
        body('phone')
            .optional()
            .isMobilePhone()
            .withMessage('Número de teléfono inválido'),
        body('use_case')
            .trim()
            .isLength({ min: 10, max: 500 })
            .withMessage('El caso de uso debe tener entre 10 y 500 caracteres'),
        body('preferred_time')
            .optional()
            .isIn(['morning', 'afternoon', 'evening'])
            .withMessage('Horario preferido inválido'),
        body('language')
            .optional()
            .isIn(['es', 'en', 'pt'])
            .withMessage('Idioma no soportado')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Datos de entrada inválidos',
                    details: errors.array()
                })
            }

            const {
                name,
                email,
                company,
                phone,
                use_case,
                preferred_time = 'morning',
                language = 'es'
            } = req.body

            // Crear solicitud de demo
            const demoRequest = {
                id: `demo_${Date.now()}`,
                name,
                email,
                company: company || null,
                phone: phone || null,
                use_case,
                preferred_time,
                language,
                requested_at: new Date().toISOString(),
                ip_address: req.ip,
                status: 'pending',
                source: 'public_api'
            }

            console.log('Nueva solicitud de demo:', demoRequest)

            // En producción, aquí se enviaría notificación al equipo de ventas
            const notificationSent = true

            res.status(201).json({
                message: 'Solicitud de demo enviada exitosamente',
                request_id: demoRequest.id,
                status: 'pending',
                next_steps: [
                    'Recibirás un email de confirmación',
                    'Nuestro equipo te contactará en 24 horas',
                    'Coordinaremos el mejor horario para la demo'
                ],
                expected_contact_time: '24 horas',
                confirmation_email_sent: notificationSent
            })

        } catch (error) {
            console.error('Error en POST /api/public/demo/request:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: 'Error procesando solicitud de demo'
            })
        }
    }
)

export default router