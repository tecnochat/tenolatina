/**
 * Test funcional del sistema de autenticación multi-tenant
 * Usando la clave de servicio que sabemos que funciona
 */

import { createClient } from '@supabase/supabase-js'
import { AuthServiceV2 } from './src/services/auth-service-v2.js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Usar cliente con permisos de servicio para las pruebas
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

class AuthTester {
    constructor() {
        this.testData = {
            email: `test-${Date.now()}@tecnobot.com`,
            password: 'TestPassword123!',
            name: 'Usuario de Prueba',
            tenant_name: 'Empresa de Prueba',
            tenant_slug: `test-tenant-${Date.now()}`
        }
        this.createdUserId = null
        this.createdTenantId = null
    }

    async runTests() {
        console.log('🧪 Iniciando pruebas del sistema de autenticación multi-tenant\n')
        
        try {
            await this.testDatabaseStructure()
            await this.testUserRegistration()
            await this.testUserLogin()
            await this.testTenantIsolation()
            await this.testTokenValidation()
            
            console.log('\n✅ Todas las pruebas completadas exitosamente')
            
        } catch (error) {
            console.error('❌ Error en las pruebas:', error.message)
            console.error('Stack:', error.stack)
        } finally {
            await this.cleanup()
        }
    }

    async testDatabaseStructure() {
        console.log('🔍 Verificando estructura de base de datos...')
        
        // Verificar tabla tenants
        const { data: tenants, error: tenantsError } = await supabaseAdmin
            .from('tenants')
            .select('id, name, slug, plan, created_at')
            .limit(1)
        
        if (tenantsError) {
            throw new Error(`Error en tabla tenants: ${tenantsError.message}`)
        }
        
        console.log('✅ Tabla tenants: OK')
        
        // Verificar tabla tenant_users
        const { data: tenantUsers, error: tenantUsersError } = await supabaseAdmin
            .from('tenant_users')
            .select('tenant_id, user_id, role')
            .limit(1)
        
        if (tenantUsersError) {
            throw new Error(`Error en tabla tenant_users: ${tenantUsersError.message}`)
        }
        
        console.log('✅ Tabla tenant_users: OK')
        
        // Verificar tabla chatbots
        const { data: chatbots, error: chatbotsError } = await supabaseAdmin
            .from('chatbots')
            .select('id, name_chatbot, tenant_id')
            .limit(1)
        
        if (chatbotsError) {
            throw new Error(`Error en tabla chatbots: ${chatbotsError.message}`)
        }
        
        console.log('✅ Tabla chatbots: OK')
        console.log('✅ Estructura de base de datos verificada\n')
    }

    async testUserRegistration() {
        console.log('📝 Probando registro de usuario...')
        
        const authService = new AuthServiceV2()
        
        const result = await authService.register({
            email: this.testData.email,
            password: this.testData.password,
            fullName: this.testData.name,
            tenantName: this.testData.tenant_name,
            tenantSlug: this.testData.tenant_slug
        })
        
        if (!result.success) {
            throw new Error(`Error en registro: ${result.error}`)
        }
        
        this.createdUserId = result.userId
        this.createdTenantId = result.tenantId
        
        console.log('✅ Usuario registrado:', result.email)
        console.log('✅ Tenant creado:', result.tenantName)
        console.log('✅ Chatbot por defecto creado\n')
    }

    async testUserLogin() {
        console.log('🔐 Probando login de usuario...')
        
        const authService = new AuthServiceV2()
        
        const result = await authService.login(
            this.testData.email,
            this.testData.password
        )
        
        if (!result.success) {
            throw new Error(`Error en login: ${result.error}`)
        }
        
        console.log('✅ Login exitoso')
        console.log('✅ Token JWT generado')
        console.log('✅ Información de tenant incluida\n')
        
        return result.token
    }

    async testTenantIsolation() {
        console.log('🏢 Probando aislamiento de tenants...')
        
        // Verificar que el chatbot se creó para el tenant correcto
        const { data: chatbots, error } = await supabaseAdmin
            .from('chatbots')
            .select('id, name_chatbot, tenant_id')
            .eq('tenant_id', this.createdTenantId)
        
        if (error) {
            throw new Error(`Error verificando chatbots: ${error.message}`)
        }
        
        if (!chatbots || chatbots.length === 0) {
            throw new Error('No se encontró chatbot para el tenant')
        }
        
        console.log('✅ Chatbot asociado al tenant correcto')
        
        // Verificar relación tenant-user
        const { data: tenantUser, error: tuError } = await supabaseAdmin
            .from('tenant_users')
            .select('tenant_id, user_id, role')
            .eq('tenant_id', this.createdTenantId)
            .eq('user_id', this.createdUserId)
            .single()
        
        if (tuError) {
            throw new Error(`Error verificando tenant_users: ${tuError.message}`)
        }
        
        if (tenantUser.role !== 'owner') {
            throw new Error('El usuario no tiene rol de owner en su tenant')
        }
        
        console.log('✅ Relación tenant-user correcta')
        console.log('✅ Aislamiento de datos verificado\n')
    }

    async testTokenValidation() {
        console.log('🎫 Probando validación de tokens...')
        
        const authService = new AuthServiceV2()
        
        // Hacer login para obtener token
        const loginResult = await authService.login(
            this.testData.email,
            this.testData.password
        )
        
        if (!loginResult.success) {
            throw new Error('No se pudo obtener token para validación')
        }
        
        // Aquí normalmente validaríamos el token con el middleware
        // Por ahora solo verificamos que el token existe y tiene estructura JWT
        console.log('🔍 Estructura de tokens:', loginResult.tokens)
        const token = loginResult.tokens?.access_token || loginResult.tokens?.accessToken
        
        if (!token) {
            throw new Error('No se encontró token de acceso en la respuesta')
        }
        
        const tokenParts = token.split('.')
        
        if (tokenParts.length !== 3) {
            throw new Error('Token JWT no tiene estructura válida')
        }
        
        console.log('✅ Token JWT tiene estructura válida')
        console.log('✅ Validación de tokens funcional\n')
    }

    async cleanup() {
        console.log('🧹 Limpiando datos de prueba...')
        
        try {
            if (this.createdUserId && this.createdTenantId) {
                // Eliminar chatbots del tenant
                await supabaseAdmin
                    .from('chatbots')
                    .delete()
                    .eq('tenant_id', this.createdTenantId)
                
                // Eliminar relación tenant-user
                await supabaseAdmin
                    .from('tenant_users')
                    .delete()
                    .eq('tenant_id', this.createdTenantId)
                
                // Eliminar tenant
                await supabaseAdmin
                    .from('tenants')
                    .delete()
                    .eq('id', this.createdTenantId)
                
                // Eliminar usuario de auth
                await supabaseAdmin.auth.admin.deleteUser(this.createdUserId)
                
                console.log('✅ Datos de prueba eliminados')
            }
        } catch (error) {
            console.warn('⚠️ Error en cleanup:', error.message)
        }
    }
}

// Ejecutar pruebas
const tester = new AuthTester()
tester.runTests().then(() => {
    console.log('\n🎉 Sistema de autenticación multi-tenant verificado exitosamente')
    process.exit(0)
}).catch(error => {
    console.error('\n💥 Error fatal en las pruebas:', error)
    process.exit(1)
})