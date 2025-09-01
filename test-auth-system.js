/**
 * Script de Prueba del Sistema de Autenticación Multi-Tenant
 * 
 * Prueba todas las funcionalidades del nuevo sistema de autenticación
 */

import AuthServiceV2 from './src/services/auth-service-v2.js'
import supabase, { createTenantClient } from './src/config/supabase.js'
import { logger } from './src/utils/logger.js'
import { AppConfig } from './src/config/app-config.js'

// Configurar logger para pruebas
logger.level = 'info'

class AuthSystemTester {
    constructor() {
        this.testResults = []
        this.createdUsers = []
        this.createdTenants = []
    }

    /**
     * Ejecutar todas las pruebas
     */
    async runAllTests() {
        console.log('🧪 Iniciando pruebas del sistema de autenticación multi-tenant...\n')

        try {
            await this.testDatabaseConnection()
            await this.testUserRegistration()
            await this.testUserLogin()
            await this.testTokenValidation()
            await this.testTenantIsolation()
            await this.testTeamManagement()
            await this.testPlanLimits()
            await this.testPasswordChange()
            
            this.printResults()
            
        } catch (error) {
            console.error('❌ Error ejecutando pruebas:', error)
        } finally {
            await this.cleanup()
        }
    }

    /**
     * Probar conexión a base de datos
     */
    async testDatabaseConnection() {
        console.log('📡 Probando conexión a base de datos...')
        
        try {
            const { data, error } = await supabase
                .from('tenants')
                .select('count')
                .limit(1)

            if (error) {
                throw error
            }

            this.addResult('✅ Conexión a base de datos', true, 'Conexión exitosa')
            
        } catch (error) {
            this.addResult('❌ Conexión a base de datos', false, error.message)
        }
    }

    /**
     * Probar registro de usuario
     */
    async testUserRegistration() {
        console.log('👤 Probando registro de usuario...')
        
        try {
            const testUser = {
                email: `test-${Date.now()}@example.com`,
                password: 'TestPassword123!',
                fullName: 'Usuario de Prueba',
                tenantName: `Tenant Prueba ${Date.now()}`,
                plan: 'free'
            }

            const result = await AuthServiceV2.register(testUser)

            if (result.success && result.user && result.tokens) {
                this.createdUsers.push({
                    userId: result.user.id,
                    tenantId: result.user.tenant.id,
                    email: testUser.email,
                    tokens: result.tokens
                })
                
                this.addResult('✅ Registro de usuario', true, 'Usuario registrado correctamente')
            } else {
                throw new Error('Respuesta de registro inválida')
            }
            
        } catch (error) {
            this.addResult('❌ Registro de usuario', false, error.message)
        }
    }

    /**
     * Probar login de usuario
     */
    async testUserLogin() {
        console.log('🔐 Probando login de usuario...')
        
        if (this.createdUsers.length === 0) {
            this.addResult('⏭️ Login de usuario', false, 'No hay usuarios creados para probar')
            return
        }

        try {
            const testUser = this.createdUsers[0]
            const result = await AuthServiceV2.login(testUser.email, 'TestPassword123!')

            if (result.success && result.user && result.tokens) {
                // Actualizar tokens
                testUser.tokens = result.tokens
                this.addResult('✅ Login de usuario', true, 'Login exitoso')
            } else {
                throw new Error('Respuesta de login inválida')
            }
            
        } catch (error) {
            this.addResult('❌ Login de usuario', false, error.message)
        }
    }

    /**
     * Probar validación de tokens
     */
    async testTokenValidation() {
        console.log('🎫 Probando validación de tokens...')
        
        if (this.createdUsers.length === 0) {
            this.addResult('⏭️ Validación de tokens', false, 'No hay usuarios creados para probar')
            return
        }

        try {
            const testUser = this.createdUsers[0]
            const validation = await AuthServiceV2.validateToken(testUser.tokens.accessToken)

            if (validation.valid && validation.userId === testUser.userId) {
                this.addResult('✅ Validación de tokens', true, 'Token válido')
            } else {
                throw new Error('Token inválido o datos incorrectos')
            }
            
        } catch (error) {
            this.addResult('❌ Validación de tokens', false, error.message)
        }
    }

    /**
     * Probar aislamiento de tenants
     */
    async testTenantIsolation() {
        console.log('🏢 Probando aislamiento de tenants...')
        
        if (this.createdUsers.length === 0) {
            this.addResult('⏭️ Aislamiento de tenants', false, 'No hay usuarios creados para probar')
            return
        }

        try {
            const testUser = this.createdUsers[0]
            const supabase = createSupabaseClient(testUser.tenantId)

            // Probar que puede acceder a sus propios datos
            const { data: ownChatbots, error: ownError } = await supabase
                .from('chatbots')
                .select('*')
                .eq('tenant_id', testUser.tenantId)

            if (ownError) {
                throw new Error(`Error accediendo a datos propios: ${ownError.message}`)
            }

            // Crear un segundo tenant para probar aislamiento
            const secondUser = {
                email: `test2-${Date.now()}@example.com`,
                password: 'TestPassword123!',
                fullName: 'Usuario de Prueba 2',
                tenantName: `Tenant Prueba 2 ${Date.now()}`,
                plan: 'free'
            }

            const secondResult = await AuthServiceV2.register(secondUser)
            
            if (secondResult.success) {
                this.createdUsers.push({
                    userId: secondResult.user.id,
                    tenantId: secondResult.user.tenant.id,
                    email: secondUser.email,
                    tokens: secondResult.tokens
                })

                // Probar que el primer usuario no puede acceder a datos del segundo
                const { data: otherChatbots, error: otherError } = await supabase
                    .from('chatbots')
                    .select('*')
                    .eq('tenant_id', secondResult.user.tenant.id)

                if (otherChatbots && otherChatbots.length === 0) {
                    this.addResult('✅ Aislamiento de tenants', true, 'Aislamiento funcionando correctamente')
                } else {
                    throw new Error('Aislamiento fallido: puede acceder a datos de otro tenant')
                }
            }
            
        } catch (error) {
            this.addResult('❌ Aislamiento de tenants', false, error.message)
        }
    }

