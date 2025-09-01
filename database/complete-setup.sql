-- =====================================================
-- CONFIGURACIÓN COMPLETA PARA TECNOBOT SAAS
-- =====================================================
-- 
-- INSTRUCCIONES:
-- Este script creará TODAS las tablas necesarias desde cero
-- Es seguro ejecutarlo incluso si algunas tablas ya existen
-- 
-- 1. Abre tu proyecto de Supabase
-- 2. Ve a SQL Editor
-- 3. Copia y pega este script completo
-- 4. Ejecuta el script
-- =====================================================

-- =====================================================
-- EXTENSIONES NECESARIAS
-- =====================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- TABLA DE MIGRACIONES
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

-- Habilitar RLS para migraciones
ALTER TABLE migrations ENABLE ROW LEVEL SECURITY;

-- Política para migraciones
DROP POLICY IF EXISTS "Service role can manage migrations" ON migrations;
CREATE POLICY "Service role can manage migrations" ON migrations
    FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- ENUMS
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
-- TABLA: TENANTS
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
-- TABLA: TENANT_USERS
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
-- TABLA: CHATBOTS
-- =====================================================
CREATE TABLE IF NOT EXISTS chatbots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Información básica
    name VARCHAR(255) NOT NULL,
    description TEXT,
    avatar_url TEXT,
    
    -- Configuración de WhatsApp
    phone_number VARCHAR(20),
    whatsapp_config JSONB DEFAULT '{}',
    
    -- Configuración de IA
    ai_config JSONB DEFAULT '{}',
    ai_model VARCHAR(100) DEFAULT 'gpt-3.5-turbo',
    ai_temperature DECIMAL(3,2) DEFAULT 0.7,
    ai_max_tokens INTEGER DEFAULT 1000,
    
    -- Estado
    is_active BOOLEAN DEFAULT true,
    is_connected BOOLEAN DEFAULT false,
    last_connection_at TIMESTAMP WITH TIME ZONE,
    
    -- Estadísticas
    total_conversations INTEGER DEFAULT 0,
    total_messages INTEGER DEFAULT 0,
    
    -- Metadatos
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- =====================================================
-- TABLA: CONVERSATIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
    
    -- Información del usuario
    user_phone VARCHAR(20) NOT NULL,
    user_name VARCHAR(255),
    user_profile_pic TEXT,
    
    -- Estado de la conversación
    status VARCHAR(50) DEFAULT 'active',
    current_flow_id UUID,
    current_step INTEGER DEFAULT 0,
    
    -- Contexto y variables
    context JSONB DEFAULT '{}',
    variables JSONB DEFAULT '{}',
    
    -- Estadísticas
    message_count INTEGER DEFAULT 0,
    ai_requests_count INTEGER DEFAULT 0,
    
    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadatos
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLA: MESSAGES
-- =====================================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    
    -- Información del mensaje
    message_id VARCHAR(255), -- ID del mensaje de WhatsApp
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    message_type VARCHAR(20) DEFAULT 'text',
    
    -- Contenido
    content TEXT,
    media_url TEXT,
    media_type VARCHAR(50),
    
    -- Metadatos
    metadata JSONB DEFAULT '{}',
    
    -- Estado
    status VARCHAR(20) DEFAULT 'sent',
    error_message TEXT,
    
    -- Timestamps
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadatos
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLA: FLOWS
-- =====================================================
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

-- =====================================================
-- TABLA: ANALYTICS_EVENTS
-- =====================================================
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

-- =====================================================
-- TABLA: WEBHOOKS
-- =====================================================
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

-- =====================================================
-- TABLA: WEBHOOK_LOGS
-- =====================================================
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
-- FUNCIONES
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
-- TRIGGERS
-- =====================================================

-- Triggers para updated_at
DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tenant_users_updated_at ON tenant_users;
CREATE TRIGGER update_tenant_users_updated_at BEFORE UPDATE ON tenant_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_chatbots_updated_at ON chatbots;
CREATE TRIGGER update_chatbots_updated_at BEFORE UPDATE ON chatbots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_flows_updated_at ON flows;
CREATE TRIGGER update_flows_updated_at BEFORE UPDATE ON flows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_webhooks_updated_at ON webhooks;
CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON webhooks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger para contadores de mensajes
DROP TRIGGER IF EXISTS update_conversation_message_count_trigger ON messages;
CREATE TRIGGER update_conversation_message_count_trigger
    AFTER INSERT OR DELETE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_message_count();

-- =====================================================
-- ÍNDICES
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

-- Índices para chatbots
CREATE INDEX IF NOT EXISTS idx_chatbots_tenant_id ON chatbots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chatbots_phone_number ON chatbots(phone_number);
CREATE INDEX IF NOT EXISTS idx_chatbots_active ON chatbots(is_active) WHERE is_active = true;

