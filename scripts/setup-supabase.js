#!/usr/bin/env node

/**
 * Script para configurar automáticamente Supabase
 * Ejecuta comandos SQL básicos para crear las tablas principales
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const logger = {
    info: (msg) => console.log(`ℹ ${msg}`),
    success: (msg) => console.log(`✅ ${msg}`),
    error: (msg) => console.log(`❌ ${msg}`),
    warn: (msg) => console.log(`⚠️ ${msg}`)
};

async function setupSupabase() {
    try {
        console.log('\n🚀 CONFIGURANDO SUPABASE PARA TECNOBOT SAAS');
        console.log('==================================================');

        // Verificar variables de entorno
        const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missingVars.length > 0) {
            logger.error(`Variables de entorno faltantes: ${missingVars.join(', ')}`);
            process.exit(1);
        }

        logger.info('Variables de entorno verificadas');

        // Crear cliente de Supabase con service role
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

        logger.info('Cliente de Supabase creado');

        // Crear tablas básicas una por una
        const tables = [
            {
                name: 'migrations',
                sql: `
                    CREATE TABLE IF NOT EXISTS public.migrations (
                        id SERIAL PRIMARY KEY,
                        name VARCHAR(255) NOT NULL UNIQUE,
                        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                    );
                `
            },
            {
                name: 'tenants',
                sql: `
                    CREATE TABLE IF NOT EXISTS public.tenants (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        name VARCHAR(255) NOT NULL,
                        slug VARCHAR(100) NOT NULL UNIQUE,
                        description TEXT,
                        logo_url TEXT,
                        plan_type VARCHAR(50) DEFAULT 'free',
                        status VARCHAR(20) DEFAULT 'active',
                        settings JSONB DEFAULT '{}',
                        limits JSONB DEFAULT '{}',
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                    );
                `
            },
            {
                name: 'user_profiles',
                sql: `
                    CREATE TABLE IF NOT EXISTS public.user_profiles (
                        id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
                        email VARCHAR(255) NOT NULL,
                        full_name VARCHAR(255),
                        avatar_url TEXT,
                        phone VARCHAR(20),
                        timezone VARCHAR(50) DEFAULT 'UTC',
                        language VARCHAR(10) DEFAULT 'es',
                        preferences JSONB DEFAULT '{}',
                        last_login_at TIMESTAMP WITH TIME ZONE,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                    );
                `
            },
            {
                name: 'tenant_users',
                sql: `
                    CREATE TABLE IF NOT EXISTS public.tenant_users (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
                        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
                        role VARCHAR(20) DEFAULT 'viewer',
                        permissions JSONB DEFAULT '[]',
                        status VARCHAR(20) DEFAULT 'active',
                        invited_by UUID REFERENCES auth.users(id),
                        invited_at TIMESTAMP WITH TIME ZONE,
                        joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                        UNIQUE(tenant_id, user_id)
                    );
                `
            },
            {
                name: 'flows',
                sql: `
                    CREATE TABLE IF NOT EXISTS public.flows (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
                        chatbot_id UUID REFERENCES public.chatbots(id) ON DELETE CASCADE,
                        name VARCHAR(255) NOT NULL,
                        description TEXT,
                        type VARCHAR(50) DEFAULT 'linear',
                        config JSONB DEFAULT '{}',
                        steps JSONB DEFAULT '[]',
                        is_active BOOLEAN DEFAULT true,
                        priority INTEGER DEFAULT 0,
                        created_by UUID REFERENCES auth.users(id),
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                    );
                `
            },
            {
                name: 'welcome_messages',
                sql: `
                    CREATE TABLE IF NOT EXISTS public.welcome_messages (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
                        chatbot_id UUID REFERENCES public.chatbots(id) ON DELETE CASCADE,
                        name VARCHAR(255) NOT NULL,
                        message TEXT NOT NULL,
                        media_url TEXT,
                        media_type VARCHAR(20),
                        is_active BOOLEAN DEFAULT true,
                        conditions JSONB DEFAULT '{}',
                        created_by UUID REFERENCES auth.users(id),
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                    );
                `
            },
            {
                name: 'conversations',
                sql: `
                    CREATE TABLE IF NOT EXISTS public.conversations (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
                        chatbot_id UUID REFERENCES public.chatbots(id) ON DELETE CASCADE,
                        user_phone VARCHAR(20) NOT NULL,
                        user_name VARCHAR(255),
                        status VARCHAR(20) DEFAULT 'active',
                        context JSONB DEFAULT '{}',
                        metadata JSONB DEFAULT '{}',
                        last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                    );
                `
            },
            {
                name: 'messages',
                sql: `
                    CREATE TABLE IF NOT EXISTS public.messages (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
                        conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
                        direction VARCHAR(10) NOT NULL,
                        content TEXT,
                        media_url TEXT,
                        media_type VARCHAR(20),
                        message_type VARCHAR(20) DEFAULT 'text',
                        whatsapp_id VARCHAR(255),
                        status VARCHAR(20) DEFAULT 'sent',
                        metadata JSONB DEFAULT '{}',
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                    );
                `
            }
        ];

        logger.info(`Creando ${tables.length} tablas principales...`);

        // Crear tablas una por una
        for (const table of tables) {
            try {
                // Usar una consulta SQL directa
                const { error } = await supabase.rpc('exec', { sql: table.sql });
                
                if (error) {
                    // Intentar método alternativo
                    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY
                        },
                        body: JSON.stringify({ sql: table.sql })
                    });

                    if (response.ok) {
                        logger.success(`Tabla '${table.name}' creada`);
                    } else {
                        const errorText = await response.text();
                        if (errorText.includes('already exists')) {
                            logger.warn(`Tabla '${table.name}' ya existe`);
                        } else {
                            logger.error(`Error creando tabla '${table.name}': ${errorText}`);
                        }
                    }
                } else {
                    logger.success(`Tabla '${table.name}' creada`);
                }
            } catch (err) {
                if (err.message.includes('already exists')) {
                    logger.warn(`Tabla '${table.name}' ya existe`);
                } else {
                    logger.error(`Error creando tabla '${table.name}': ${err.message}`);
                }
            }
        }

        // Insertar migración inicial
        try {
            const { error } = await supabase
                .from('migrations')
                .insert({ name: 'init_saas_basic_tables' });
            
            if (error && !error.message.includes('duplicate')) {
                logger.warn(`Error insertando migración: ${error.message}`);
            } else {
                logger.success('Migración inicial registrada');
            }
        } catch (err) {
            logger.warn(`Error registrando migración: ${err.message}`);
        }

        // Verificar tablas creadas
        logger.info('\n🔍 Verificando tablas creadas...');
        
        const tablesToCheck = tables.map(t => t.name);
        let tablesCreated = 0;
        
        for (const tableName of tablesToCheck) {
            try {
                const { error } = await supabase
                    .from(tableName)
                    .select('*')
                    .limit(1);
                
                if (!error) {
                    logger.success(`Tabla '${tableName}' verificada`);
                    tablesCreated++;
                } else {
                    logger.error(`Tabla '${tableName}' no encontrada`);
                }
            } catch (err) {
                logger.error(`Error verificando tabla '${tableName}'`);
            }
        }

        console.log('\n🎉 CONFIGURACIÓN COMPLETADA');
        console.log(`📊 Tablas creadas: ${tablesCreated}/${tablesToCheck.length}`);
        
        if (tablesCreated >= 7) { // Al menos las tablas principales
            logger.success('¡Supabase configurado correctamente!');
            logger.info('Ahora puedes ejecutar: npm run init');
            return true;
        } else {
            logger.warn('Faltan algunas tablas por crear.');
            logger.info('Ejecuta manualmente el script SQL completo en Supabase.');
            return false;
        }

    } catch (error) {
        logger.error(`Error durante la configuración: ${error.message}`);
        console.error(error);
        return false;
    }
}

if (require.main === module) {
    setupSupabase().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = { setupSupabase };