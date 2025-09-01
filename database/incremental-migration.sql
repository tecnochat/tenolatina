-- =====================================================
-- MIGRACIÓN INCREMENTAL PARA TECNOBOT SAAS
-- =====================================================
-- 
-- INSTRUCCIONES:
-- Este script SOLO creará las tablas que faltan
-- SIN eliminar las tablas existentes
-- 
-- 1. Abre tu proyecto de Supabase
-- 2. Ve a SQL Editor
-- 3. Copia y pega este script completo
-- 4. Ejecuta el script
-- =====================================================

-- =====================================================
-- EXTENSIONES NECESARIAS (si no existen)
-- =====================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- TABLA DE MIGRACIONES (si no existe)
-- =====================================================
CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL UNIQUE,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    checksum VARCHAR(64),
    execution_time_ms INTEGER,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT
);

-- Habilitar RLS para migraciones (si no está habilitado)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'migrations'
        AND rowsecurity = true
    ) THEN
        ALTER TABLE migrations ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Política para migraciones (crear solo si no existe)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'migrations' 
        AND policyname = 'Service role can manage migrations'
    ) THEN
        CREATE POLICY "Service role can manage migrations" ON migrations
            FOR ALL USING (auth.role() = 'service_role');
    END IF;
END $$;

-- =====================================================
-- ENUMS (crear solo si no existen)
-- =====================================================
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE subscription_status AS ENUM ('active', 'inactive', 'cancelled', 'past_due', 'trialing');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE plan_type AS ENUM ('free', 'starter', 'professional', 'enterprise');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE flow_type AS ENUM ('welcome', 'menu', 'form', 'ai_chat', 'custom');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE field_type AS ENUM ('text', 'number', 'email', 'phone', 'date', 'select', 'multiselect', 'boolean');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE trigger_type AS ENUM ('keyword', 'pattern', 'always', 'condition');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- TABLA: TENANTS (si no existe)
-- =====================================================
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    logo_url TEXT,
    website_url TEXT,
    
    -- Configuración
    settings JSONB DEFAULT '{}',
    features JSONB DEFAULT '{}',
    
    -- Suscripción
    plan_type plan_type DEFAULT 'free',
    subscription_status subscription_status DEFAULT 'active',
    subscription_id VARCHAR(255),
    trial_ends_at TIMESTAMP WITH TIME ZONE,
    
    -- Límites del plan
    max_chatbots INTEGER DEFAULT 1,
    max_conversations_per_month INTEGER DEFAULT 1000,
    max_ai_requests_per_month INTEGER DEFAULT 100,
    max_team_members INTEGER DEFAULT 1,
    
    -- Uso actual
    current_chatbots INTEGER DEFAULT 0,
    current_conversations_this_month INTEGER DEFAULT 0,
    current_ai_requests_this_month INTEGER DEFAULT 0,
    current_team_members INTEGER DEFAULT 1,
    
    -- Metadatos
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT valid_slug CHECK (slug ~ '^[a-z0-9-]+$'),
    CONSTRAINT positive_limits CHECK (
        max_chatbots > 0 AND 
        max_conversations_per_month > 0 AND 
        max_ai_requests_per_month > 0 AND
        max_team_members > 0
    )
);

-- =====================================================
-- TABLA: TENANT_USERS (si no existe)
-- =====================================================
CREATE TABLE IF NOT EXISTS tenant_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Información del usuario en este tenant
    role user_role DEFAULT 'member',
    display_name VARCHAR(255),
    avatar_url TEXT,
    
    -- Permisos específicos
    permissions JSONB DEFAULT '{}',
    
    -- Estado
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    
    -- Invitación
    invited_by UUID REFERENCES auth.users(id),
    invited_at TIMESTAMP WITH TIME ZONE,
    invitation_accepted_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadatos
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(tenant_id, user_id)
);

