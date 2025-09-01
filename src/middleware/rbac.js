/**
 * Sistema de Control de Acceso Basado en Roles (RBAC)
 * 
 * Define roles, permisos y middleware para controlar el acceso
 * a diferentes funcionalidades de la plataforma SAAS
 */

import supabase from '../config/supabase.js'
import { logger } from '../utils/logger.js'

// Definición de roles y sus permisos
const ROLES = {
    // Administrador de la plataforma
    PLATFORM_ADMIN: {
        name: 'platform_admin',
        description: 'Administrador de la plataforma',
        permissions: [
            'platform:manage',
            'users:view_all',
            'users:manage_all',
            'tenants:view_all',
            'tenants:manage_all',
            'billing:view_all',
            'billing:manage_all',
            'analytics:view_all',
            'system:configure'
        ]
    },
    
    // Administrador de tenant (usuario principal de cada empresa)
    TENANT_ADMIN: {
        name: 'tenant_admin',
        description: 'Administrador del tenant',
        permissions: [
            'tenant:manage',
            'chatbots:create',
            'chatbots:read',
            'chatbots:update',
            'chatbots:delete',
            'flows:create',
            'flows:read',
            'flows:update',
            'flows:delete',
            'ai:configure',
            'whatsapp:connect',
            'whatsapp:disconnect',
            'users:invite',
            'users:manage_team',
            'analytics:view_own',
            'billing:view_own',
            'settings:manage'
        ]
    },
    
    // Editor de chatbots (puede crear y editar pero no eliminar)
    CHATBOT_EDITOR: {
        name: 'chatbot_editor',
        description: 'Editor de chatbots',
        permissions: [
            'chatbots:create',
            'chatbots:read',
            'chatbots:update',
            'flows:create',
            'flows:read',
            'flows:update',
            'ai:configure',
            'analytics:view_own'
        ]
    },
    
    // Operador (solo puede ver y usar chatbots existentes)
    OPERATOR: {
        name: 'operator',
        description: 'Operador de chatbots',
        permissions: [
            'chatbots:read',
            'flows:read',
            'conversations:manage',
            'analytics:view_limited'
        ]
    },
    
    // Viewer (solo lectura)
    VIEWER: {
        name: 'viewer',
        description: 'Solo lectura',
        permissions: [
            'chatbots:read',
            'flows:read',
            'analytics:view_limited'
        ]
    }
}

// Mapa de permisos para fácil acceso
const PERMISSIONS = {
    // Plataforma
    PLATFORM_MANAGE: 'platform:manage',
    
    // Usuarios
    USERS_VIEW_ALL: 'users:view_all',
    USERS_MANAGE_ALL: 'users:manage_all',
    USERS_INVITE: 'users:invite',
    USERS_MANAGE_TEAM: 'users:manage_team',
    
    // Tenants
    TENANT_MANAGE: 'tenant:manage',
    TENANTS_VIEW_ALL: 'tenants:view_all',
    TENANTS_MANAGE_ALL: 'tenants:manage_all',
    
    // Chatbots
    CHATBOTS_CREATE: 'chatbots:create',
    CHATBOTS_READ: 'chatbots:read',
    CHATBOTS_UPDATE: 'chatbots:update',
    CHATBOTS_DELETE: 'chatbots:delete',
    
    // Flows
    FLOWS_CREATE: 'flows:create',
    FLOWS_READ: 'flows:read',
    FLOWS_UPDATE: 'flows:update',
    FLOWS_DELETE: 'flows:delete',
    
    // IA
    AI_CONFIGURE: 'ai:configure',
    
    // WhatsApp
    WHATSAPP_CONNECT: 'whatsapp:connect',
    WHATSAPP_DISCONNECT: 'whatsapp:disconnect',
    
    // Conversaciones
    CONVERSATIONS_MANAGE: 'conversations:manage',
    
    // Analytics
    ANALYTICS_VIEW_ALL: 'analytics:view_all',
    ANALYTICS_VIEW_OWN: 'analytics:view_own',
    ANALYTICS_VIEW_LIMITED: 'analytics:view_limited',
    
    // Billing
    BILLING_VIEW_ALL: 'billing:view_all',
    BILLING_MANAGE_ALL: 'billing:manage_all',
    BILLING_VIEW_OWN: 'billing:view_own',
    
    // Settings
    SETTINGS_MANAGE: 'settings:manage',
    SYSTEM_CONFIGURE: 'system:configure'
}