    /**
     * Probar gestión de equipo
     */
    async testTeamManagement() {
        console.log('👥 Probando gestión de equipo...')
        
        if (this.createdUsers.length < 2) {
            this.addResult('⏭️ Gestión de equipo', false, 'Se necesitan al menos 2 usuarios para probar')
            return
        }

        try {
            const owner = this.createdUsers[0]
            const inviteeEmail = `invite-${Date.now()}@example.com`

            // Probar invitación de usuario
            const inviteResult = await AuthServiceV2.inviteUser(
                owner.tenantId,
                owner.userId,
                inviteeEmail,
                'member'
            )

            if (inviteResult.success) {
                this.addResult('✅ Gestión de equipo', true, 'Invitación de usuario exitosa')
            } else {
                throw new Error('Error en invitación de usuario')
            }
            
        } catch (error) {
            this.addResult('❌ Gestión de equipo', false, error.message)
        }
    }

    /**
     * Probar límites de plan
     */
    async testPlanLimits() {
        console.log('📊 Probando límites de plan...')
        
        if (this.createdUsers.length === 0) {
            this.addResult('⏭️ Límites de plan', false, 'No hay usuarios creados para probar')
            return
        }

        try {
            const testUser = this.createdUsers[0]
            const planLimits = await AuthServiceV2.getTenantPlanLimits(testUser.tenantId)

            if (planLimits && typeof planLimits === 'object') {
                const expectedLimits = AppConfig.plans.free
                
                if (JSON.stringify(planLimits) === JSON.stringify(expectedLimits)) {
                    this.addResult('✅ Límites de plan', true, 'Límites de plan correctos')
                } else {
                    throw new Error('Límites de plan no coinciden con la configuración')
                }
            } else {
                throw new Error('Límites de plan no obtenidos correctamente')
            }
            
        } catch (error) {
            this.addResult('❌ Límites de plan', false, error.message)
        }
    }

    /**
     * Probar cambio de contraseña
     */
    async testPasswordChange() {
        console.log('🔑 Probando cambio de contraseña...')
        
        if (this.createdUsers.length === 0) {
            this.addResult('⏭️ Cambio de contraseña', false, 'No hay usuarios creados para probar')
            return
        }

        try {
            const testUser = this.createdUsers[0]
            const newPassword = 'NewTestPassword123!'

            const result = await AuthServiceV2.changePassword(
                testUser.userId,
                'TestPassword123!',
                newPassword
            )

            if (result.success) {
                // Probar login con nueva contraseña
                const loginResult = await AuthServiceV2.login(testUser.email, newPassword)
                
                if (loginResult.success) {
                    this.addResult('✅ Cambio de contraseña', true, 'Contraseña cambiada correctamente')
                } else {
                    throw new Error('No se puede hacer login con la nueva contraseña')
                }
            } else {
                throw new Error('Error cambiando contraseña')
            }
            
        } catch (error) {
            this.addResult('❌ Cambio de contraseña', false, error.message)
        }
    }

    /**
     * Agregar resultado de prueba
     */
    addResult(test, success, message) {
        this.testResults.push({ test, success, message })
        console.log(`${success ? '✅' : '❌'} ${test}: ${message}`)
    }

    /**
     * Imprimir resumen de resultados
     */
    printResults() {
        console.log('\n📊 RESUMEN DE PRUEBAS')
        console.log('=' .repeat(50))
        
        const passed = this.testResults.filter(r => r.success).length
        const total = this.testResults.length
        
        console.log(`Total de pruebas: ${total}`)
        console.log(`Exitosas: ${passed}`)
        console.log(`Fallidas: ${total - passed}`)
        console.log(`Porcentaje de éxito: ${((passed / total) * 100).toFixed(1)}%`)
        
        console.log('\nDetalle de pruebas:')
        this.testResults.forEach(result => {
            console.log(`${result.success ? '✅' : '❌'} ${result.test}`)
            if (!result.success) {
                console.log(`   Error: ${result.message}`)
            }
        })
    }

    /**
     * Limpiar datos de prueba
     */
    async cleanup() {
        console.log('\n🧹 Limpiando datos de prueba...')
        
        try {
            const supabase = createSupabaseClient()
            
            // Eliminar usuarios creados
            for (const user of this.createdUsers) {
                try {
                    // Eliminar tenant
                    await supabase
                        .from('tenants')
                        .delete()
                        .eq('id', user.tenantId)
                    
                    // Eliminar usuario de auth
                    await supabase.auth.admin.deleteUser(user.userId)
                    
                    console.log(`🗑️ Usuario eliminado: ${user.email}`)
                } catch (error) {
                    console.warn(`⚠️ Error eliminando usuario ${user.email}:`, error.message)
                }
            }
            
            console.log('✅ Limpieza completada')
            
        } catch (error) {
            console.error('❌ Error en limpieza:', error)
        }
    }
}

// Ejecutar pruebas si el script se ejecuta directamente
if (import.meta.url === `file://${process.argv[1]}`) {
    const tester = new AuthSystemTester()
    await tester.runAllTests()
    process.exit(0)
}

export default AuthSystemTester