-- =====================================================
-- VERIFICAR Y CREAR COLUMNA tenant_id EN CHATBOTS
-- =====================================================
DO $$
BEGIN
    -- Verificar si la tabla chatbots existe
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'chatbots') THEN
        -- Verificar si la columna tenant_id existe
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'chatbots' 
            AND column_name = 'tenant_id'
        ) THEN
            -- Agregar columna tenant_id
            ALTER TABLE chatbots ADD COLUMN tenant_id UUID;
            
            -- Crear un tenant por defecto si no existe ninguno
            INSERT INTO tenants (name, slug, description) 
            VALUES ('Tenant por Defecto', 'default', 'Tenant creado automáticamente para migración')
            ON CONFLICT (slug) DO NOTHING;
            
            -- Asignar el tenant por defecto a todos los chatbots existentes
            UPDATE chatbots 
            SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
            WHERE tenant_id IS NULL;
            
            -- Hacer la columna NOT NULL después de asignar valores
            ALTER TABLE chatbots ALTER COLUMN tenant_id SET NOT NULL;
            
            -- Agregar la foreign key constraint
            ALTER TABLE chatbots ADD CONSTRAINT fk_chatbots_tenant_id 
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- =====================================================
-- VERIFICAR Y CREAR COLUMNA tenant_id EN CONVERSATIONS
-- =====================================================
DO $$
BEGIN
    -- Verificar si la tabla conversations existe
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'conversations') THEN
        -- Verificar si la columna tenant_id existe
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'conversations' 
            AND column_name = 'tenant_id'
        ) THEN
            -- Agregar columna tenant_id
            ALTER TABLE conversations ADD COLUMN tenant_id UUID;
            
            -- Asignar tenant_id basado en el chatbot
            UPDATE conversations 
            SET tenant_id = c.tenant_id
            FROM chatbots c
            WHERE conversations.chatbot_id = c.id
            AND conversations.tenant_id IS NULL;
            
            -- Para conversaciones sin chatbot válido, asignar tenant por defecto
            UPDATE conversations 
            SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
            WHERE tenant_id IS NULL;
            
            -- Hacer la columna NOT NULL
            ALTER TABLE conversations ALTER COLUMN tenant_id SET NOT NULL;
            
            -- Agregar la foreign key constraint
            ALTER TABLE conversations ADD CONSTRAINT fk_conversations_tenant_id 
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- =====================================================
-- VERIFICAR Y CREAR COLUMNA tenant_id EN MESSAGES
-- =====================================================
DO $$
BEGIN
    -- Verificar si la tabla messages existe
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'messages') THEN
        -- Verificar si la columna tenant_id existe
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'messages' 
            AND column_name = 'tenant_id'
        ) THEN
            -- Agregar columna tenant_id
            ALTER TABLE messages ADD COLUMN tenant_id UUID;
            
            -- Asignar tenant_id basado en la conversación
            UPDATE messages 
            SET tenant_id = conv.tenant_id
            FROM conversations conv
            WHERE messages.conversation_id = conv.id
            AND messages.tenant_id IS NULL;
            
            -- Para mensajes sin conversación válida, asignar tenant por defecto
            UPDATE messages 
            SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
            WHERE tenant_id IS NULL;
            
            -- Hacer la columna NOT NULL
            ALTER TABLE messages ALTER COLUMN tenant_id SET NOT NULL;
            
            -- Agregar la foreign key constraint
            ALTER TABLE messages ADD CONSTRAINT fk_messages_tenant_id 
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- =====================================================
-- CREAR TABLAS FALTANTES
-- =====================================================

-- TABLA: FLOWS (si no existe)
CREATE TABLE IF NOT EXISTS flows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
    
    -- Información básica
    name VARCHAR(255) NOT NULL,
    description TEXT,
    flow_type flow_type DEFAULT 'custom',
    
    -- Configuración del flujo
    trigger_type trigger_type DEFAULT 'keyword',
    trigger_value TEXT,
    trigger_conditions JSONB DEFAULT '{}',
    
    -- Estructura del flujo
    steps JSONB DEFAULT '[]',
    variables JSONB DEFAULT '{}',
    
    -- Configuración
    settings JSONB DEFAULT '{}',
    
    -- Estado
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    
    -- Estadísticas
    usage_count INTEGER DEFAULT 0,
    completion_rate DECIMAL(5,2) DEFAULT 0.00,
    
    -- Metadatos
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT valid_priority CHECK (priority >= 0),
    CONSTRAINT valid_completion_rate CHECK (completion_rate >= 0 AND completion_rate <= 100)
);

