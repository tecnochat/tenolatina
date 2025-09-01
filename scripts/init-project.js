#!/usr/bin/env node

/**
 * Script de inicialización del proyecto TecnoBot SAAS
 * Verifica configuración y prepara el entorno
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const logger = {
    info: (msg) => console.log(`ℹ ${msg}`),
    success: (msg) => console.log(`✅ ${msg}`),
    error: (msg) => console.log(`❌ ${msg}`),
    warn: (msg) => console.log(`⚠️ ${msg}`)
};

async function initProject() {
    try {
        console.log('\n🚀 INICIALIZANDO PROYECTO TECNOBOT SAAS');
        console.log('==================================================');

        // 1. Verificar variables de entorno
        logger.info('Verificando variables de entorno...');
        const requiredEnvVars = [
            'SUPABASE_URL',
            'SUPABASE_ANON_KEY', 
            'SUPABASE_SERVICE_ROLE_KEY',
            'JWT_SECRET',
            'OPENAI_API_KEY'
        ];
        
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missingVars.length > 0) {
            logger.error(`Variables de entorno faltantes: ${missingVars.join(', ')}`);
            logger.info('Asegúrate de configurar tu archivo .env con todas las variables necesarias.');
            throw new Error('Variables de entorno incompletas');
        }
        
        logger.success('Variables de entorno verificadas');

        // 2. Verificar conexión a Supabase
        logger.info('Conectando a Supabase...');
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );

        // Verificar que las tablas principales existan
        const { data, error } = await supabase
            .from('migrations')
            .select('*')
            .limit(1);

        if (error) {
            logger.error(`No se pudo conectar a Supabase: ${error.message}`);
            console.log('\n📋 INSTRUCCIONES DE CONFIGURACIÓN:');
            console.log('ℹ Verifica que:');
            console.log('ℹ 1. SUPABASE_URL sea correcta');
            console.log('ℹ 2. SUPABASE_SERVICE_ROLE_KEY sea válida');
            console.log('ℹ 3. Hayas ejecutado el script init-supabase.sql en tu proyecto de Supabase');
            console.log('\n📖 Para instrucciones detalladas, lee: SETUP-INSTRUCTIONS.md');
            throw new Error(`Error de conexión: ${error.message}`);
        }

        logger.success('Conexión a Supabase establecida');

        // 3. Verificar tablas principales
        logger.info('Verificando estructura de base de datos...');
        const requiredTables = [
            'tenants',
            'user_profiles', 
            'tenant_users',
            'chatbots',
            'flows',
            'welcome_messages',
            'conversations',
            'messages'
        ];

        let tablesFound = 0;
        for (const table of requiredTables) {
            try {
                const { error: tableError } = await supabase
                    .from(table)
                    .select('*')
                    .limit(1);
                
                if (!tableError) {
                    tablesFound++;
                }
            } catch (err) {
                // Tabla no existe
            }
        }

        if (tablesFound < requiredTables.length) {
            logger.warn(`Solo se encontraron ${tablesFound}/${requiredTables.length} tablas requeridas`);
            logger.info('Algunas tablas pueden estar faltando. Verifica la configuración de Supabase.');
        } else {
            logger.success('Todas las tablas principales encontradas');
        }

        // 4. Crear directorios necesarios
        logger.info('Creando directorios necesarios...');
        const directories = [
            'logs',
            'temp',
            'uploads',
            'sessions',
            'auth_info_baileys'
        ];

        for (const dir of directories) {
            const dirPath = path.join(process.cwd(), dir);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
                logger.success(`Directorio '${dir}' creado`);
            } else {
                logger.info(`Directorio '${dir}' ya existe`);
            }
        }

        // 5. Verificar dependencias críticas
        logger.info('Verificando dependencias...');
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const criticalDeps = [
            '@supabase/supabase-js',
            '@builderbot/bot',
            '@builderbot/provider-baileys',
            'express',
            'jsonwebtoken'
        ];

        const missingDeps = criticalDeps.filter(dep => 
            !packageJson.dependencies[dep] && !packageJson.devDependencies[dep]
        );

        if (missingDeps.length > 0) {
            logger.warn(`Dependencias faltantes: ${missingDeps.join(', ')}`);
            logger.info('Ejecuta: npm install');
        } else {
            logger.success('Dependencias críticas verificadas');
        }

        // 6. Verificar configuración de desarrollo
        if (process.env.NODE_ENV === 'development') {
            logger.info('Configurando entorno de desarrollo...');
            
            // Verificar archivo de configuración
            const configPath = path.join(process.cwd(), 'config', 'development.js');
            if (fs.existsSync(configPath)) {
                logger.success('Configuración de desarrollo encontrada');
            } else {
                logger.warn('Archivo de configuración de desarrollo no encontrado');
            }
        }

        // 7. Resumen final
        console.log('\n🎉 INICIALIZACIÓN COMPLETADA');
        console.log('==================================================');
        logger.success('Proyecto TecnoBot SAAS inicializado correctamente');
        
        console.log('\n📋 PRÓXIMOS PASOS:');
        console.log('1. Para desarrollo: npm run dev');
        console.log('2. Para servidor SAAS: npm run saas');
        console.log('3. Para limpiar datos: npm run clean');
        
        console.log('\n📖 DOCUMENTACIÓN:');
        console.log('- Configuración: SETUP-INSTRUCTIONS.md');
        console.log('- Arquitectura SAAS: README-SAAS.md');
        
        if (tablesFound < requiredTables.length) {
            console.log('\n⚠️ ADVERTENCIA:');
            console.log('Algunas tablas de base de datos pueden estar faltando.');
            console.log('Lee SETUP-INSTRUCTIONS.md para configurar Supabase correctamente.');
        }

    } catch (error) {
        logger.error(`Error durante la inicialización: ${error.message}`);
        console.log('\n📖 Para solucionar problemas, consulta: SETUP-INSTRUCTIONS.md');
        process.exit(1);
    }
}

if (require.main === module) {
    initProject();
}

module.exports = { initProject };