class RBACService {
    constructor() {
        this.roles = ROLES
        this.permissions = PERMISSIONS
    }

    /**
     * Obtener rol del usuario en un tenant específico
     */
    async getUserRole(userId, tenantId) {
        try {
            // Obtener rol del usuario en el tenant específico
            const { data: tenantUser, error } = await supabase
                .from('tenant_users')
                .select('role')
                .eq('user_id', userId)
                .eq('tenant_id', tenantId)
                .eq('is_active', true)
                .single()

            if (error) {
                logger.error('Error obteniendo rol de usuario:', error)
                return ROLES.VIEWER // Rol más restrictivo por defecto
            }

            if (!tenantUser) {
                logger.warn(`Usuario ${userId} no encontrado en tenant ${tenantId}`)
                return ROLES.VIEWER
            }

            // Mapear el rol de la base de datos al rol del sistema
            const roleName = this.mapDatabaseRoleToSystemRole(tenantUser.role)
            return this.getRoleByName(roleName)

        } catch (error) {
            logger.error('Error obteniendo rol de usuario:', error)
            return ROLES.VIEWER // Rol más restrictivo por defecto
        }
    }

    /**
     * Obtener rol por nombre
     */
    getRoleByName(roleName) {
        const role = Object.values(ROLES).find(r => r.name === roleName)
        return role || ROLES.VIEWER
    }

    /**
     * Mapear rol de base de datos a rol del sistema
     */
    mapDatabaseRoleToSystemRole(dbRole) {
        const roleMapping = {
            'owner': 'tenant_admin',
            'admin': 'tenant_admin', 
            'editor': 'chatbot_editor',
            'viewer': 'viewer',
            'operator': 'operator'
        }
        return roleMapping[dbRole] || 'viewer'
    }

    /**
     * Verificar si un usuario tiene un permiso específico
     */
    async hasPermission(userId, tenantId, permission) {
        try {
            const userRole = await this.getUserRole(userId, tenantId)
            return userRole.permissions.includes(permission)
        } catch (error) {
            logger.error('Error verificando permiso:', error)
            return false
        }
    }

    /**
     * Verificar múltiples permisos (AND)
     */
    async hasAllPermissions(userId, tenantId, permissions) {
        try {
            const userRole = await this.getUserRole(userId, tenantId)
            return permissions.every(permission => 
                userRole.permissions.includes(permission)
            )
        } catch (error) {
            logger.error('Error verificando permisos múltiples:', error)
            return false
        }
    }

    /**
     * Verificar si tiene al menos uno de los permisos (OR)
     */
    async hasAnyPermission(userId, tenantId, permissions) {
        try {
            const userRole = await this.getUserRole(userId, tenantId)
            return permissions.some(permission => 
                userRole.permissions.includes(permission)
            )
        } catch (error) {
            logger.error('Error verificando permisos alternativos:', error)
            return false
        }
    }

    /**
     * Obtener todos los permisos de un usuario
     */
    async getUserPermissions(userId, tenantId) {
        try {
            const userRole = await this.getUserRole(userId, tenantId)
            return {
                role: userRole.name,
                roleDescription: userRole.description,
                permissions: userRole.permissions
            }
        } catch (error) {
            logger.error('Error obteniendo permisos de usuario:', error)
            return {
                role: 'viewer',
                roleDescription: 'Solo lectura',
                permissions: ROLES.VIEWER.permissions
            }
        }
    }