-- TABLA: ANALYTICS_EVENTS (si no existe)
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    chatbot_id UUID REFERENCES chatbots(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    
    -- Información del evento
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(50) NOT NULL,
    event_data JSONB DEFAULT '{}',
    
    -- Metadatos
    user_agent TEXT,
    ip_address INET,
    session_id VARCHAR(255),
    
    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_event_category CHECK (event_category IN ('conversation', 'message', 'user', 'ai', 'flow', 'system'))
);

-- TABLA: WEBHOOKS (si no existe)
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    chatbot_id UUID REFERENCES chatbots(id) ON DELETE CASCADE,
    
    -- Configuración del webhook
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    events TEXT[] NOT NULL,
    headers JSONB DEFAULT '{}',
    
    -- Configuración
    is_active BOOLEAN DEFAULT true,
    retry_count INTEGER DEFAULT 3,
    timeout_seconds INTEGER DEFAULT 30,
    
    -- Estadísticas
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    last_success_at TIMESTAMP WITH TIME ZONE,
    last_failure_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadatos
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_retry_count CHECK (retry_count >= 0 AND retry_count <= 10),
    CONSTRAINT valid_timeout CHECK (timeout_seconds > 0 AND timeout_seconds <= 300)
);

-- TABLA: WEBHOOK_LOGS (si no existe)
CREATE TABLE IF NOT EXISTS webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Información de la ejecución
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    
    -- Respuesta
    status_code INTEGER,
    response_body TEXT,
    response_time_ms INTEGER,
    
    -- Estado
    success BOOLEAN DEFAULT false,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_status_code CHECK (status_code >= 100 AND status_code < 600)
);

-- =====================================================
-- FUNCIONES (crear o reemplazar)
-- =====================================================

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Función para actualizar contadores de mensajes
CREATE OR REPLACE FUNCTION update_conversation_message_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE conversations 
        SET message_count = message_count + 1,
            last_message_at = NEW.sent_at
        WHERE id = NEW.conversation_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE conversations 
        SET message_count = message_count - 1
        WHERE id = OLD.conversation_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

-- =====================================================
-- TRIGGERS (crear solo si no existen)
-- =====================================================

-- Triggers para updated_at
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_tenants_updated_at') THEN
        CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_tenant_users_updated_at') THEN
        CREATE TRIGGER update_tenant_users_updated_at BEFORE UPDATE ON tenant_users
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_chatbots_updated_at') THEN
        CREATE TRIGGER update_chatbots_updated_at BEFORE UPDATE ON chatbots
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_conversations_updated_at') THEN
        CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_flows_updated_at') THEN
        CREATE TRIGGER update_flows_updated_at BEFORE UPDATE ON flows
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_webhooks_updated_at') THEN
        CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON webhooks
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Trigger para contadores de mensajes
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_conversation_message_count_trigger') THEN
        CREATE TRIGGER update_conversation_message_count_trigger
            AFTER INSERT OR DELETE ON messages
            FOR EACH ROW EXECUTE FUNCTION update_conversation_message_count();
    END IF;
END $$;

-- =====================================================
-- ÍNDICES (crear solo si no existen)
-- =====================================================

-- Índices para tenants
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_plan_type ON tenants(plan_type);
CREATE INDEX IF NOT EXISTS idx_tenants_subscription_status ON tenants(subscription_status);
CREATE INDEX IF NOT EXISTS idx_tenants_created_at ON tenants(created_at);
CREATE INDEX IF NOT EXISTS idx_tenants_deleted_at ON tenants(deleted_at) WHERE deleted_at IS NULL;

