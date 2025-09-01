-- =====================================================
-- LIMPIEZA Y INICIALIZACIÓN COMPLETA DE SUPABASE
-- =====================================================
-- 
-- INSTRUCCIONES:
-- 1. Abre tu proyecto de Supabase
-- 2. Ve a SQL Editor
-- 3. Copia y pega este script completo
-- 4. Ejecuta el script
-- 
-- Este script primero limpiará cualquier tabla existente
-- y luego creará todas las tablas desde cero.
-- =====================================================

-- =====================================================
-- LIMPIEZA DE TABLAS EXISTENTES
-- =====================================================

-- Deshabilitar RLS temporalmente para limpieza
SET session_replication_role = replica;

-- Eliminar tablas en orden inverso de dependencias
DROP TABLE IF EXISTS webhook_logs CASCADE;
DROP TABLE IF EXISTS webhooks CASCADE;
DROP TABLE IF EXISTS analytics_events CASCADE;
DROP TABLE IF EXISTS flows CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS chatbots CASCADE;
DROP TABLE IF EXISTS tenant_users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
DROP TABLE IF EXISTS migrations CASCADE;

-- Eliminar tipos ENUM si existen
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS subscription_status CASCADE;
DROP TYPE IF EXISTS plan_type CASCADE;
DROP TYPE IF EXISTS flow_type CASCADE;
DROP TYPE IF EXISTS field_type CASCADE;
DROP TYPE IF EXISTS trigger_type CASCADE;

-- Eliminar funciones si existen
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS update_conversation_message_count() CASCADE;

-- Restaurar configuración normal
SET session_replication_role = DEFAULT;

-- =====================================================
-- EXTENSIONES NECESARIAS
-- =====================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- TABLA DE MIGRACIONES
-- =====================================================
CREATE TABLE migrations (
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

-- Política para permitir acceso completo al service role
CREATE POLICY "Service role can manage migrations" ON migrations
    FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- ENUMS
-- =====================================================
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE subscription_status AS ENUM ('active', 'inactive', 'cancelled', 'past_due', 'trialing');
CREATE TYPE plan_type AS ENUM ('free', 'starter', 'professional', 'enterprise');
CREATE TYPE flow_type AS ENUM ('welcome', 'menu', 'form', 'ai_chat', 'custom');
CREATE TYPE field_type AS ENUM ('text', 'number', 'email', 'phone', 'date', 'select', 'multiselect', 'boolean');
CREATE TYPE trigger_type AS ENUM ('keyword', 'pattern', 'always', 'condition');

-- =====================================================
-- TABLA: TENANTS (ORGANIZACIONES)
-- =====================================================
CREATE TABLE tenants (
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
-- TABLA: TENANT_USERS (USUARIOS POR TENANT)
-- =====================================================
CREATE TABLE tenant_users (
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
CREATE TABLE chatbots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Información básica
    name VARCHAR(255) NOT NULL,
    description TEXT,
    avatar_url TEXT,
    
    -- Configuración de WhatsApp
    phone_number VARCHAR(20),
    whatsapp_business_account_id VARCHAR(255),
    access_token TEXT,
    webhook_verify_token VARCHAR(255),
    
    -- Configuración del bot
    welcome_message TEXT,
    fallback_message TEXT DEFAULT 'Lo siento, no entendí tu mensaje. ¿Puedes reformularlo?',
    
    -- Configuración de IA
    ai_enabled BOOLEAN DEFAULT false,
    ai_model VARCHAR(100) DEFAULT 'gpt-3.5-turbo',
    ai_system_prompt TEXT,
    ai_temperature DECIMAL(3,2) DEFAULT 0.7,
    ai_max_tokens INTEGER DEFAULT 500,
    
    -- Configuración avanzada
    settings JSONB DEFAULT '{}',
    business_hours JSONB DEFAULT '{}',
    
    -- Estado
    is_active BOOLEAN DEFAULT true,
    is_connected BOOLEAN DEFAULT false,
    last_activity_at TIMESTAMP WITH TIME ZONE,
    
    -- Estadísticas
    total_conversations INTEGER DEFAULT 0,
    total_messages INTEGER DEFAULT 0,
    
    -- Metadatos
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT valid_phone_number CHECK (phone_number ~ '^\\+[1-9]\\d{1,14}$'),
    CONSTRAINT valid_ai_temperature CHECK (ai_temperature >= 0 AND ai_temperature <= 2),
    CONSTRAINT valid_ai_max_tokens CHECK (ai_max_tokens > 0 AND ai_max_tokens <= 4000)
);

-- =====================================================
-- TABLA: CONVERSATIONS
-- =====================================================
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
    
    -- Información del contacto
    contact_phone VARCHAR(20) NOT NULL,
    contact_name VARCHAR(255),
    contact_profile_url TEXT,
    
    -- Estado de la conversación
    status VARCHAR(50) DEFAULT 'active',
    current_flow VARCHAR(100),
    flow_step VARCHAR(100),
    context JSONB DEFAULT '{}',
    
    -- Estadísticas
    message_count INTEGER DEFAULT 0,
    last_message_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadatos
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    UNIQUE(chatbot_id, contact_phone),
    CONSTRAINT valid_contact_phone CHECK (contact_phone ~ '^\\+[1-9]\\d{1,14}$')
);

-- =====================================================
-- TABLA: MESSAGES
-- =====================================================
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    
    -- Información del mensaje
    whatsapp_message_id VARCHAR(255),
    direction VARCHAR(10) NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text',
    
    -- Contenido
    content TEXT,
    media_url TEXT,
    media_mime_type VARCHAR(100),
    media_filename VARCHAR(255),
    
    -- Metadatos del mensaje
    metadata JSONB DEFAULT '{}',
    
    -- Estado
    status VARCHAR(50) DEFAULT 'sent',
    error_message TEXT,
    
    -- IA
    ai_processed BOOLEAN DEFAULT false,
    ai_response_time_ms INTEGER,
    
    -- Timestamps
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadatos
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_direction CHECK (direction IN ('inbound', 'outbound')),
    CONSTRAINT valid_status CHECK (status IN ('sent', 'delivered', 'read', 'failed'))
);

