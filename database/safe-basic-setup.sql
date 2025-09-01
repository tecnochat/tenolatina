-- =====================================================
-- TECNOBOT SAAS - CONFIGURACIÓN SEGURA PASO A PASO
-- =====================================================
-- Este script maneja tablas existentes y crea las faltantes
-- de forma segura sin errores de columnas faltantes

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Crear tipos ENUM básicos
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE subscription_status AS ENUM ('active', 'inactive', 'cancelled', 'past_due');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE plan_type AS ENUM ('free', 'basic', 'pro', 'enterprise');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- PASO 1: CREAR TABLAS BÁSICAS
-- =====================================================

-- TABLA: migrations (para control de versiones)
CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TABLA: tenants (inquilinos/organizaciones)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan plan_type DEFAULT 'free',
    subscription_status subscription_status DEFAULT 'active',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TABLA: tenant_users (usuarios por tenant)
CREATE TABLE IF NOT EXISTS tenant_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- Referencia a auth.users de Supabase
    role user_role DEFAULT 'member',
    permissions JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, user_id)
);

-- =====================================================
-- PASO 2: CREAR/ACTUALIZAR TABLAS CON TENANT_ID
-- =====================================================

-- TABLA: chatbots
CREATE TABLE IF NOT EXISTS chatbots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20),
    status VARCHAR(50) DEFAULT 'inactive',
    settings JSONB DEFAULT '{}',
    ai_config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agregar tenant_id a chatbots si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'chatbots' AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE chatbots ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
        RAISE NOTICE '✅ Columna tenant_id agregada a chatbots';
    ELSE
        RAISE NOTICE '⚠️ Columna tenant_id ya existe en chatbots';
    END IF;
END $$;

-- TABLA: conversations
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(20) NOT NULL,
    contact_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agregar columnas faltantes a conversations
DO $$
BEGIN
    -- Agregar tenant_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversations' AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE conversations ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
        RAISE NOTICE '✅ Columna tenant_id agregada a conversations';
    END IF;
    
    -- Agregar chatbot_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversations' AND column_name = 'chatbot_id'
    ) THEN
        ALTER TABLE conversations ADD COLUMN chatbot_id UUID REFERENCES chatbots(id) ON DELETE CASCADE;
        RAISE NOTICE '✅ Columna chatbot_id agregada a conversations';
    END IF;
END $$;

-- TABLA: messages
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(20) NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text',
    content TEXT,
    media_url TEXT,
    direction VARCHAR(20) DEFAULT 'inbound',
    status VARCHAR(50) DEFAULT 'delivered',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agregar columnas faltantes a messages
DO $$
BEGIN
    -- Agregar tenant_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE messages ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
        RAISE NOTICE '✅ Columna tenant_id agregada a messages';
    END IF;
    
    -- Agregar conversation_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'conversation_id'
    ) THEN
        ALTER TABLE messages ADD COLUMN conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE;
        RAISE NOTICE '✅ Columna conversation_id agregada a messages';
    END IF;
    
    -- Agregar chatbot_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'chatbot_id'
    ) THEN
        ALTER TABLE messages ADD COLUMN chatbot_id UUID REFERENCES chatbots(id) ON DELETE CASCADE;
        RAISE NOTICE '✅ Columna chatbot_id agregada a messages';
    END IF;
END $$;

-- TABLA: flows
CREATE TABLE IF NOT EXISTS flows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    flow_data JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agregar columnas faltantes a flows
DO $$
BEGIN
    -- Agregar tenant_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'flows' AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE flows ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
        RAISE NOTICE '✅ Columna tenant_id agregada a flows';
    END IF;
    
    -- Agregar chatbot_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'flows' AND column_name = 'chatbot_id'
    ) THEN
        ALTER TABLE flows ADD COLUMN chatbot_id UUID REFERENCES chatbots(id) ON DELETE CASCADE;
        RAISE NOTICE '✅ Columna chatbot_id agregada a flows';
    END IF;
END $$;

-- =====================================================
-- PASO 3: CREAR ÍNDICES
-- =====================================================

-- Índices para tenants
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(subscription_status);

-- Índices para tenant_users
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON tenant_users(user_id);

-- Índices para chatbots (solo si las columnas existen)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chatbots' AND column_name = 'tenant_id') THEN
        CREATE INDEX IF NOT EXISTS idx_chatbots_tenant ON chatbots(tenant_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chatbots' AND column_name = 'phone_number') THEN
        CREATE INDEX IF NOT EXISTS idx_chatbots_phone ON chatbots(phone_number);
    END IF;
END $$;

-- Índices para conversations (solo si las columnas existen)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'tenant_id') THEN
        CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'chatbot_id') THEN
        CREATE INDEX IF NOT EXISTS idx_conversations_chatbot ON conversations(chatbot_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'phone_number') THEN
        CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone_number);
    END IF;
