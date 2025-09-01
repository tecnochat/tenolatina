/**
 * Test simplificado del sistema de autenticación
 */

import supabase from './src/config/supabase.js'
import AuthServiceV2 from './src/services/auth-service-v2.js'

async function testBasicConnection() {
    console.log('🔍 Probando conexión básica...')
    
    try {
        const { data, error } = await supabase
            .from('tenants')
            .select('id, name, slug')
            .limit(1)
        
        if (error) {
            console.error('❌ Error de conexión:', error.message)
            return false
        }
        
        console.log('✅ Conexión exitosa')
        console.log('📊 Datos obtenidos:', data)
        return true
        
    } catch (error) {
        console.error('❌ Error inesperado:', error.message)
        return false
    }
}

async function testAuthService() {
    console.log('\n🔍 Probando AuthServiceV2...')
    
    try {
        const authService = new AuthServiceV2()
        console.log('✅ AuthServiceV2 instanciado correctamente')
        
        // Test de registro
        const testEmail = `test-${Date.now()}@example.com`
        const testPassword = 'TestPassword123!'
        const testName = 'Test User'
        const testSlug = `test-tenant-${Date.now()}`
        
        console.log('\n📝 Probando registro de usuario...')
        const registerResult = await authService.register({
            email: testEmail,
            password: testPassword,
            name: testName,
            tenant_name: 'Test Tenant',
            tenant_slug: testSlug
        })
        
        if (registerResult.success) {
            console.log('✅ Registro exitoso')
            console.log('👤 Usuario creado:', registerResult.user.email)
            console.log('🏢 Tenant creado:', registerResult.tenant.name)
            
            // Test de login
            console.log('\n🔐 Probando login...')
            const loginResult = await authService.login(testEmail, testPassword)
            
            if (loginResult.success) {
                console.log('✅ Login exitoso')
                console.log('🎫 Token generado:', loginResult.token ? 'Sí' : 'No')
                
                // Cleanup
                console.log('\n🧹 Limpiando datos de prueba...')
                await supabase
                    .from('tenant_users')
                    .delete()
                    .eq('user_id', registerResult.user.id)
                    
                await supabase
                    .from('tenants')
                    .delete()
                    .eq('id', registerResult.tenant.id)
                    
                await supabase.auth.admin.deleteUser(registerResult.user.id)
                
                console.log('✅ Cleanup completado')
                
            } else {
                console.error('❌ Error en login:', loginResult.error)
            }
            
        } else {
            console.error('❌ Error en registro:', registerResult.error)
        }
        
    } catch (error) {
        console.error('❌ Error en AuthService:', error.message)
        console.error('Stack:', error.stack)
    }
}

async function runSimpleTests() {
    console.log('🧪 Iniciando tests simplificados...\n')
    
    const connectionOk = await testBasicConnection()
    
    if (connectionOk) {
        await testAuthService()
    } else {
        console.log('❌ No se puede continuar sin conexión a la base de datos')
    }
    
    console.log('\n✅ Tests completados')
    process.exit(0)
}

// Ejecutar tests
runSimpleTests().catch(error => {
    console.error('❌ Error fatal:', error)
    process.exit(1)
})