-- Índices para tenant_users
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_role ON tenant_users(role);
CREATE INDEX IF NOT EXISTS idx_tenant_users_active ON tenant_users(is_active) WHERE is_active = true;

-- Índices para chatbots (solo si la columna tenant_id existe)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'chatbots' 
        AND column_name = 'tenant_id'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_chatbots_tenant_id ON chatbots(tenant_id);
    END IF;
END $$;

-- Más índices para otras tablas...
CREATE INDEX IF NOT EXISTS idx_flows_tenant_id ON flows(tenant_id);
CREATE INDEX IF NOT EXISTS idx_flows_chatbot_id ON flows(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_tenant_id ON analytics_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_tenant_id ON webhooks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_tenant_id ON webhook_logs(tenant_id);

-- =====================================================
-- POLÍTICAS RLS (crear solo si no existen)
-- =====================================================

-- Habilitar RLS en todas las tablas
DO $$ 
BEGIN
    -- Tenants
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants') THEN
        ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
    END IF;
    
    -- Tenant_users
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_users') THEN
        ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
    END IF;
    
    -- Chatbots
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'chatbots') THEN
        ALTER TABLE chatbots ENABLE ROW LEVEL SECURITY;
    END IF;
    
    -- Conversations
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'conversations') THEN
        ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
    END IF;
    
    -- Messages
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'messages') THEN
        ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
    END IF;
    
    -- Flows
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'flows') THEN
        ALTER TABLE flows ENABLE ROW LEVEL SECURITY;
    END IF;
    
    -- Analytics_events
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'analytics_events') THEN
        ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
    END IF;
    
    -- Webhooks
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'webhooks') THEN
        ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
    END IF;
    
    -- Webhook_logs
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'webhook_logs') THEN
        ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Políticas básicas para tenants
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'tenants' 
        AND policyname = 'Users can view their tenants'
    ) THEN
        CREATE POLICY "Users can view their tenants" ON tenants
            FOR SELECT USING (
                id IN (
                    SELECT tenant_id FROM tenant_users 
                    WHERE user_id = auth.uid() AND is_active = true
                )
            );
    END IF;
END $$;

-- Política básica para tenant_users
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'tenant_users' 
        AND policyname = 'Users can view tenant members'
    ) THEN
        CREATE POLICY "Users can view tenant members" ON tenant_users
            FOR SELECT USING (
                tenant_id IN (
                    SELECT tenant_id FROM tenant_users 
                    WHERE user_id = auth.uid() AND is_active = true
                )
            );
    END IF;
END $$;

-- =====================================================
-- DATOS INICIALES
-- =====================================================

-- Insertar registro en migrations
INSERT INTO migrations (filename, checksum, success) 
VALUES ('incremental-migration.sql', 'incremental_v1', true)
ON CONFLICT (filename) DO UPDATE SET 
    checksum = EXCLUDED.checksum,
    executed_at = NOW(),
    success = EXCLUDED.success;

-- =====================================================
-- FINALIZACIÓN
-- =====================================================

-- Mensaje de confirmación
DO $$
BEGIN
    RAISE NOTICE '✅ Migración incremental completada exitosamente';
    RAISE NOTICE '🔄 Se agregaron las columnas tenant_id a las tablas existentes';
    RAISE NOTICE '📊 Se crearon las tablas faltantes para multi-tenancy';
    RAISE NOTICE '🏢 Se creó un tenant por defecto para los datos existentes';
    RAISE NOTICE '🔐 Políticas RLS configuradas para seguridad';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 ¡Tu sistema ahora es compatible con SAAS multi-tenant!';
    RAISE NOTICE '';
    RAISE NOTICE '📋 PRÓXIMOS PASOS:';
    RAISE NOTICE '1. Verifica que todas las tablas tienen la columna tenant_id';
    RAISE NOTICE '2. Ejecuta: npm run init';
    RAISE NOTICE '3. Continúa con la Fase 3: API y Backend';
END $$;