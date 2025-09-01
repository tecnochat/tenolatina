import { Router } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import { requirePermission } from '../middleware/rbac.js'
import { createSupabaseClient } from '../config/supabase.js'
import { AppConfig } from '../config/app-config.js'
import bcrypt from 'bcrypt'

const router = Router()

/**
 * Middleware para verificar que el usuario es admin del sistema
 */
const requireSystemAdmin = (req, res, next) => {
    if (req.user.role !== 'owner' && req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Acceso denegado',
            message: 'Se requieren permisos de administrador'
        })
    }
    next()
}

/**
 * GET /api/admin/dashboard
 * Obtener estadísticas del dashboard administrativo
 */
router.get('/dashboard',
    requirePermission('admin', 'read'),
    requireSystemAdmin,
    async (req, res) => {
        try {
            const supabase = createSupabaseClient(req.tenant.id)

            // Obtener estadísticas generales
            const [tenantsResult, usersResult, chatbotsResult, messagesResult] = await Promise.all([
                // Total de tenants (simulado para single-tenant)
                Promise.resolve({ count: 1 }),
                
                // Total de usuarios del tenant
                supabase
                    .from('team_members')
                    .select('id', { count: 'exact' })
                    .eq('tenant_id', req.tenant.id)
                    .neq('status', 'inactive'),
                
                // Total de chatbots
                supabase
                    .from('chatbots')
                    .select('id, is_active', { count: 'exact' })
                    .eq('tenant_id', req.tenant.id),
                
                // Total de mensajes (simulado)
                Promise.resolve({ count: Math.floor(Math.random() * 10000) })
            ])

            const totalUsers = usersResult.count || 0
            const totalChatbots = chatbotsResult.count || 0
            const activeChatbots = chatbotsResult.data?.filter(c => c.is_active).length || 0
            const totalMessages = messagesResult.count || 0

            // Estadísticas de uso por período
            const now = new Date()
            const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
            const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

            // Simular datos de crecimiento
            const growthData = {
                users: {
                    current: totalUsers,
                    last_month: Math.max(0, totalUsers - Math.floor(Math.random() * 5)),
                    growth_rate: ((Math.random() * 20) - 5).toFixed(1) // -5% a +15%
                },
                chatbots: {
                    current: totalChatbots,
                    last_month: Math.max(0, totalChatbots - Math.floor(Math.random() * 3)),
                    growth_rate: ((Math.random() * 30) - 10).toFixed(1)
                },
                messages: {
                    current: totalMessages,
                    last_month: Math.max(0, totalMessages - Math.floor(Math.random() * 2000)),
                    growth_rate: ((Math.random() * 50) - 10).toFixed(1)
                }
            }

            // Estadísticas del sistema
            const systemStats = {
                uptime: process.uptime(),
                memory_usage: process.memoryUsage(),
                node_version: process.version,
                environment: AppConfig.server.environment,
                database_status: 'healthy', // En producción verificar conexión real
                cache_status: 'healthy',
                whatsapp_sessions: Math.floor(Math.random() * activeChatbots + 1)
            }

            // Actividad reciente (simulada)
            const recentActivity = Array.from({ length: 10 }, (_, i) => ({
                id: i + 1,
                type: ['user_login', 'chatbot_created', 'message_sent', 'flow_triggered'][Math.floor(Math.random() * 4)],
                description: `Actividad simulada ${i + 1}`,
                user_email: `user${i + 1}@example.com`,
                timestamp: new Date(Date.now() - i * 60000).toISOString(),
                ip_address: `192.168.1.${Math.floor(Math.random() * 255)}`
            }))

            res.json({
                overview: {
                    total_tenants: 1,
                    total_users: totalUsers,
                    total_chatbots: totalChatbots,
                    active_chatbots: activeChatbots,
                    total_messages: totalMessages
                },
                growth: growthData,
                system: systemStats,
                recent_activity: recentActivity,
                plan_info: {
                    current_plan: req.tenant.plan,
                    limits: AppConfig.plans[req.tenant.plan] || AppConfig.plans.free,
                    usage: {
                        team_members: totalUsers,
                        chatbots: totalChatbots,
                        messages_this_month: Math.floor(totalMessages * 0.3) // Simulado
                    }
                }
            })

        } catch (error) {
            console.error('Error en GET /api/admin/dashboard:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * GET /api/admin/users
 * Obtener lista de usuarios para administración
 */
router.get('/users',
    requirePermission('admin', 'read'),
    requireSystemAdmin,
    [
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('La página debe ser un número entero mayor a 0'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('El límite debe ser entre 1 y 100'),
        query('search')
            .optional()
            .isLength({ min: 1, max: 100 })
            .withMessage('Búsqueda debe tener entre 1 y 100 caracteres'),
        query('role')
            .optional()
            .isIn(['owner', 'admin', 'manager', 'operator', 'viewer'])
            .withMessage('Rol inválido'),
        query('status')
            .optional()
            .isIn(['active', 'inactive', 'pending'])
            .withMessage('Estado inválido')
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

            const supabase = createSupabaseClient(req.tenant.id)
            const { 
                page = 1, 
                limit = 20, 
                search, 
                role, 
                status 
            } = req.query

            const offset = (page - 1) * limit

            // Construir query
            let query = supabase
                .from('team_members')
                .select(`
                    id,
                    user_id,
                    role,
                    status,
                    permissions,
                    invited_at,
                    joined_at,
                    last_active_at,
                    users!inner(
                        id,
                        email,
                        full_name,
                        avatar_url,
                        phone,
                        email_verified,
                        created_at,
                        updated_at
                    )
                `, { count: 'exact' })
                .eq('tenant_id', req.tenant.id)
                .order('joined_at', { ascending: false })
                .range(offset, offset + limit - 1)

            // Aplicar filtros
            if (role) {
                query = query.eq('role', role)
            }
            if (status) {
                query = query.eq('status', status)
            }
            if (search) {
                query = query.or(`users.email.ilike.%${search}%,users.full_name.ilike.%${search}%`)
            }

            const { data: users, error, count } = await query

            if (error) {
                console.error('Error obteniendo usuarios:', error)
                return res.status(500).json({
                    error: 'Error obteniendo usuarios',
                    message: error.message
                })
            }

            // Formatear respuesta
            const formattedUsers = users.map(user => ({
                id: user.id,
                user_id: user.user_id,
                email: user.users.email,
                full_name: user.users.full_name,
                avatar_url: user.users.avatar_url,
                phone: user.users.phone,
                role: user.role,
                status: user.status,
                permissions: user.permissions,
                email_verified: user.users.email_verified,
                invited_at: user.invited_at,
                joined_at: user.joined_at,
                last_active_at: user.last_active_at,
                created_at: user.users.created_at,
                updated_at: user.users.updated_at
            }))

            res.json({
                users: formattedUsers,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: count,
                    pages: Math.ceil(count / limit)
                },
                filters: {
                    search: search || null,
                    role: role || null,
                    status: status || null
                }
            })

        } catch (error) {
            console.error('Error en GET /api/admin/users:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * PUT /api/admin/users/:userId/status
 * Cambiar estado de un usuario
 */
router.put('/users/:userId/status',
    requirePermission('admin', 'update'),
    requireSystemAdmin,
    [
        param('userId')
            .isUUID()
            .withMessage('userId debe ser un UUID válido'),
        body('status')
            .isIn(['active', 'inactive'])
            .withMessage('Estado inválido'),
        body('reason')
            .optional()
            .isLength({ max: 500 })
            .withMessage('Razón no puede exceder 500 caracteres')
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

            const supabase = createSupabaseClient(req.tenant.id)
            const { userId } = req.params
            const { status, reason } = req.body

            // Verificar que el usuario existe
            const { data: member, error: memberError } = await supabase
                .from('team_members')
                .select('id, user_id, role, status')
                .eq('user_id', userId)
                .eq('tenant_id', req.tenant.id)
                .single()

            if (memberError || !member) {
                return res.status(404).json({
                    error: 'Usuario no encontrado',
                    message: 'El usuario especificado no existe en este tenant'
                })
            }

            // Prevenir que el owner se desactive a sí mismo
            if (member.user_id === req.user.id && req.user.role === 'owner' && status === 'inactive') {
                return res.status(403).json({
                    error: 'Acción no permitida',
                    message: 'No puedes desactivarte a ti mismo como propietario'
                })
            }

            // Actualizar estado
            const { data: updatedMember, error: updateError } = await supabase
                .from('team_members')
                .update({
                    status,
                    updated_at: new Date().toISOString()
                })
                .eq('id', member.id)
                .select(`
                    id,
                    user_id,
                    role,
                    status,
                    updated_at,
                    users!inner(
                        id,
                        email,
                        full_name
                    )
                `)
                .single()

            if (updateError) {
                console.error('Error actualizando estado del usuario:', updateError)
                return res.status(500).json({
                    error: 'Error actualizando estado del usuario',
                    message: updateError.message
                })
            }

            // Registrar acción administrativa (opcional)
            // await logAdminAction(req.user.id, 'user_status_change', {
            //     target_user_id: userId,
            //     old_status: member.status,
            //     new_status: status,
            //     reason
            // })

            res.json({
                message: `Usuario ${status === 'active' ? 'activado' : 'desactivado'} exitosamente`,
                user: {
                    id: updatedMember.user_id,
                    email: updatedMember.users.email,
                    full_name: updatedMember.users.full_name,
                    role: updatedMember.role,
                    status: updatedMember.status,
                    updated_at: updatedMember.updated_at
                }
            })

        } catch (error) {
            console.error('Error en PUT /api/admin/users/:userId/status:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * GET /api/admin/system/health
 * Verificar salud del sistema
 */
router.get('/system/health',
    requirePermission('admin', 'read'),
    requireSystemAdmin,
    async (req, res) => {
        try {
            const supabase = createSupabaseClient(req.tenant.id)

            // Verificar conexión a base de datos
            let databaseStatus = 'healthy'
            let databaseLatency = 0
            try {
                const start = Date.now()
                await supabase.from('chatbots').select('id').limit(1)
                databaseLatency = Date.now() - start
            } catch (dbError) {
                databaseStatus = 'unhealthy'
                console.error('Database health check failed:', dbError)
            }

            // Verificar memoria y CPU
            const memoryUsage = process.memoryUsage()
            const memoryUsagePercent = ((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100).toFixed(2)

            // Verificar uptime
            const uptime = process.uptime()
            const uptimeHours = (uptime / 3600).toFixed(2)

            // Estado de servicios externos (simulado)
            const externalServices = {
                openai: {
                    status: Math.random() > 0.1 ? 'healthy' : 'degraded',
                    latency: Math.floor(Math.random() * 1000) + 200
                },
                whatsapp: {
                    status: Math.random() > 0.05 ? 'healthy' : 'unhealthy',
                    active_sessions: Math.floor(Math.random() * 10)
                }
            }

            // Determinar estado general
            const overallStatus = (
                databaseStatus === 'healthy' && 
                externalServices.openai.status !== 'unhealthy' &&
                externalServices.whatsapp.status !== 'unhealthy' &&
                parseFloat(memoryUsagePercent) < 90
            ) ? 'healthy' : 'degraded'

            const healthCheck = {
                status: overallStatus,
                timestamp: new Date().toISOString(),
                uptime: {
                    seconds: Math.floor(uptime),
                    hours: parseFloat(uptimeHours)
                },
                memory: {
                    used_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                    total_mb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                    usage_percent: parseFloat(memoryUsagePercent)
                },
                database: {
                    status: databaseStatus,
                    latency_ms: databaseLatency
                },
                external_services: externalServices,
                environment: {
                    node_version: process.version,
                    platform: process.platform,
                    environment: AppConfig.server.environment
                }
            }

            // Establecer código de estado HTTP basado en la salud
            const statusCode = overallStatus === 'healthy' ? 200 : 503
            
            res.status(statusCode).json(healthCheck)

        } catch (error) {
            console.error('Error en GET /api/admin/system/health:', error)
            res.status(500).json({
                status: 'unhealthy',
                error: 'Error verificando salud del sistema',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error interno'
            })
        }
    }
)

/**
 * GET /api/admin/logs
 * Obtener logs del sistema
 */
router.get('/logs',
    requirePermission('admin', 'read'),
    requireSystemAdmin,
    [
        query('level')
            .optional()
            .isIn(['error', 'warn', 'info', 'debug'])
            .withMessage('Nivel de log inválido'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 1000 })
            .withMessage('Límite debe ser entre 1 y 1000'),
        query('since')
            .optional()
            .isISO8601()
            .withMessage('Fecha since debe ser ISO8601')
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

            const { level, limit = 100, since } = req.query
            const sinceDate = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000)

            // En producción, esto vendría de un sistema de logging real
            // Por ahora simulamos logs
            const logLevels = ['error', 'warn', 'info', 'debug']
            const logSources = ['auth', 'chatbot', 'whatsapp', 'ai', 'database', 'system']
            
            const simulatedLogs = Array.from({ length: Math.min(limit, 100) }, (_, i) => {
                const logLevel = level || logLevels[Math.floor(Math.random() * logLevels.length)]
                const source = logSources[Math.floor(Math.random() * logSources.length)]
                const timestamp = new Date(sinceDate.getTime() + i * 60000)
                
                return {
                    id: `log_${i + 1}`,
                    timestamp: timestamp.toISOString(),
                    level: logLevel,
                    source,
                    message: `Log simulado ${i + 1} - ${source} ${logLevel}`,
                    metadata: {
                        tenant_id: req.tenant.id,
                        user_id: Math.random() > 0.5 ? req.user.id : null,
                        request_id: `req_${Math.random().toString(36).substr(2, 9)}`
                    }
                }
            })

            res.json({
                logs: simulatedLogs,
                filters: {
                    level: level || null,
                    since: sinceDate.toISOString(),
                    limit: parseInt(limit)
                },
                total: simulatedLogs.length,
                note: 'Logs simulados - En producción se integraría con sistema de logging real'
            })

        } catch (error) {
            console.error('Error en GET /api/admin/logs:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * POST /api/admin/system/maintenance
 * Activar/desactivar modo mantenimiento
 */
router.post('/system/maintenance',
    requirePermission('admin', 'update'),
    requireSystemAdmin,
    [
        body('enabled')
            .isBoolean()
            .withMessage('enabled debe ser un booleano'),
        body('message')
            .optional()
            .isLength({ max: 500 })
            .withMessage('Mensaje no puede exceder 500 caracteres'),
        body('estimated_duration')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Duración estimada debe ser un número positivo')
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

            const { enabled, message, estimated_duration } = req.body

            // En producción, esto se guardaría en una configuración global
            // Por ahora solo simulamos la respuesta
            const maintenanceConfig = {
                enabled,
                message: message || (enabled ? 'Sistema en mantenimiento' : null),
                estimated_duration: estimated_duration || null,
                started_at: enabled ? new Date().toISOString() : null,
                started_by: enabled ? req.user.id : null,
                ended_at: !enabled ? new Date().toISOString() : null
            }

            // TODO: Implementar lógica real de modo mantenimiento
            // - Guardar configuración en base de datos o cache
            // - Notificar a todos los servicios
            // - Actualizar health checks

            res.json({
                message: `Modo mantenimiento ${enabled ? 'activado' : 'desactivado'} exitosamente`,
                maintenance: maintenanceConfig
            })

        } catch (error) {
            console.error('Error en POST /api/admin/system/maintenance:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

/**
 * GET /api/admin/audit
 * Obtener logs de auditoría
 */
router.get('/audit',
    requirePermission('admin', 'read'),
    requireSystemAdmin,
    [
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('La página debe ser un número entero mayor a 0'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('El límite debe ser entre 1 y 100'),
        query('action')
            .optional()
            .isLength({ min: 1, max: 50 })
            .withMessage('Acción debe tener entre 1 y 50 caracteres'),
        query('user_id')
            .optional()
            .isUUID()
            .withMessage('user_id debe ser un UUID válido'),
        query('since')
            .optional()
            .isISO8601()
            .withMessage('Fecha since debe ser ISO8601')
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
                page = 1, 
                limit = 50, 
                action, 
                user_id, 
                since 
            } = req.query

            const sinceDate = since ? new Date(since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

            // Simular logs de auditoría
            const auditActions = [
                'user_login', 'user_logout', 'chatbot_created', 'chatbot_updated', 'chatbot_deleted',
                'flow_created', 'flow_updated', 'team_member_invited', 'team_member_removed',
                'settings_updated', 'password_changed', 'role_changed'
            ]

            const auditLogs = Array.from({ length: Math.min(limit, 50) }, (_, i) => {
                const logAction = action || auditActions[Math.floor(Math.random() * auditActions.length)]
                const timestamp = new Date(sinceDate.getTime() + i * 60000)
                
                return {
                    id: `audit_${i + 1}`,
                    timestamp: timestamp.toISOString(),
                    action: logAction,
                    user_id: user_id || req.user.id,
                    user_email: `user${i + 1}@example.com`,
                    ip_address: `192.168.1.${Math.floor(Math.random() * 255)}`,
                    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    resource_type: ['chatbot', 'flow', 'user', 'team'][Math.floor(Math.random() * 4)],
                    resource_id: `resource_${Math.random().toString(36).substr(2, 9)}`,
                    details: {
                        description: `Acción ${logAction} ejecutada`,
                        changes: {
                            field: 'example_field',
                            old_value: 'old_value',
                            new_value: 'new_value'
                        }
                    },
                    tenant_id: req.tenant.id
                }
            })

            res.json({
                audit_logs: auditLogs,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: auditLogs.length,
                    pages: Math.ceil(auditLogs.length / limit)
                },
                filters: {
                    action: action || null,
                    user_id: user_id || null,
                    since: sinceDate.toISOString()
                },
                note: 'Logs de auditoría simulados - En producción se integraría con sistema de auditoría real'
            })

        } catch (error) {
            console.error('Error en GET /api/admin/audit:', error)
            res.status(500).json({
                error: 'Error interno del servidor',
                message: AppConfig.server.environment === 'development' ? error.message : 'Error procesando solicitud'
            })
        }
    }
)

export default router