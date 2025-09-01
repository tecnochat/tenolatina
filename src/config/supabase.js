import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

// Validar variables de entorno requeridas
const requiredEnvVars = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
}

// Verificar que todas las variables estén presentes
for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
        throw new Error(`❌ Variable de entorno requerida no encontrada: ${key}`)
    }
}

const supabaseUrl = requiredEnvVars.SUPABASE_URL
const supabaseKey = requiredEnvVars.SUPABASE_ANON_KEY

// Configuración del pool de conexiones
const poolConfig = {
    auth: {
        persistSession: false
    },
    db: {
        schema: 'public',
        // Configuración del pool
        poolConfig: {
            maxConnections: 20, // Máximo número de conexiones en el pool
            minConnections: 2,  // Mínimo número de conexiones a mantener
            idleTimeoutMillis: 30000, // Tiempo máximo que una conexión puede estar inactiva
            connectionTimeoutMillis: 5000, // Tiempo máximo de espera para una nueva conexión
            retryIntervalMillis: 1000, // Intervalo entre reintentos de conexión
            maxRetries: 3 // Número máximo de reintentos
        }
    },
    global: {
        headers: { 'x-application-name': 'tecnobot' }
    },
    realtime: {
        // Optimización de websockets
        timeout: 20000,
        heartbeat: {
            interval: 15000
        }
    }
}

const supabase = createClient(supabaseUrl, supabaseKey, poolConfig)

// Pool de conexiones personalizado para consultas pesadas
let queryPool = []
const MAX_POOL_SIZE = 10
const POOL_CLEANUP_INTERVAL = 60000 // 1 minuto

// Gestión de conexiones activas
const activeConnections = new Set()

// Monitoreo de estado de conexión
let isConnected = true
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 5

supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        isConnected = false
        console.error('Database connection lost')
        reconnectWithBackoff()
    }
})

// Función para reconexión con backoff exponencial
const reconnectWithBackoff = async () => {
    if (!isConnected && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const backoffTime = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
        console.log(`Intentando reconexión en ${backoffTime/1000} segundos...`)
        
        setTimeout(async () => {
            try {
                await supabase.auth.signInWithApiKey(supabaseKey)
                isConnected = true
                reconnectAttempts = 0
                console.log('Database reconnected successfully')
            } catch (error) {
                reconnectAttempts++
                console.error(`Reconnection attempt ${reconnectAttempts} failed:`, error)
                if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectWithBackoff()
                } else {
                    console.error('Max reconnection attempts reached')
                }
            }
        }, backoffTime)
    }
}

// Función para obtener una conexión del pool
const getConnection = async () => {
    // Reutilizar conexión existente si hay disponible
    const availableConnection = queryPool.find(conn => !activeConnections.has(conn))
    if (availableConnection) {
        activeConnections.add(availableConnection)
        return availableConnection
    }

    // Crear nueva conexión si hay espacio en el pool
    if (queryPool.length < MAX_POOL_SIZE) {
        const newConnection = supabase
        queryPool.push(newConnection)
        activeConnections.add(newConnection)
        return newConnection
    }

    // Esperar a que haya una conexión disponible
    return new Promise(resolve => {
        const checkInterval = setInterval(() => {
            const conn = queryPool.find(c => !activeConnections.has(c))
            if (conn) {
                clearInterval(checkInterval)
                activeConnections.add(conn)
                resolve(conn)
            }
        }, 100)
    })
}

// Función para liberar una conexión
const releaseConnection = (connection) => {
    activeConnections.delete(connection)
}

// Limpieza periódica del pool
setInterval(() => {
    const unusedConnections = queryPool.filter(conn => !activeConnections.has(conn))
    if (unusedConnections.length > poolConfig.db.poolConfig.minConnections) {
        // Mantener solo las conexiones mínimas necesarias
        const connectionsToRemove = unusedConnections.slice(poolConfig.db.poolConfig.minConnections)
        connectionsToRemove.forEach(conn => {
            const index = queryPool.indexOf(conn)
            if (index > -1) {
                queryPool.splice(index, 1)
            }
        })
    }
}, POOL_CLEANUP_INTERVAL)

// Verificar conexión cada 5 minutos
setInterval(async () => {
    if (!isConnected) {
        await reconnectWithBackoff()
    }
}, 300000)

