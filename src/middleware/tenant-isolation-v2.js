/**
 * Middleware de Aislamiento Multi-Tenant v2.0
 * 
 * Versión mejorada que garantiza el aislamiento completo entre tenants
 * utilizando la nueva estructura de base de datos con tenant_id
 */

import jwt from 'jsonwebtoken'
import supabase, { createTenantClient } from '../config/supabase.js'
import { AppConfig } from '../config/app-config.js'
import { logger } from '../utils/logger.js'

/**
 * Cache de información de tenants para optimizar rendimiento
 */
const tenantCache = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

/**
 * Middleware principal de aislamiento de tenants
 * Extrae el tenant del token JWT y configura el contexto
 */
export const tenantIsolationMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'Token de autorización requerido',
                code: 'MISSING_AUTH_TOKEN'
            })
        }

        const token = authHeader.substring(7)
        
        // Verificar token con Supabase
        const supabaseClient = supabase
        const { data: { user }, error } = await supabaseClient.auth.getUser(token)
        
        if (error || !user) {
            return res.status(401).json({ 
                error: 'Token inválido o expirado',
                code: 'INVALID_TOKEN'
            })
        }

        // Obtener información del tenant
        const tenantInfo = await getTenantInfo(user.id)
        
        if (!tenantInfo) {
            return res.status(403).json({ 
                error: 'Tenant no encontrado o inactivo',
                code: 'TENANT_NOT_FOUND'
            })
        }

        // Verificar límites del plan
        const planLimits = AppConfig.plans[tenantInfo.plan] || AppConfig.plans.free
        
        // Configurar contexto del request
        req.tenant = {
            id: tenantInfo.id,
            userId: user.id,
            email: user.email,
            name: tenantInfo.name,
            slug: tenantInfo.slug,
            plan: tenantInfo.plan,
            subscriptionStatus: tenantInfo.subscription_status,
            limits: planLimits,
            metadata: user.user_metadata || {}
        }
        
        // Crear cliente Supabase con contexto de tenant
        req.supabase = supabase
        
        // Log de actividad
        logger.info(`🔐 Tenant autenticado: ${tenantInfo.name} (${tenantInfo.id}) - Usuario: ${user.email}`, {
            tenantId: tenantInfo.id,
            userId: user.id,
            endpoint: req.path,
            method: req.method
        })
        
        next()
        
    } catch (error) {
        logger.error('❌ Error en middleware de tenant isolation:', error)
        return res.status(500).json({ 
            error: 'Error interno de autenticación',
            code: 'AUTH_ERROR'
        })
    }
}

/**
 * Obtener información del tenant con cache
 */
async function getTenantInfo(userId) {
    const cacheKey = `tenant_${userId}`
    const cached = tenantCache.get(cacheKey)
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data
    }
    
    try {
        const supabaseClient = supabase
        
        // Buscar tenant por user_id en tenant_users
        const { data: tenantUser, error: tenantUserError } = await supabaseClient
            .from('tenant_users')
            .select(`
                tenant_id,
                role,
                tenants (
                    id,
                    name,
                    slug,
                    plan,
                    subscription_status,
                    is_active
                )
            `)
            .eq('user_id', userId)
            .single()
        
        if (tenantUserError || !tenantUser) {
            logger.warn(`Tenant no encontrado para usuario: ${userId}`, tenantUserError)
            return null
        }
        
        const tenant = tenantUser.tenants
        
        if (!tenant || tenant.subscription_status !== 'active') {
            logger.warn(`Tenant con suscripción inactiva: ${tenant?.id}`, { userId, tenantId: tenant?.id })
            return null
        }
        
        const tenantInfo = {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            plan: tenant.plan,
            subscription_status: tenant.subscription_status,
            role: tenantUser.role
        }
        
        // Guardar en cache
        tenantCache.set(cacheKey, {
            data: tenantInfo,
            timestamp: Date.now()
        })
        
        return tenantInfo
        
    } catch (error) {
        logger.error('Error obteniendo información del tenant:', error)
        return null
    }
}

/**
 * Middleware para validar acceso a recursos específicos
 */
export const requireResourceAccess = (resourceType) => {
    return async (req, res, next) => {
        try {
            const tenantId = req.tenant?.id
            const resourceId = req.params.id || req.params.chatbotId || req.params.flowId
            
            if (!tenantId) {
                return res.status(401).json({ 
                    error: 'Tenant no identificado',
                    code: 'TENANT_NOT_FOUND'
                })
            }

            if (!resourceId) {
                // Si no hay resourceId, solo verificamos que el tenant esté autenticado
                return next()
            }

            const hasAccess = await validateResourceAccess(tenantId, resourceType, resourceId)
            
            if (!hasAccess) {
                return res.status(403).json({ 
                    error: 'Acceso denegado al recurso',
                    code: 'RESOURCE_ACCESS_DENIED',
                    details: {
                        resourceType,
                        resourceId,
                        tenantId
                    }
                })
            }
            
            next()
            
        } catch (error) {
            logger.error('Error validando acceso a recurso:', error)
            return res.status(500).json({ 
                error: 'Error interno validando acceso',
                code: 'RESOURCE_VALIDATION_ERROR'
            })
        }
    }
}