-- Índices para conversations
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_id ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_chatbot_id ON conversations(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_phone ON conversations(user_phone);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_started_at ON conversations(started_at);

-- Índices para messages
CREATE INDEX IF NOT EXISTS idx_messages_tenant_id ON messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);
CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages(sent_at);

-- Índices para flows
CREATE INDEX IF NOT EXISTS idx_flows_tenant_id ON flows(tenant_id);
CREATE INDEX IF NOT EXISTS idx_flows_chatbot_id ON flows(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_flows_active ON flows(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_flows_priority ON flows(priority);

-- Índices para analytics_events
CREATE INDEX IF NOT EXISTS idx_analytics_events_tenant_id ON analytics_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_chatbot_id ON analytics_events(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);

-- Índices para webhooks
CREATE INDEX IF NOT EXISTS idx_webhooks_tenant_id ON webhooks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_chatbot_id ON webhooks(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active) WHERE is_active = true;

-- Índices para webhook_logs
CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id ON webhook_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_tenant_id ON webhook_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at);

-- =====================================================
-- POLÍTICAS RLS
-- =====================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbots ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para tenants
DROP POLICY IF EXISTS "Users can view their tenants" ON tenants;
CREATE POLICY "Users can view their tenants" ON tenants
    FOR SELECT USING (
        id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

DROP POLICY IF EXISTS "Owners can update their tenants" ON tenants;
CREATE POLICY "Owners can update their tenants" ON tenants
    FOR UPDATE USING (
        id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND role = 'owner' AND is_active = true
        )
    );

-- Políticas para tenant_users
DROP POLICY IF EXISTS "Users can view tenant members" ON tenant_users;
CREATE POLICY "Users can view tenant members" ON tenant_users
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

-- Políticas para chatbots
DROP POLICY IF EXISTS "Users can view tenant chatbots" ON chatbots;
CREATE POLICY "Users can view tenant chatbots" ON chatbots
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

DROP POLICY IF EXISTS "Users can manage tenant chatbots" ON chatbots;
CREATE POLICY "Users can manage tenant chatbots" ON chatbots
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND is_active = true
        )
    );

-- Políticas para conversations
DROP POLICY IF EXISTS "Users can view tenant conversations" ON conversations;
CREATE POLICY "Users can view tenant conversations" ON conversations
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

-- Políticas para messages
DROP POLICY IF EXISTS "Users can view tenant messages" ON messages;
CREATE POLICY "Users can view tenant messages" ON messages
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

-- Políticas para flows
DROP POLICY IF EXISTS "Users can view tenant flows" ON flows;
CREATE POLICY "Users can view tenant flows" ON flows
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

DROP POLICY IF EXISTS "Users can manage tenant flows" ON flows;
CREATE POLICY "Users can manage tenant flows" ON flows
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member') AND is_active = true
        )
    );

-- Políticas para analytics_events
DROP POLICY IF EXISTS "Users can view tenant analytics" ON analytics_events;
CREATE POLICY "Users can view tenant analytics" ON analytics_events
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

-- Políticas para webhooks
DROP POLICY IF EXISTS "Users can view tenant webhooks" ON webhooks;
CREATE POLICY "Users can view tenant webhooks" ON webhooks
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

DROP POLICY IF EXISTS "Users can manage tenant webhooks" ON webhooks;
CREATE POLICY "Users can manage tenant webhooks" ON webhooks
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND is_active = true
        )
    );

-- Políticas para webhook_logs
DROP POLICY IF EXISTS "Users can view tenant webhook logs" ON webhook_logs;
CREATE POLICY "Users can view tenant webhook logs" ON webhook_logs
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

-- =====================================================
-- DATOS INICIALES
-- =====================================================

-- Crear tenant por defecto
INSERT INTO tenants (name, slug, description, plan_type) 
VALUES ('Mi Empresa', 'mi-empresa', 'Tenant principal para comenzar', 'free')
ON CONFLICT (slug) DO NOTHING;

-- Insertar registro en migrations
INSERT INTO migrations (filename, checksum, success) 
VALUES ('complete-setup.sql', 'complete_setup_v1', true)
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
    RAISE NOTICE '✅ Configuración completa exitosa';
    RAISE NOTICE '📊 Se crearon todas las tablas necesarias para SAAS';
    RAISE NOTICE '🏢 Se creó un tenant por defecto: "Mi Empresa"';
    RAISE NOTICE '🔐 Políticas RLS configuradas para seguridad';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 ¡Tu sistema está listo para SAAS multi-tenant!';
    RAISE NOTICE '';
    RAISE NOTICE '📋 PRÓXIMOS PASOS:';
    RAISE NOTICE '1. Verifica que se crearon 9 tablas principales';
    RAISE NOTICE '2. Ejecuta: npm run init';
    RAISE NOTICE '3. Continúa con la Fase 3: API y Backend';
END $$;