    /**
     * Verificar si puede acceder a un recurso específico
     */
    async canAccessResource(userId, tenantId, resourceType, resourceId, action) {
        try {
            // Verificar permiso básico
            const permission = `${resourceType}:${action}`
            const hasBasicPermission = await this.hasPermission(userId, tenantId, permission)
            
            if (!hasBasicPermission) {
                return false
            }

            // Verificar que el recurso pertenezca al tenant (para recursos específicos)
            if (resourceId) {
                return await this.verifyResourceTenantOwnership(tenantId, resourceType, resourceId)
            }

            return true

        } catch (error) {
            logger.error('Error verificando acceso a recurso:', error)
            return false
        }
    }

    /**
     * Verificar que un recurso pertenezca al tenant
     */
    async verifyResourceTenantOwnership(tenantId, resourceType, resourceId) {
        try {
            let tableName

            switch (resourceType) {
                case 'chatbots':
                    tableName = 'chatbots'
                    break
                case 'flows':
                    tableName = 'bot_flows'
                    break
                case 'welcomes':
                    tableName = 'welcomes'
                    break
                case 'conversations':
                    tableName = 'conversations'
                    break
                default:
                    return true // Para recursos sin ownership específico
            }

            const { data, error } = await supabase
                .from(tableName)
                .select('tenant_id')
                .eq('id', resourceId)
                .single()

            if (error || !data) {
                logger.error(`Error verificando ownership del recurso ${resourceType}:${resourceId}:`, error)
                return false
            }

            return data.tenant_id === tenantId

        } catch (error) {
            logger.error('Error verificando ownership:', error)
            return false
        }
    }
}

// Instancia singleton del servicio RBAC
const rbacService = new RBACService()

/**
 * Middleware para verificar permisos
 */
export const requirePermission = (permission) => {
    return async (req, res, next) => {
        try {
            const userId = req.tenant?.userId
            const tenantId = req.tenant?.id
            
            if (!userId || !tenantId) {
                return res.status(401).json({
                    success: false,
                    error: 'Usuario no autenticado',
                    code: 'UNAUTHENTICATED'
                })
            }

            const hasPermission = await rbacService.hasPermission(userId, tenantId, permission)
            
            if (!hasPermission) {
                logger.warn(`Acceso denegado: Usuario ${userId} intentó acceder a ${permission}`, {
                    userId,
                    tenantId,
                    permission,
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                })
                
                return res.status(403).json({
                    success: false,
                    error: 'Permisos insuficientes',
                    code: 'INSUFFICIENT_PERMISSIONS',
                    required: permission
                })
            }

            next()

        } catch (error) {
            logger.error('Error en middleware de permisos:', error)
            return res.status(500).json({
                success: false,
                error: 'Error verificando permisos',
                code: 'PERMISSION_CHECK_ERROR'
            })
        }
    }
}

/**
 * Middleware para verificar múltiples permisos (AND)
 */
export const requireAllPermissions = (permissions) => {
    return async (req, res, next) => {
        try {
            const userId = req.tenant?.userId
            const tenantId = req.tenant?.id
            
            if (!userId || !tenantId) {
                return res.status(401).json({
                    success: false,
                    error: 'Usuario no autenticado',
                    code: 'UNAUTHENTICATED'
                })
            }

            const hasAllPermissions = await rbacService.hasAllPermissions(userId, tenantId, permissions)
            
            if (!hasAllPermissions) {
                logger.warn(`Acceso denegado: Usuario ${userId} no tiene todos los permisos requeridos`, {
                    userId,
                    tenantId,
                    permissions,
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                })
                
                return res.status(403).json({
                    success: false,
                    error: 'Permisos insuficientes',
                    code: 'INSUFFICIENT_PERMISSIONS',
                    required: permissions
                })
            }

            next()

        } catch (error) {
            logger.error('Error en middleware de permisos múltiples:', error)
            return res.status(500).json({
                success: false,
                error: 'Error verificando permisos',
                code: 'PERMISSION_CHECK_ERROR'
            })
        }
    }
}

/**
 * Middleware para verificar permisos alternativos (OR)
 */