-- =====================================================
-- TABLA: FLOWS (FLUJOS CONVERSACIONALES)
-- =====================================================
CREATE TABLE flows (
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
CREATE TABLE analytics_events (
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
    
    -- Índices
    CONSTRAINT valid_event_category CHECK (event_category IN ('conversation', 'message', 'user', 'ai', 'flow', 'system'))
);

-- =====================================================
-- TABLA: WEBHOOKS
-- =====================================================
CREATE TABLE webhooks (
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
CREATE TABLE webhook_logs (
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
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_users_updated_at BEFORE UPDATE ON tenant_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chatbots_updated_at BEFORE UPDATE ON chatbots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_flows_updated_at BEFORE UPDATE ON flows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON webhooks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger para contadores de mensajes
CREATE TRIGGER update_conversation_message_count_trigger
    AFTER INSERT OR DELETE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_message_count();

-- =====================================================
-- ÍNDICES
-- =====================================================

-- Índices para tenants
CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_plan_type ON tenants(plan_type);
CREATE INDEX idx_tenants_subscription_status ON tenants(subscription_status);
CREATE INDEX idx_tenants_created_at ON tenants(created_at);
CREATE INDEX idx_tenants_deleted_at ON tenants(deleted_at) WHERE deleted_at IS NULL;

-- Índices para tenant_users
CREATE INDEX idx_tenant_users_tenant_id ON tenant_users(tenant_id);
CREATE INDEX idx_tenant_users_user_id ON tenant_users(user_id);
CREATE INDEX idx_tenant_users_role ON tenant_users(role);
CREATE INDEX idx_tenant_users_active ON tenant_users(is_active) WHERE is_active = true;

-- Índices para chatbots
CREATE INDEX idx_chatbots_tenant_id ON chatbots(tenant_id);
CREATE INDEX idx_chatbots_phone_number ON chatbots(phone_number);
CREATE INDEX idx_chatbots_active ON chatbots(is_active) WHERE is_active = true;
CREATE INDEX idx_chatbots_connected ON chatbots(is_connected) WHERE is_connected = true;
CREATE INDEX idx_chatbots_created_at ON chatbots(created_at);
CREATE INDEX idx_chatbots_deleted_at ON chatbots(deleted_at) WHERE deleted_at IS NULL;

-- Índices para conversations
CREATE INDEX idx_conversations_tenant_id ON conversations(tenant_id);
CREATE INDEX idx_conversations_chatbot_id ON conversations(chatbot_id);
CREATE INDEX idx_conversations_contact_phone ON conversations(contact_phone);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_last_message_at ON conversations(last_message_at);
CREATE INDEX idx_conversations_created_at ON conversations(created_at);

-- Índices para messages
CREATE INDEX idx_messages_tenant_id ON messages(tenant_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_whatsapp_id ON messages(whatsapp_message_id);
CREATE INDEX idx_messages_direction ON messages(direction);
CREATE INDEX idx_messages_type ON messages(message_type);
CREATE INDEX idx_messages_status ON messages(status);
CREATE INDEX idx_messages_sent_at ON messages(sent_at);
CREATE INDEX idx_messages_ai_processed ON messages(ai_processed);

-- Índices para flows
CREATE INDEX idx_flows_tenant_id ON flows(tenant_id);
CREATE INDEX idx_flows_chatbot_id ON flows(chatbot_id);
CREATE INDEX idx_flows_type ON flows(flow_type);
CREATE INDEX idx_flows_trigger_type ON flows(trigger_type);
CREATE INDEX idx_flows_active ON flows(is_active) WHERE is_active = true;
CREATE INDEX idx_flows_priority ON flows(priority DESC);
CREATE INDEX idx_flows_created_at ON flows(created_at);
CREATE INDEX idx_flows_deleted_at ON flows(deleted_at) WHERE deleted_at IS NULL;

-- Índices para analytics_events
CREATE INDEX idx_analytics_events_tenant_id ON analytics_events(tenant_id);
CREATE INDEX idx_analytics_events_chatbot_id ON analytics_events(chatbot_id);
CREATE INDEX idx_analytics_events_conversation_id ON analytics_events(conversation_id);
CREATE INDEX idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_events_category ON analytics_events(event_category);
CREATE INDEX idx_analytics_events_created_at ON analytics_events(created_at);

-- Índices para webhooks
CREATE INDEX idx_webhooks_tenant_id ON webhooks(tenant_id);
CREATE INDEX idx_webhooks_chatbot_id ON webhooks(chatbot_id);
CREATE INDEX idx_webhooks_active ON webhooks(is_active) WHERE is_active = true;
CREATE INDEX idx_webhooks_created_at ON webhooks(created_at);

-- Índices para webhook_logs
CREATE INDEX idx_webhook_logs_webhook_id ON webhook_logs(webhook_id);
CREATE INDEX idx_webhook_logs_tenant_id ON webhook_logs(tenant_id);
CREATE INDEX idx_webhook_logs_event_type ON webhook_logs(event_type);
CREATE INDEX idx_webhook_logs_success ON webhook_logs(success);
CREATE INDEX idx_webhook_logs_created_at ON webhook_logs(created_at);

-- =====================================================
-- POLÍTICAS RLS (ROW LEVEL SECURITY)
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
CREATE POLICY "Users can view their tenants" ON tenants
    FOR SELECT USING (
        id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "Owners can update their tenants" ON tenants
    FOR UPDATE USING (
        id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND role = 'owner' AND is_active = true
        )
    );

-- Políticas para tenant_users
CREATE POLICY "Users can view tenant members" ON tenant_users
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "Admins can manage tenant members" ON tenant_users
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND is_active = true
        )
    );

-- Políticas para chatbots
CREATE POLICY "Users can view tenant chatbots" ON chatbots
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "Members can manage tenant chatbots" ON chatbots
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member') AND is_active = true
        )
    );