END $$;

-- Índices para messages (solo si las columnas existen)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'tenant_id') THEN
        CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'conversation_id') THEN
        CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'phone_number') THEN
        CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone_number);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'created_at') THEN
        CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
    END IF;
END $$;

-- Índices para flows (solo si las columnas existen)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'flows' AND column_name = 'tenant_id') THEN
        CREATE INDEX IF NOT EXISTS idx_flows_tenant ON flows(tenant_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'flows' AND column_name = 'chatbot_id') THEN
        CREATE INDEX IF NOT EXISTS idx_flows_chatbot ON flows(chatbot_id);
    END IF;
END $$;

-- =====================================================
-- PASO 4: FUNCIONES Y TRIGGERS
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
DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tenant_users_updated_at ON tenant_users;
CREATE TRIGGER update_tenant_users_updated_at
    BEFORE UPDATE ON tenant_users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_chatbots_updated_at ON chatbots;
CREATE TRIGGER update_chatbots_updated_at
    BEFORE UPDATE ON chatbots
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_flows_updated_at ON flows;
CREATE TRIGGER update_flows_updated_at
    BEFORE UPDATE ON flows
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- PASO 5: CONFIGURAR RLS Y POLÍTICAS
-- =====================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbots ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE flows ENABLE ROW LEVEL SECURITY;

-- Políticas para tenants
DROP POLICY IF EXISTS "Users can view their tenant" ON tenants;
CREATE POLICY "Users can view their tenant" ON tenants
    FOR SELECT USING (
        id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid()
        )
    );

-- Políticas para tenant_users
DROP POLICY IF EXISTS "Users can view their tenant memberships" ON tenant_users;
CREATE POLICY "Users can view their tenant memberships" ON tenant_users
    FOR SELECT USING (user_id = auth.uid());

-- Políticas para chatbots
DROP POLICY IF EXISTS "Users can manage chatbots in their tenant" ON chatbots;
CREATE POLICY "Users can manage chatbots in their tenant" ON chatbots
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid()
        )
    );

-- Políticas para conversations
DROP POLICY IF EXISTS "Users can manage conversations in their tenant" ON conversations;
CREATE POLICY "Users can manage conversations in their tenant" ON conversations
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid()
        )
    );

-- Políticas para messages
DROP POLICY IF EXISTS "Users can manage messages in their tenant" ON messages;
CREATE POLICY "Users can manage messages in their tenant" ON messages
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid()
        )
    );

-- Políticas para flows
DROP POLICY IF EXISTS "Users can manage flows in their tenant" ON flows;
CREATE POLICY "Users can manage flows in their tenant" ON flows
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid()
        )
    );

-- =====================================================
-- PASO 6: DATOS INICIALES
-- =====================================================

-- Insertar tenant por defecto
INSERT INTO tenants (id, name, slug, plan, subscription_status)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'TecnoBot Default',
    'default',
    'free',
    'active'
) ON CONFLICT (id) DO NOTHING;

-- Registrar migración
INSERT INTO migrations (version, description)
VALUES ('001_safe_basic_setup', 'Configuración segura de tablas básicas para TecnoBot SAAS')
ON CONFLICT (version) DO NOTHING;

-- =====================================================
-- MENSAJE FINAL
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎉 CONFIGURACIÓN SEGURA COMPLETADA';
    RAISE NOTICE '✅ Todas las tablas y columnas verificadas/creadas';
    RAISE NOTICE '📋 Tablas configuradas:';
    RAISE NOTICE '   - migrations';
    RAISE NOTICE '   - tenants';
    RAISE NOTICE '   - tenant_users';
    RAISE NOTICE '   - chatbots (con tenant_id)';
    RAISE NOTICE '   - conversations (con tenant_id y chatbot_id)';
    RAISE NOTICE '   - messages (con tenant_id, conversation_id y chatbot_id)';
    RAISE NOTICE '   - flows (con tenant_id y chatbot_id)';
    RAISE NOTICE '';
    RAISE NOTICE '🔐 RLS y políticas configuradas';
    RAISE NOTICE '🔄 PRÓXIMO PASO:';
    RAISE NOTICE '   Ejecuta: npm run init';
END $$;