export const requireAnyPermission = (permissions) => {
    return async (req, res, next) => {
        try {
            const userId = req.tenant?.userId
            const tenantId = req.tenant?.id
            
            if (!userId || !tenantId) {
                return res.status(401).json({
                    success: false,
                    error: 'Usuario no autenticado',
                    code: 'UNAUTHENTICATED'
                })
            }

            const hasAnyPermission = await rbacService.hasAnyPermission(userId, tenantId, permissions)
            
            if (!hasAnyPermission) {
                logger.warn(`Acceso denegado: Usuario ${userId} no tiene ninguno de los permisos requeridos`, {
                    userId,
                    tenantId,
                    permissions,
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                })
                
                return res.status(403).json({
                    success: false,
                    error: 'Permisos insuficientes',
                    code: 'INSUFFICIENT_PERMISSIONS',
                    required: permissions
                })
            }

            next()

        } catch (error) {
            logger.error('Error en middleware de permisos alternativos:', error)
            return res.status(500).json({
                success: false,
                error: 'Error verificando permisos',
                code: 'PERMISSION_CHECK_ERROR'
            })
        }
    }
}

/**
 * Middleware para verificar acceso a recurso específico
 */
export const requireResourceAccess = (resourceType, action) => {
    return async (req, res, next) => {
        try {
            const userId = req.tenant?.userId
            const tenantId = req.tenant?.id
            const resourceId = req.params.id || req.params.chatbotId || req.params.flowId
            
            if (!userId || !tenantId) {
                return res.status(401).json({
                    success: false,
                    error: 'Usuario no autenticado',
                    code: 'UNAUTHENTICATED'
                })
            }

            const canAccess = await rbacService.canAccessResource(userId, tenantId, resourceType, resourceId, action)
            
            if (!canAccess) {
                logger.warn(`Acceso denegado al recurso: Usuario ${userId} intentó ${action} en ${resourceType}:${resourceId}`, {
                    userId,
                    tenantId,
                    resourceType,
                    resourceId,
                    action,
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                })
                
                return res.status(403).json({
                    success: false,
                    error: 'Acceso denegado al recurso',
                    code: 'RESOURCE_ACCESS_DENIED',
                    resource: resourceType,
                    action
                })
            }

            next()

        } catch (error) {
            logger.error('Error en middleware de acceso a recurso:', error)
            return res.status(500).json({
                success: false,
                error: 'Error verificando acceso a recurso',
                code: 'RESOURCE_ACCESS_ERROR'
            })
        }
    }
}

/**
 * Middleware para verificar rol específico
 */
export const requireRole = (roleName) => {
    return async (req, res, next) => {
        try {
            const userId = req.tenant?.userId
            const tenantId = req.tenant?.id
            
            if (!userId || !tenantId) {
                return res.status(401).json({
                    success: false,
                    error: 'Usuario no autenticado',
                    code: 'UNAUTHENTICATED'
                })
            }

            const userRole = await rbacService.getUserRole(userId, tenantId)
            
            if (userRole.name !== roleName) {
                logger.warn(`Acceso denegado por rol: Usuario ${userId} tiene rol ${userRole.name}, se requiere ${roleName}`, {
                    userId,
                    tenantId,
                    currentRole: userRole.name,
                    requiredRole: roleName,
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                })
                
                return res.status(403).json({
                    success: false,
                    error: 'Rol insuficiente',
                    code: 'INSUFFICIENT_ROLE',
                    required: roleName,
                    current: userRole.name
                })
            }

            next()

        } catch (error) {
            logger.error('Error en middleware de rol:', error)
            return res.status(500).json({
                success: false,
                error: 'Error verificando rol',
                code: 'ROLE_CHECK_ERROR'
            })
        }
    }
}

/**
 * Middleware para inyectar permisos del usuario en el request
 */
export const injectUserPermissions = async (req, res, next) => {
    try {
        const userId = req.tenant?.id
        
        if (userId) {
            const userPermissions = await rbacService.getUserPermissions(userId)
            req.userPermissions = userPermissions
        }
        
        next()
        
    } catch (error) {
        console.error('Error inyectando permisos:', error)
        next() // Continuar sin permisos
    }
}

// Exportar servicio y constantes
export { rbacService, ROLES, PERMISSIONS }
export default rbacService