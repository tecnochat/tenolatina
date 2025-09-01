/**
 * Utilidades para Supabase en TecnoBot SAAS
 * Maneja la conexión y configuración del cliente Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('./logger-saas');

// Variables de configuración
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validar variables de entorno
if (!SUPABASE_URL) {
    throw new Error('SUPABASE_URL no está configurada en las variables de entorno');
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY no está configurada en las variables de entorno');
}

/**
 * Crear cliente Supabase con rol de servicio (para operaciones administrativas)
 */
function createSupabaseClient() {
    try {
        const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            },
            db: {
                schema: 'public'
            },
            global: {
                headers: {
                    'x-application-name': 'tecnobot-saas'
                }
            }
        });
        
        logger.info('Cliente Supabase (service role) creado correctamente');
        return client;
    } catch (error) {
        logger.error('Error creando cliente Supabase:', error);
        throw error;
    }
}

/**
 * Crear cliente Supabase con clave anónima (para operaciones de usuario)
 */
function createSupabaseAnonClient() {
    if (!SUPABASE_ANON_KEY) {
        throw new Error('SUPABASE_ANON_KEY no está configurada en las variables de entorno');
    }
    
    try {
        const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
                    'x-application-name': 'tecnobot-saas-client'
                }
            }
        });
        
        logger.info('Cliente Supabase (anon) creado correctamente');
        return client;
    } catch (error) {
        logger.error('Error creando cliente Supabase anónimo:', error);
        throw error;
    }
}

/**
 * Crear cliente Supabase con contexto de tenant
 */
function createTenantSupabaseClient(tenantId) {
    if (!tenantId) {
        throw new Error('tenantId es requerido para crear cliente con contexto de tenant');
    }
    
    try {
        const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            },
            db: {
                schema: 'public'
            },
            global: {
                headers: {
                    'x-application-name': 'tecnobot-saas',
                    'x-tenant-id': tenantId
                }
            }
        });
        
        // Agregar filtro de tenant a todas las consultas
        client.tenantId = tenantId;
        
        logger.debug('Cliente Supabase con contexto de tenant creado', { tenantId });
        return client;
    } catch (error) {
        logger.error('Error creando cliente Supabase con contexto de tenant:', error, { tenantId });
        throw error;
    }
}

/**
 * Verificar conexión a Supabase
 */
async function testSupabaseConnection(client = null) {
    const testClient = client || createSupabaseClient();
    
    try {
        // Intentar una consulta simple
        const { data, error } = await testClient
            .from('migrations')
            .select('count')
            .limit(1);
        
        if (error) {
            throw error;
        }
        
        logger.info('Conexión a Supabase verificada correctamente');
        return true;
    } catch (error) {
        logger.error('Error verificando conexión a Supabase:', error);
        return false;
    }
}

/**
 * Ejecutar consulta SQL directa (solo para migraciones y operaciones administrativas)
 */
async function executeSQL(sql, params = []) {
    const client = createSupabaseClient();
    
    try {
        const { data, error } = await client.rpc('exec_sql', {
            sql_query: sql,
            params: params
        });
        
        if (error) {
            throw error;
        }
        
        logger.debug('Consulta SQL ejecutada correctamente', { sql: sql.substring(0, 100) + '...' });
        return data;
    } catch (error) {
        logger.error('Error ejecutando consulta SQL:', error, { sql: sql.substring(0, 100) + '...' });
        throw error;
    }
}

/**
 * Obtener información de un tenant
 */
async function getTenant(tenantId) {
    const client = createSupabaseClient();
    
    try {
        const { data, error } = await client
            .from('tenants')
            .select('*')
            .eq('id', tenantId)
            .single();
        
        if (error) {
            throw error;
        }
        
        return data;
    } catch (error) {
        logger.error('Error obteniendo información del tenant:', error, { tenantId });
        throw error;
    }
}

/**
 * Obtener información de un tenant por slug
 */
async function getTenantBySlug(slug) {
    const client = createSupabaseClient();
    
    try {
        const { data, error } = await client
            .from('tenants')
            .select('*')
            .eq('slug', slug)
            .single();
        
        if (error) {
            throw error;
        }
        
        return data;
    } catch (error) {
        logger.error('Error obteniendo tenant por slug:', error, { slug });
        throw error;
    }
}

/**
 * Verificar si un usuario pertenece a un tenant
 */
async function verifyUserTenant(userId, tenantId) {
    const client = createSupabaseClient();
    
    try {
        const { data, error } = await client
            .from('tenant_users')
            .select('id, role, is_active')
            .eq('user_id', userId)
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .single();
        
        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
            throw error;
        }
        
        return data || null;
    } catch (error) {
        logger.error('Error verificando usuario en tenant:', error, { userId, tenantId });
        throw error;
    }
}

/**
 * Obtener límites del plan de un tenant
 */
async function getTenantPlanLimits(tenantId) {
    const client = createSupabaseClient();
    
    try {
        const { data, error } = await client
            .from('tenants')
            .select('plan_type, plan_limits, subscription_status')
            .eq('id', tenantId)
            .single();
        
        if (error) {
            throw error;
        }
        
        return {
            planType: data.plan_type,
            limits: data.plan_limits,
            subscriptionStatus: data.subscription_status
        };
    } catch (error) {
        logger.error('Error obteniendo límites del plan:', error, { tenantId });
        throw error;
    }
}

/**
 * Registrar evento de analytics
 */
async function logAnalyticsEvent(tenantId, eventType, eventData, userId = null) {
    const client = createSupabaseClient();
    
    try {
        const { error } = await client
            .from('analytics_events')
            .insert({
                tenant_id: tenantId,
                user_id: userId,
                event_type: eventType,
                event_data: eventData,
                created_at: new Date().toISOString()
            });
        
        if (error) {
            throw error;
        }
        
        logger.debug('Evento de analytics registrado', { tenantId, eventType, userId });
    } catch (error) {
        logger.error('Error registrando evento de analytics:', error, { tenantId, eventType, userId });
        // No lanzar error para no interrumpir el flujo principal
    }
}

/**
 * Middleware para inyectar cliente Supabase en requests
 */
function injectSupabaseMiddleware(req, res, next) {
    // Cliente principal (service role)
    req.supabase = createSupabaseClient();
    
    // Cliente con contexto de tenant (si está disponible)
    if (req.tenantId) {
        req.tenantSupabase = createTenantSupabaseClient(req.tenantId);
    }
    
    next();
}

/**
 * Utilidad para manejar errores de Supabase
 */
function handleSupabaseError(error, context = {}) {
    const errorInfo = {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        ...context
    };
    
    logger.error('Error de Supabase:', error, errorInfo);
    
    // Mapear errores comunes a mensajes más amigables
    switch (error.code) {
        case '23505': // unique_violation
            return new Error('El registro ya existe');
        case '23503': // foreign_key_violation
            return new Error('Referencia inválida');
        case '23502': // not_null_violation
            return new Error('Campo requerido faltante');
        case 'PGRST116': // no rows returned
            return new Error('Registro no encontrado');
        default:
            return error;
    }
}

module.exports = {
    createSupabaseClient,
    createSupabaseAnonClient,
    createTenantSupabaseClient,
    testSupabaseConnection,
    executeSQL,
    getTenant,
    getTenantBySlug,
    verifyUserTenant,
    getTenantPlanLimits,
    logAnalyticsEvent,
    injectSupabaseMiddleware,
    handleSupabaseError
};