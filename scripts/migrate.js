#!/usr/bin/env node

/**
 * TecnoBot SAAS - Database Migration Script
 * Ejecuta migraciones de base de datos en Supabase
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuración de colores para la consola
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function print(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// Configuración de Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    print('❌ Error: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridos', 'red');
    print('   Configura estas variables en tu archivo .env', 'yellow');
    process.exit(1);
}

// Crear cliente de Supabase
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Directorio de migraciones
const migrationsDir = path.join(__dirname, '..', 'database', 'migrations');

// Lista de archivos de migración en orden
const migrationFiles = [
    '01_auth_and_tenants.sql',
    '02_chatbots_and_flows.sql',
    '03_messages_and_contacts.sql',
    '04_ai_and_analytics.sql',
    '05_webhooks_and_logs.sql',
    '06_team_and_admin.sql'
];

/**
 * Crear tabla de migraciones si no existe
 */
async function createMigrationsTable() {
    print('📋 Creando tabla de migraciones...', 'cyan');
    
    const createTableSQL = `
        CREATE TABLE IF NOT EXISTS migrations (
            id SERIAL PRIMARY KEY,
            filename VARCHAR(255) NOT NULL UNIQUE,
            executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            checksum VARCHAR(64),
            execution_time_ms INTEGER,
            success BOOLEAN DEFAULT TRUE,
            error_message TEXT
        );
        
        -- Habilitar RLS
        ALTER TABLE migrations ENABLE ROW LEVEL SECURITY;
        
        -- Política para permitir acceso completo al service role
        CREATE POLICY IF NOT EXISTS "Service role can manage migrations" ON migrations
            FOR ALL USING (auth.role() = 'service_role');
    `;
    
    try {
        const { error } = await supabase.rpc('exec_sql', { sql: createTableSQL });
        
        if (error) {
            // Si no existe la función exec_sql, intentar con query directo
            const { error: directError } = await supabase
                .from('migrations')
                .select('id')
                .limit(1);
            
            if (directError && directError.code === '42P01') {
                // Tabla no existe, necesitamos crearla manualmente
                print('⚠️  Tabla migrations no existe. Créala manualmente en Supabase:', 'yellow');
                print(createTableSQL, 'reset');
                return false;
            }
        }
        
        print('   ✓ Tabla de migraciones lista', 'green');
        return true;
    } catch (error) {
        print(`   ❌ Error creando tabla de migraciones: ${error.message}`, 'red');
        return false;
    }
}

/**
 * Obtener migraciones ya ejecutadas
 */
async function getExecutedMigrations() {
    try {
        const { data, error } = await supabase
            .from('migrations')
            .select('filename, executed_at, success')
            .order('executed_at', { ascending: true });
        
        if (error) {
            print(`   ❌ Error obteniendo migraciones: ${error.message}`, 'red');
            return [];
        }
        
        return data || [];
    } catch (error) {
        print(`   ❌ Error obteniendo migraciones: ${error.message}`, 'red');
        return [];
    }
}

/**
 * Calcular checksum de un archivo
 */
function calculateChecksum(content) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Ejecutar una migración
 */
async function executeMigration(filename) {
    const filePath = path.join(migrationsDir, filename);
    
    if (!fs.existsSync(filePath)) {
        print(`   ❌ Archivo no encontrado: ${filename}`, 'red');
        return false;
    }
    
    print(`   🔄 Ejecutando: ${filename}`, 'blue');
    
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const checksum = calculateChecksum(content);
        const startTime = Date.now();
        
        // Dividir el contenido en statements individuales
        const statements = content
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
        
        // Ejecutar cada statement
        for (const statement of statements) {
            if (statement.trim()) {
                try {
                    // Intentar ejecutar con rpc si está disponible
                    const { error } = await supabase.rpc('exec_sql', { sql: statement });
                    
                    if (error) {
                        // Si falla, intentar métodos alternativos según el tipo de statement
                        if (statement.toLowerCase().includes('create table')) {
                            print(`     ⚠️  Statement CREATE TABLE requiere ejecución manual`, 'yellow');
                        } else if (statement.toLowerCase().includes('create function')) {
                            print(`     ⚠️  Statement CREATE FUNCTION requiere ejecución manual`, 'yellow');
                        } else {
                            throw error;
                        }
                    }
                } catch (stmtError) {
                    print(`     ❌ Error en statement: ${stmtError.message}`, 'red');
                    print(`     📝 Statement: ${statement.substring(0, 100)}...`, 'yellow');
                    throw stmtError;
                }
            }
        }
        
        const executionTime = Date.now() - startTime;
        
        // Registrar migración exitosa
        const { error: insertError } = await supabase
            .from('migrations')
            .insert({
                filename,
                checksum,
                execution_time_ms: executionTime,
                success: true
            });
        
        if (insertError) {
            print(`     ⚠️  Error registrando migración: ${insertError.message}`, 'yellow');
        }
        
        print(`   ✓ Completada: ${filename} (${executionTime}ms)`, 'green');
        return true;
        
    } catch (error) {
        // Registrar migración fallida
        try {
            await supabase
                .from('migrations')
                .insert({
                    filename,
                    success: false,
                    error_message: error.message
                });
        } catch (insertError) {
            print(`     ⚠️  Error registrando fallo: ${insertError.message}`, 'yellow');
        }
        
        print(`   ❌ Error en ${filename}: ${error.message}`, 'red');
        return false;
    }
}