export const getSupabase = () => supabase

export const handleError = (error) => {
    console.error('Supabase Error:', error.message)
    throw error
}

// Exportar funciones de gestión del pool
export const pool = {
    getConnection,
    releaseConnection
}

// Cliente administrativo (bypassa RLS)
export const supabaseAdmin = createClient(
    requiredEnvVars.SUPABASE_URL,
    requiredEnvVars.SUPABASE_SERVICE_ROLE_KEY,
    {
        ...poolConfig,
        auth: {
            ...poolConfig.auth,
            autoRefreshToken: false,
            persistSession: false
        }
    }
)

/**
 * Crear cliente Supabase con sesión específica
 * Útil para operaciones en nombre de un usuario específico
 */
export const createTenantClient = (accessToken) => {
    const client = createClient(supabaseUrl, supabaseKey, poolConfig)
    
    // Establecer sesión del usuario
    client.auth.setSession({
        access_token: accessToken,
        refresh_token: null
    })
    
    return client
}

/**
 * Utilidades para consultas multi-tenant
 */
export const TenantQuery = {
    /**
     * Crear query builder con filtro automático de tenant
     */
    from: (table, tenantId) => {
        return supabase.from(table).eq('user_id', tenantId)
    },
    
    /**
     * Ejecutar RPC con tenant_id automático
     */
    rpc: (functionName, params, tenantId) => {
        return supabase.rpc(functionName, {
            ...params,
            p_user_id: tenantId
        })
    },
    
    /**
     * Insertar con tenant_id automático
     */
    insert: (table, data, tenantId) => {
        return supabase.from(table).insert({
            ...data,
            user_id: tenantId,
            created_at: new Date().toISOString()
        })
    },
    
    /**
     * Actualizar con validación de tenant
     */
    update: (table, data, id, tenantId) => {
        return supabase.from(table)
            .update({
                ...data,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('user_id', tenantId)
    },
    
    /**
     * Eliminar con validación de tenant
     */
    delete: (table, id, tenantId) => {
        return supabase.from(table)
            .delete()
            .eq('id', id)
            .eq('user_id', tenantId)
    }
}

/**
 * Utilidades para manejo de errores de Supabase
 */
export const SupabaseError = {
    /**
     * Verificar si es un error de RLS
     */
    isRLSError: (error) => {
        return error?.code === 'PGRST116' || 
               error?.message?.includes('row-level security')
    },
    
    /**
     * Verificar si es un error de autenticación
     */
    isAuthError: (error) => {
        return error?.message?.includes('JWT') ||
               error?.message?.includes('authentication') ||
               error?.code === 'PGRST301'
    },
    
    /**
     * Formatear error para respuesta API
     */
    formatError: (error) => {
        if (SupabaseError.isAuthError(error)) {
            return {
                code: 'AUTH_ERROR',
                message: 'Error de autenticación',
                details: error.message
            }
        }
        
        if (SupabaseError.isRLSError(error)) {
            return {
                code: 'ACCESS_DENIED',
                message: 'Acceso denegado',
                details: 'No tienes permisos para acceder a este recurso'
            }
        }
        
        return {
            code: 'DATABASE_ERROR',
            message: 'Error en la base de datos',
            details: error.message
        }
    }
}

/**
 * Middleware para inyectar cliente Supabase en requests
 */
export const injectSupabaseClient = (req, res, next) => {
    const tenantId = req.tenant?.id
    
    if (tenantId) {
        // Cliente con filtros automáticos de tenant
        req.db = {
            from: (table) => TenantQuery.from(table, tenantId),
            rpc: (fn, params) => TenantQuery.rpc(fn, params, tenantId),
            insert: (table, data) => TenantQuery.insert(table, data, tenantId),
            update: (table, data, id) => TenantQuery.update(table, data, id, tenantId),
            delete: (table, id) => TenantQuery.delete(table, id, tenantId)
        }
    }
    
    // Cliente base siempre disponible
    req.supabase = supabase
    req.supabaseAdmin = supabaseAdmin
    
    next()
}

console.log('🚀 Supabase configurado para multi-tenancy')
console.log(`📍 URL: ${supabaseUrl}`)

export default supabase