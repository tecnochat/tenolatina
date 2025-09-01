/**
 * Test específico de conexión a Supabase
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

console.log('🔍 Verificando configuración de Supabase...')
console.log('URL:', supabaseUrl)
console.log('Anon Key (primeros 20 chars):', supabaseAnonKey?.substring(0, 20) + '...')
console.log('Service Key (primeros 20 chars):', supabaseServiceKey?.substring(0, 20) + '...')

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    console.error('❌ Variables de entorno faltantes')
    process.exit(1)
}

async function testSupabaseConnection() {
    console.log('\n🧪 Probando conexión con clave anónima...')
    
    try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey)
        
        // Test básico de conexión
        const { data, error } = await supabase
            .from('tenants')
            .select('count')
            .limit(1)
        
        if (error) {
            console.error('❌ Error con clave anónima:', error.message)
            console.error('Código de error:', error.code)
            console.error('Detalles:', error.details)
        } else {
            console.log('✅ Conexión exitosa con clave anónima')
        }
        
    } catch (error) {
        console.error('❌ Error de conexión:', error.message)
    }
    
    console.log('\n🧪 Probando conexión con clave de servicio...')
    
    try {
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
        
        // Test con permisos de admin
        const { data, error } = await supabaseAdmin
            .from('tenants')
            .select('id, name, slug')
            .limit(5)
        
        if (error) {
            console.error('❌ Error con clave de servicio:', error.message)
            console.error('Código de error:', error.code)
            console.error('Detalles:', error.details)
        } else {
            console.log('✅ Conexión exitosa con clave de servicio')
            console.log('📊 Tenants encontrados:', data?.length || 0)
            if (data && data.length > 0) {
                console.log('Ejemplo de tenant:', data[0])
            }
        }
        
    } catch (error) {
        console.error('❌ Error de conexión con admin:', error.message)
    }
    
    console.log('\n🧪 Probando autenticación...')
    
    try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey)
        
        // Test de autenticación (sin crear usuario real)
        const { data, error } = await supabase.auth.getSession()
        
        if (error) {
            console.log('ℹ️ No hay sesión activa (normal):', error.message)
        } else {
            console.log('✅ Sistema de autenticación funcional')
            console.log('Sesión actual:', data.session ? 'Activa' : 'Inactiva')
        }
        
    } catch (error) {
        console.error('❌ Error en sistema de auth:', error.message)
    }
}

testSupabaseConnection().then(() => {
    console.log('\n✅ Test de conexión completado')
    process.exit(0)
}).catch(error => {
    console.error('❌ Error fatal:', error)
    process.exit(1)
})