/**
 * Ejecutar todas las migraciones pendientes
 */
async function runMigrations() {
    print('🚀 Iniciando migraciones de base de datos...', 'bright');
    print('============================================\n', 'bright');
    
    // Crear tabla de migraciones
    const migrationsTableReady = await createMigrationsTable();
    if (!migrationsTableReady) {
        print('\n❌ No se pudo preparar la tabla de migraciones', 'red');
        print('   Ejecuta manualmente el SQL mostrado arriba en Supabase', 'yellow');
        return false;
    }
    
    // Obtener migraciones ejecutadas
    print('📋 Verificando migraciones ejecutadas...', 'cyan');
    const executedMigrations = await getExecutedMigrations();
    const executedFilenames = executedMigrations.map(m => m.filename);
    
    print(`   ✓ ${executedMigrations.length} migraciones ya ejecutadas`, 'green');
    
    // Encontrar migraciones pendientes
    const pendingMigrations = migrationFiles.filter(filename => 
        !executedFilenames.includes(filename)
    );
    
    if (pendingMigrations.length === 0) {
        print('\n✅ Todas las migraciones están actualizadas', 'green');
        return true;
    }
    
    print(`\n📦 ${pendingMigrations.length} migraciones pendientes:`, 'cyan');
    pendingMigrations.forEach(filename => {
        print(`   - ${filename}`, 'yellow');
    });
    
    // Ejecutar migraciones pendientes
    print('\n🔄 Ejecutando migraciones...', 'cyan');
    let successCount = 0;
    
    for (const filename of pendingMigrations) {
        const success = await executeMigration(filename);
        if (success) {
            successCount++;
        } else {
            print(`\n❌ Migración fallida: ${filename}`, 'red');
            print('   Las migraciones restantes no se ejecutarán', 'yellow');
            break;
        }
    }
    
    // Resumen
    print('\n📊 Resumen de migraciones:', 'bright');
    print(`   ✓ Ejecutadas exitosamente: ${successCount}`, 'green');
    print(`   ❌ Fallidas: ${pendingMigrations.length - successCount}`, successCount < pendingMigrations.length ? 'red' : 'green');
    print(`   📋 Total en base de datos: ${executedMigrations.length + successCount}`, 'cyan');
    
    if (successCount === pendingMigrations.length) {
        print('\n🎉 ¡Todas las migraciones completadas exitosamente!', 'green');
        return true;
    } else {
        print('\n⚠️  Algunas migraciones fallaron. Revisa los errores arriba.', 'yellow');
        return false;
    }
}

/**
 * Mostrar estado de migraciones
 */
async function showMigrationStatus() {
    print('📋 Estado de migraciones:', 'bright');
    print('========================\n', 'bright');
    
    const executedMigrations = await getExecutedMigrations();
    const executedFilenames = executedMigrations.map(m => m.filename);
    
    migrationFiles.forEach(filename => {
        const isExecuted = executedFilenames.includes(filename);
        const status = isExecuted ? '✓' : '⏳';
        const color = isExecuted ? 'green' : 'yellow';
        
        print(`   ${status} ${filename}`, color);
        
        if (isExecuted) {
            const migration = executedMigrations.find(m => m.filename === filename);
            print(`     Ejecutada: ${new Date(migration.executed_at).toLocaleString()}`, 'reset');
        }
    });
    
    const pendingCount = migrationFiles.length - executedMigrations.length;
    print(`\n📊 Resumen:`, 'bright');
    print(`   ✓ Ejecutadas: ${executedMigrations.length}`, 'green');
    print(`   ⏳ Pendientes: ${pendingCount}`, pendingCount > 0 ? 'yellow' : 'green');
}

/**
 * Función principal
 */
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'migrate';
    
    try {
        switch (command) {
            case 'status':
                await showMigrationStatus();
                break;
            case 'migrate':
            default:
                const success = await runMigrations();
                process.exit(success ? 0 : 1);
        }
    } catch (error) {
        print(`\n❌ Error inesperado: ${error.message}`, 'red');
        print(error.stack, 'red');
        process.exit(1);
    }
}

// Mostrar ayuda
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    print('🤖 TecnoBot SAAS - Script de Migraciones', 'bright');
    print('========================================\n', 'bright');
    print('Uso:', 'cyan');
    print('  node scripts/migrate.js [comando]\n', 'reset');
    print('Comandos:', 'cyan');
    print('  migrate (default)  Ejecutar migraciones pendientes', 'reset');
    print('  status             Mostrar estado de migraciones', 'reset');
    print('\nEjemplos:', 'cyan');
    print('  npm run db:migrate', 'reset');
    print('  node scripts/migrate.js status', 'reset');
    print('\nNotas:', 'yellow');
    print('  - Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env', 'reset');
    print('  - Las migraciones se ejecutan en orden secuencial', 'reset');
    print('  - Si una migración falla, las siguientes no se ejecutan', 'reset');
    process.exit(0);
}

// Ejecutar si es llamado directamente
if (require.main === module) {
    main();
}

module.exports = {
    runMigrations,
    showMigrationStatus,
    executeMigration
};