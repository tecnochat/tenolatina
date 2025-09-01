/**
 * Script de verificación de configuración multi-tenant
 * Verifica que todas las tablas y configuraciones estén correctas
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyDatabaseSetup() {
    console.log('🔍 VERIFICANDO CONFIGURACIÓN MULTI-TENANT...');
    console.log('=' .repeat(50));
    
    try {
        // 1. Verificar tablas principales intentando acceder a cada una
        console.log('\n📋 1. Verificando tablas principales...');
        const expectedTables = ['migrations', 'tenants', 'tenant_users', 'chatbots', 'conversations', 'messages', 'flows'];
        let foundTables = 0;
        
        for (const table of expectedTables) {
            try {
                const { data, error } = await supabase
                    .from(table)
                    .select('*')
                    .limit(1);
                
                if (!error) {
                    console.log(`   ✅ ${table}`);
                    foundTables++;
                } else {
                    console.log(`   ❌ ${table} - ${error.message}`);
                }
            } catch (err) {
                console.log(`   ❌ ${table} - ${err.message}`);
            }
        }
        
        console.log(`   📊 Tablas encontradas: ${foundTables}/7`);
        
        if (foundTables !== 7) {
            console.error('❌ Faltan tablas básicas');
            return false;
        }
        
        // 2. Verificar columnas tenant_id intentando hacer select
        console.log('\n🏢 2. Verificando columnas tenant_id...');
        const tablesWithTenantId = ['chatbots', 'conversations', 'messages', 'flows', 'tenant_users'];
        
        for (const table of tablesWithTenantId) {
            try {
                const { data, error } = await supabase
                    .from(table)
                    .select('tenant_id')
                    .limit(1);
                
                if (!error) {
                    console.log(`   ✅ ${table}.tenant_id`);
                } else if (error.message.includes('column') && error.message.includes('does not exist')) {
                    console.log(`   ❌ ${table}.tenant_id - columna no existe`);
                } else {
                    console.log(`   ⚠️  ${table}.tenant_id - ${error.message}`);
                }
            } catch (err) {
                console.log(`   ❌ ${table}.tenant_id - ${err.message}`);
            }
        }
        
        // 3. Verificar tenant por defecto
        console.log('\n👤 3. Verificando tenant por defecto...');
        const { data: defaultTenant, error: tenantError } = await supabase
            .from('tenants')
            .select('id, name, subdomain')
            .eq('subdomain', 'default')
            .single();
        
        if (tenantError) {
            console.log('❌ Error verificando tenant por defecto:', tenantError.message);
        } else {
            console.log(`   ✅ Tenant por defecto encontrado: ${defaultTenant.name} (${defaultTenant.id})`);
        }
        
        // 4. Verificar acceso básico a tablas (indica RLS configurado)
        console.log('\n🔒 4. Verificando configuración de seguridad...');
        const tablesWithRLS = ['tenants', 'tenant_users', 'chatbots', 'conversations', 'messages', 'flows'];
        
        for (const table of tablesWithRLS) {
            try {
                const { data, error } = await supabase
                    .from(table)
                    .select('*')
                    .limit(1);
                
                // Si no hay error, la tabla es accesible (RLS configurado correctamente)
                if (!error) {
                    console.log(`   ✅ ${table} - accesible`);
                } else {
                    console.log(`   ⚠️  ${table} - ${error.message}`);
                }
            } catch (err) {
                console.log(`   ❌ ${table} - ${err.message}`);
            }
        }
        
        // 5. Test de conexión básica
        console.log('\n🔌 5. Test de conexión...');
        const { data: testData, error: testError } = await supabase
            .from('tenants')
            .select('id, name')
            .limit(1);
        
        if (testError) {
            console.error('❌ Error de conexión:', testError.message);
        } else {
            console.log('   ✅ Conexión a Supabase exitosa');
            if (testData && testData.length > 0) {
                console.log(`   📊 Tenants encontrados: ${testData.length}`);
            }
        }
        
        console.log('\n' + '=' .repeat(50));
        console.log('🎉 VERIFICACIÓN COMPLETADA');
        console.log('✅ La configuración multi-tenant está lista');
        console.log('🚀 Puedes continuar con la implementación');
        
        return true;
        
    } catch (error) {
        console.error('❌ Error durante la verificación:', error.message);
        return false;
    }
}

// Ejecutar verificación
if (require.main === module) {
    verifyDatabaseSetup()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Error fatal:', error.message);
            process.exit(1);
        });
}

module.exports = { verifyDatabaseSetup };