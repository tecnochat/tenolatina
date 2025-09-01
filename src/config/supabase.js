import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials')
}

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

export default supabase