/**
 * Middleware de Aislamiento Multi-Tenant
 * 
 * Este middleware garantiza que todas las consultas a la base de datos
 * incluyan automáticamente el user_id del usuario autenticado,
 * proporcionando aislamiento completo entre tenants.
 */

import jwt from 'jsonwebtoken'
import { supabase } from '../config/supabase.js'

/**
 * Middleware de autenticación y extracción de tenant
 * Valida el JWT y extrae el user_id para usarlo como tenant_id
 */
export const authenticateAndExtractTenant = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'Token de autorización requerido',
                code: 'MISSING_AUTH_TOKEN'
            })
        }

        const token = authHeader.substring(7) // Remover 'Bearer '
        
        // Verificar token con Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token)
        
        if (error || !user) {
            return res.status(401).json({ 
                error: 'Token inválido o expirado',
                code: 'INVALID_TOKEN'
            })
        }

        // Agregar información del tenant al request
        req.tenant = {
            id: user.id,
            email: user.email,
            metadata: user.user_metadata || {}
        }
        
        // Configurar RLS automático para Supabase
        req.supabaseClient = supabase.auth.setSession({
            access_token: token,
            refresh_token: null
        })
        
        console.log(`🔐 Tenant autenticado: ${user.email} (${user.id})`)
        next()
        
    } catch (error) {
        console.error('❌ Error en autenticación de tenant:', error)
        return res.status(500).json({ 
            error: 'Error interno de autenticación',
            code: 'AUTH_ERROR'
        })
    }
}

/**
 * Middleware de validación de tenant para operaciones específicas
 * Valida que el tenant tenga permisos para acceder a recursos específicos
 */
export const validateTenantAccess = (resourceType) => {
    return async (req, res, next) => {
        try {
            const tenantId = req.tenant?.id
            const resourceId = req.params.id || req.params.chatbotId
            
            if (!tenantId) {
                return res.status(401).json({ 
                    error: 'Tenant no identificado',
                    code: 'TENANT_NOT_FOUND'
                })
            }

            // Validar acceso según el tipo de recurso
            let hasAccess = false
            
            switch (resourceType) {
                case 'chatbot':
                    hasAccess = await validateChatbotAccess(tenantId, resourceId)
                    break
                case 'flow':
                    hasAccess = await validateFlowAccess(tenantId, resourceId)
                    break
                case 'welcome':
                    hasAccess = await validateWelcomeAccess(tenantId, resourceId)
                    break
                default:
                    hasAccess = true // Para recursos generales
            }
            
            if (!hasAccess) {
                return res.status(403).json({ 
                    error: 'Acceso denegado al recurso',
                    code: 'ACCESS_DENIED',
                    resource: resourceType,
                    resourceId
                })
            }
            
            next()
            
        } catch (error) {
            console.error('❌ Error validando acceso de tenant:', error)
            return res.status(500).json({ 
                error: 'Error validando permisos',
                code: 'VALIDATION_ERROR'
            })
        }
    }
}

/**
 * Validar acceso a chatbot específico
 */
const validateChatbotAccess = async (tenantId, chatbotId) => {
    if (!chatbotId) return true // Para operaciones generales
    
    try {
        const { data, error } = await supabase
            .from('chatbots')
            .select('id')
            .eq('id', chatbotId)
            .eq('user_id', tenantId)
            .single()
            
        return !error && data
    } catch (error) {
        console.error('Error validando acceso a chatbot:', error)
        return false
    }
}

/**
 * Validar acceso a flow específico
 */
const validateFlowAccess = async (tenantId, flowId) => {
    if (!flowId) return true
    
    try {
        const { data, error } = await supabase
            .from('bot_flows')
            .select('id')
            .eq('id', flowId)
            .eq('user_id', tenantId)
            .single()
            
        return !error && data
    } catch (error) {
        console.error('Error validando acceso a flow:', error)
        return false
    }
}

/**
 * Validar acceso a welcome específico
 */
const validateWelcomeAccess = async (tenantId, welcomeId) => {
    if (!welcomeId) return true
    
    try {
        const { data, error } = await supabase
            .from('welcomes')
            .select('id')
            .eq('id', welcomeId)
            .eq('user_id', tenantId)
            .single()
            
        return !error && data
    } catch (error) {
        console.error('Error validando acceso a welcome:', error)
        return false
    }
}

/**
 * Middleware para inyectar automáticamente el tenant_id en las consultas
 * Modifica los servicios de base de datos para incluir automáticamente el filtro de tenant
 */
export const injectTenantFilter = (req, res, next) => {
    const tenantId = req.tenant?.id
    
    if (!tenantId) {
        return res.status(401).json({ 
            error: 'Tenant ID requerido',
            code: 'TENANT_ID_REQUIRED'
        })
    }
    
    // Crear cliente Supabase con RLS automático
    req.db = {
        from: (table) => {
            return supabase.from(table).eq('user_id', tenantId)
        },
        rpc: (fn, params = {}) => {
            return supabase.rpc(fn, { ...params, p_user_id: tenantId })
        }
    }
    
    next()
}

/**
 * Middleware de logging para auditoría de accesos por tenant
 */
export const logTenantActivity = (req, res, next) => {
    const tenantId = req.tenant?.id
    const tenantEmail = req.tenant?.email
    const method = req.method
    const path = req.path
    const ip = req.ip || req.connection.remoteAddress
    
    console.log(`📊 [${new Date().toISOString()}] Tenant Activity:`, {
        tenant: tenantEmail,
        tenantId,
        method,
        path,
        ip,
        userAgent: req.get('User-Agent')
    })
    
    next()
}

/**
 * Middleware de rate limiting por tenant
 * Limita las requests por tenant para evitar abuso
 */
const tenantRateLimits = new Map()

export const rateLimitByTenant = (maxRequests = 100, windowMs = 60000) => {
    return (req, res, next) => {
        const tenantId = req.tenant?.id
        
        if (!tenantId) {
            return next()
        }
        
        const now = Date.now()
        const windowStart = now - windowMs
        
        // Obtener o crear registro de rate limit para el tenant
        if (!tenantRateLimits.has(tenantId)) {
            tenantRateLimits.set(tenantId, [])
        }
        
        const requests = tenantRateLimits.get(tenantId)
        
        // Limpiar requests antiguos
        const validRequests = requests.filter(timestamp => timestamp > windowStart)
        
        if (validRequests.length >= maxRequests) {
            return res.status(429).json({
                error: 'Límite de requests excedido',
                code: 'RATE_LIMIT_EXCEEDED',
                limit: maxRequests,
                window: windowMs,
                retryAfter: Math.ceil((validRequests[0] + windowMs - now) / 1000)
            })
        }
        
        // Agregar request actual
        validRequests.push(now)
        tenantRateLimits.set(tenantId, validRequests)
        
        // Headers informativos
        res.set({
            'X-RateLimit-Limit': maxRequests,
            'X-RateLimit-Remaining': maxRequests - validRequests.length,
            'X-RateLimit-Reset': new Date(now + windowMs).toISOString()
        })
        
        next()
    }
}

/**
 * Middleware combinado para aplicar todas las protecciones de tenant
 */
export const tenantProtection = [
    authenticateAndExtractTenant,
    logTenantActivity,
    rateLimitByTenant(100, 60000), // 100 requests por minuto
    injectTenantFilter
]

/**
 * Utilidad para crear middleware de validación específico por recurso
 */
export const createTenantValidator = (resourceType) => {
    return [
        ...tenantProtection,
        validateTenantAccess(resourceType)
    ]
}