-- Políticas para conversations
CREATE POLICY "Users can view tenant conversations" ON conversations
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "System can manage conversations" ON conversations
    FOR ALL USING (true);

-- Políticas para messages
CREATE POLICY "Users can view tenant messages" ON messages
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "System can manage messages" ON messages
    FOR ALL USING (true);

-- Políticas para flows
CREATE POLICY "Users can view tenant flows" ON flows
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "Members can manage tenant flows" ON flows
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member') AND is_active = true
        )
    );

-- Políticas para analytics_events
CREATE POLICY "Users can view tenant analytics" ON analytics_events
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "System can manage analytics" ON analytics_events
    FOR ALL USING (true);

-- Políticas para webhooks
CREATE POLICY "Users can view tenant webhooks" ON webhooks
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "Admins can manage tenant webhooks" ON webhooks
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND is_active = true
        )
    );

-- Políticas para webhook_logs
CREATE POLICY "Users can view tenant webhook logs" ON webhook_logs
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "System can manage webhook logs" ON webhook_logs
    FOR ALL USING (true);

-- =====================================================
-- DATOS INICIALES
-- =====================================================

-- Insertar registro en migrations
INSERT INTO migrations (filename, checksum, success) 
VALUES ('clean-and-init-supabase.sql', 'clean_initialization_v1', true);

-- =====================================================
-- COMENTARIOS EN TABLAS
-- =====================================================
COMMENT ON TABLE tenants IS 'Organizaciones/empresas que usan la plataforma';
COMMENT ON TABLE tenant_users IS 'Usuarios asociados a cada tenant con sus roles';
COMMENT ON TABLE chatbots IS 'Chatbots de WhatsApp configurados por tenant';
COMMENT ON TABLE conversations IS 'Conversaciones activas entre chatbots y contactos';
COMMENT ON TABLE messages IS 'Mensajes individuales dentro de las conversaciones';
COMMENT ON TABLE flows IS 'Flujos conversacionales configurables';
COMMENT ON TABLE analytics_events IS 'Eventos de analytics para métricas y reportes';
COMMENT ON TABLE webhooks IS 'Configuración de webhooks para integraciones';
COMMENT ON TABLE webhook_logs IS 'Logs de ejecución de webhooks';

-- =====================================================
-- FINALIZACIÓN
-- =====================================================

-- Mensaje de confirmación
DO $$
BEGIN
    RAISE NOTICE '🧹 Base de datos limpiada completamente';
    RAISE NOTICE '✅ Base de datos inicializada correctamente para TecnoBot SAAS';
    RAISE NOTICE '📊 Tablas creadas: tenants, tenant_users, chatbots, conversations, messages, flows, analytics_events, webhooks, webhook_logs, migrations';
    RAISE NOTICE '🔐 Políticas RLS configuradas para multi-tenancy';
    RAISE NOTICE '⚡ Índices optimizados para rendimiento';
    RAISE NOTICE '🔧 Funciones y triggers configurados';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 ¡La base de datos está lista para usar!';
    RAISE NOTICE '';
    RAISE NOTICE '📋 PRÓXIMOS PASOS:';
    RAISE NOTICE '1. Verifica que se crearon 10 tablas principales';
    RAISE NOTICE '2. Ejecuta: npm run init';
    RAISE NOTICE '3. Continúa con la Fase 3: API y Backend';
END $$;