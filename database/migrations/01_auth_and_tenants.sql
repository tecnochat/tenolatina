-- =====================================================
-- MIGRACIÓN 01: AUTENTICACIÓN Y SISTEMA MULTI-TENANT
-- =====================================================

-- Crear tabla de migraciones
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

-- Política para permitir acceso completo al service role
CREATE POLICY IF NOT EXISTS "Service role can manage migrations" ON migrations
    FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- EXTENSIONES NECESARIAS
-- =====================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- ENUMS
-- =====================================================
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE subscription_status AS ENUM ('active', 'inactive', 'cancelled', 'past_due', 'trialing');
CREATE TYPE plan_type AS ENUM ('free', 'starter', 'professional', 'enterprise');

-- =====================================================
-- TABLA: TENANTS (ORGANIZACIONES)
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

-- Índices para tenants
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_plan_type ON tenants(plan_type);
CREATE INDEX IF NOT EXISTS idx_tenants_subscription_status ON tenants(subscription_status);
CREATE INDEX IF NOT EXISTS idx_tenants_created_at ON tenants(created_at);
CREATE INDEX IF NOT EXISTS idx_tenants_deleted_at ON tenants(deleted_at) WHERE deleted_at IS NULL;

-- =====================================================
-- TABLA: TENANT_USERS (USUARIOS POR TENANT)
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

-- Índices para tenant_users
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_role ON tenant_users(role);
CREATE INDEX IF NOT EXISTS idx_tenant_users_active ON tenant_users(is_active) WHERE is_active = true;

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
    CONSTRAINT valid_phone_number CHECK (phone_number ~ '^\+[1-9]\d{1,14}$'),
    CONSTRAINT valid_ai_temperature CHECK (ai_temperature >= 0 AND ai_temperature <= 2),
    CONSTRAINT valid_ai_max_tokens CHECK (ai_max_tokens > 0 AND ai_max_tokens <= 4000)
);

-- Índices para chatbots
CREATE INDEX IF NOT EXISTS idx_chatbots_tenant_id ON chatbots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chatbots_phone_number ON chatbots(phone_number);
CREATE INDEX IF NOT EXISTS idx_chatbots_active ON chatbots(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_chatbots_connected ON chatbots(is_connected) WHERE is_connected = true;
CREATE INDEX IF NOT EXISTS idx_chatbots_created_at ON chatbots(created_at);
CREATE INDEX IF NOT EXISTS idx_chatbots_deleted_at ON chatbots(deleted_at) WHERE deleted_at IS NULL;

-- =====================================================
-- TABLA: CONVERSATIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
    
    -- Información del contacto
    contact_phone VARCHAR(20) NOT NULL,
    contact_name VARCHAR(255),
    contact_profile_url TEXT,
    
    -- Estado de la conversación
    status VARCHAR(50) DEFAULT 'active', -- active, closed, archived
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
    CONSTRAINT valid_contact_phone CHECK (contact_phone ~ '^\+[1-9]\d{1,14}$')
);

-- Índices para conversations
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_id ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_chatbot_id ON conversations(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact_phone ON conversations(contact_phone);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);

-- =====================================================
-- TABLA: MESSAGES
-- =====================================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    
    -- Información del mensaje
    whatsapp_message_id VARCHAR(255),
    direction VARCHAR(10) NOT NULL, -- 'inbound', 'outbound'
    message_type VARCHAR(50) DEFAULT 'text', -- text, image, audio, video, document, location, etc.
    
    -- Contenido
    content TEXT,
    media_url TEXT,
    media_mime_type VARCHAR(100),
    media_filename VARCHAR(255),
    
    -- Metadatos del mensaje
    metadata JSONB DEFAULT '{}',
    
    -- Estado
    status VARCHAR(50) DEFAULT 'sent', -- sent, delivered, read, failed
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

-- Índices para messages
CREATE INDEX IF NOT EXISTS idx_messages_tenant_id ON messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_id ON messages(whatsapp_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(message_type);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages(sent_at);
CREATE INDEX IF NOT EXISTS idx_messages_ai_processed ON messages(ai_processed);

-- =====================================================
-- FUNCIONES Y TRIGGERS
-- =====================================================

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_users_updated_at BEFORE UPDATE ON tenant_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chatbots_updated_at BEFORE UPDATE ON chatbots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Función para actualizar contadores
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

-- Trigger para actualizar contadores de mensajes
CREATE TRIGGER update_conversation_message_count_trigger
    AFTER INSERT OR DELETE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_message_count();

-- =====================================================
-- POLÍTICAS RLS (ROW LEVEL SECURITY)
-- =====================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbots ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

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
    FOR ALL USING (true); -- Para webhooks y sistema

-- Políticas para messages
CREATE POLICY "Users can view tenant messages" ON messages
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "System can manage messages" ON messages
    FOR ALL USING (true); -- Para webhooks y sistema

-- =====================================================
-- DATOS INICIALES
-- =====================================================

-- Insertar registro en migrations
INSERT INTO migrations (filename, checksum, success) 
VALUES ('01_auth_and_tenants.sql', 'initial', true)
ON CONFLICT (filename) DO NOTHING;

-- Comentarios en las tablas
COMMENT ON TABLE tenants IS 'Organizaciones/empresas que usan la plataforma';
COMMENT ON TABLE tenant_users IS 'Usuarios asociados a cada tenant con sus roles';
COMMENT ON TABLE chatbots IS 'Chatbots de WhatsApp configurados por tenant';
COMMENT ON TABLE conversations IS 'Conversaciones activas entre chatbots y contactos';
COMMENT ON TABLE messages IS 'Mensajes individuales dentro de las conversaciones';