/**
 * Validar acceso a un recurso específico
 */
async function validateResourceAccess(tenantId, resourceType, resourceId) {
    try {
        const supabaseClient = supabase
        
        let query
        
        switch (resourceType) {
            case 'chatbot':
                query = supabase
                    .from('chatbots')
                    .select('id')
                    .eq('id', resourceId)
                    .eq('tenant_id', tenantId)
                break
                
            case 'flow':
                query = supabase
                    .from('flows')
                    .select('id')
                    .eq('id', resourceId)
                    .eq('tenant_id', tenantId)
                break
                
            case 'conversation':
                query = supabase
                    .from('conversations')
                    .select('id')
                    .eq('id', resourceId)
                    .eq('tenant_id', tenantId)
                break
                
            case 'message':
                query = supabase
                    .from('messages')
                    .select('id')
                    .eq('id', resourceId)
                    .eq('tenant_id', tenantId)
                break
                
            default:
                logger.warn(`Tipo de recurso no reconocido: ${resourceType}`)
                return false
        }
        
        const { data, error } = await query.single()
        
        if (error) {
            logger.warn(`Recurso no encontrado: ${resourceType}/${resourceId}`, error)
            return false
        }
        
        return !!data
        
    } catch (error) {
        logger.error('Error validando acceso a recurso:', error)
        return false
    }
}

/**
 * Middleware para verificar límites del plan
 */
export const checkPlanLimits = (limitType) => {
    return async (req, res, next) => {
        try {
            const tenant = req.tenant
            
            if (!tenant) {
                return res.status(401).json({ 
                    error: 'Tenant no identificado',
                    code: 'TENANT_NOT_FOUND'
                })
            }
            
            const limits = tenant.limits
            let currentUsage = 0
            let maxAllowed = 0
            
            switch (limitType) {
                case 'chatbots':
                    maxAllowed = limits.maxChatbots
                    if (maxAllowed !== -1) { // -1 significa ilimitado
                        currentUsage = await getCurrentChatbotCount(tenant.id)
                    }
                    break
                    
                case 'whatsapp_sessions':
                    maxAllowed = limits.maxWhatsappSessions
                    if (maxAllowed !== -1) {
                        currentUsage = await getCurrentSessionCount(tenant.id)
                    }
                    break
                    
                case 'team_members':
                    maxAllowed = limits.maxTeamMembers
                    if (maxAllowed !== -1) {
                        currentUsage = await getCurrentTeamMemberCount(tenant.id)
                    }
                    break
                    
                default:
                    return next() // Límite no reconocido, continuar
            }
            
            if (maxAllowed !== -1 && currentUsage >= maxAllowed) {
                return res.status(403).json({ 
                    error: 'Límite del plan excedido',
                    code: 'PLAN_LIMIT_EXCEEDED',
                    details: {
                        limitType,
                        currentUsage,
                        maxAllowed,
                        plan: tenant.plan
                    }
                })
            }
            
            // Agregar información de límites al request
            req.planUsage = {
                [limitType]: {
                    current: currentUsage,
                    max: maxAllowed,
                    remaining: maxAllowed === -1 ? -1 : maxAllowed - currentUsage
                }
            }
            
            next()
            
        } catch (error) {
            logger.error('Error verificando límites del plan:', error)
            return res.status(500).json({ 
                error: 'Error interno verificando límites',
                code: 'PLAN_LIMIT_CHECK_ERROR'
            })
        }
    }
}

/**
 * Funciones auxiliares para obtener uso actual
 */
async function getCurrentChatbotCount(tenantId) {
    try {
        const supabaseClient = supabase
        const { count, error } = await supabaseClient
            .from('chatbots')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
        
        return error ? 0 : count
    } catch (error) {
        logger.error('Error obteniendo conteo de chatbots:', error)
        return 0
    }
}

async function getCurrentSessionCount(tenantId) {
    try {
        const supabaseClient = supabase
        const { count, error } = await supabaseClient
            .from('chatbots')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .not('whatsapp_session', 'is', null)
        
        return error ? 0 : count
    } catch (error) {
        logger.error('Error obteniendo conteo de sesiones:', error)
        return 0
    }
}

async function getCurrentTeamMemberCount(tenantId) {
    try {
        const supabaseClient = supabase
        const { count, error } = await supabaseClient
            .from('tenant_users')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
        
        return error ? 0 : count
    } catch (error) {
        logger.error('Error obteniendo conteo de miembros del equipo:', error)
        return 0
    }
}

/**
 * Limpiar cache periódicamente
 */
setInterval(() => {
    const now = Date.now()
    for (const [key, value] of tenantCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            tenantCache.delete(key)
        }
    }
}, CACHE_TTL)

/**
 * Middleware combinado para protección completa de tenant
 */
export const tenantProtection = [
    tenantIsolationMiddleware
]

export default {
    tenantIsolationMiddleware,
    requireResourceAccess,
    checkPlanLimits,
    tenantProtection
}