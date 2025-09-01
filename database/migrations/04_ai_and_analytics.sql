-- =====================================================
-- MIGRACIÓN 04: AI Y ANALYTICS
-- Tablas para configuración de IA y sistema de analytics
-- =====================================================

-- Tabla: ai_configurations
-- Configuraciones de IA para cada chatbot
CREATE TABLE IF NOT EXISTS ai_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
    chatbot_id UUID NOT NULL,
    provider VARCHAR(50) DEFAULT 'openai' CHECK (provider IN ('openai', 'anthropic', 'google', 'azure', 'custom')),
    model VARCHAR(100) DEFAULT 'gpt-3.5-turbo',
    api_key_encrypted TEXT, -- Clave API encriptada (opcional, puede usar la del sistema)
    temperature DECIMAL(3,2) DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
    max_tokens INTEGER DEFAULT 1000 CHECK (max_tokens > 0 AND max_tokens <= 8000),
    top_p DECIMAL(3,2) DEFAULT 1.0 CHECK (top_p >= 0 AND top_p <= 1),
    frequency_penalty DECIMAL(3,2) DEFAULT 0.0 CHECK (frequency_penalty >= -2 AND frequency_penalty <= 2),
    presence_penalty DECIMAL(3,2) DEFAULT 0.0 CHECK (presence_penalty >= -2 AND presence_penalty <= 2),
    system_prompt TEXT DEFAULT 'Eres un asistente virtual útil y amigable.',
    context_window INTEGER DEFAULT 10, -- Número de mensajes previos a considerar
    response_format VARCHAR(20) DEFAULT 'text' CHECK (response_format IN ('text', 'json', 'structured')),
    safety_settings JSONB DEFAULT '{}', -- Configuraciones de seguridad
    custom_instructions TEXT, -- Instrucciones personalizadas adicionales
    fallback_responses TEXT[], -- Respuestas de respaldo si falla la IA
    is_active BOOLEAN DEFAULT true,
    usage_stats JSONB DEFAULT '{}', -- Estadísticas de uso
    created_by UUID NOT NULL,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint único por chatbot
    UNIQUE(tenant_id, chatbot_id)
);

-- Índices para ai_configurations
CREATE INDEX idx_ai_configurations_tenant_id ON ai_configurations(tenant_id);
CREATE INDEX idx_ai_configurations_chatbot_id ON ai_configurations(chatbot_id);
CREATE INDEX idx_ai_configurations_provider ON ai_configurations(provider);
CREATE INDEX idx_ai_configurations_model ON ai_configurations(model);
CREATE INDEX idx_ai_configurations_is_active ON ai_configurations(is_active);

-- RLS para ai_configurations
ALTER TABLE ai_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_configurations_tenant_isolation" ON ai_configurations
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =====================================================

-- Tabla: ai_requests
-- Registro de todas las solicitudes a servicios de IA
CREATE TABLE IF NOT EXISTS ai_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
    chatbot_id UUID NOT NULL,
    ai_config_id UUID REFERENCES ai_configurations(id) ON DELETE SET NULL,
    user_phone VARCHAR(20) NOT NULL,
    session_id VARCHAR(100),
    request_type VARCHAR(20) DEFAULT 'chat' CHECK (request_type IN ('chat', 'completion', 'embedding', 'moderation')),
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    prompt_text TEXT NOT NULL,
    response_text TEXT,
    tokens_used INTEGER DEFAULT 0,
    cost_usd DECIMAL(10,6) DEFAULT 0.000000, -- Costo en USD
    response_time_ms INTEGER, -- Tiempo de respuesta en milisegundos
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'error', 'timeout')),
    error_message TEXT,
    metadata JSONB DEFAULT '{}', -- Metadatos adicionales
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para ai_requests
CREATE INDEX idx_ai_requests_tenant_id ON ai_requests(tenant_id);
CREATE INDEX idx_ai_requests_chatbot_id ON ai_requests(chatbot_id);
CREATE INDEX idx_ai_requests_user_phone ON ai_requests(user_phone);
CREATE INDEX idx_ai_requests_status ON ai_requests(status);
CREATE INDEX idx_ai_requests_provider ON ai_requests(provider);
CREATE INDEX idx_ai_requests_created_at ON ai_requests(created_at DESC);
CREATE INDEX idx_ai_requests_cost ON ai_requests(cost_usd DESC);

-- RLS para ai_requests
ALTER TABLE ai_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_requests_tenant_isolation" ON ai_requests
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =====================================================

-- Tabla: conversations
-- Registro de conversaciones completas
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
    chatbot_id UUID NOT NULL,
    user_phone VARCHAR(20) NOT NULL,
    user_name VARCHAR(200),
    session_id VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned', 'transferred')),
    channel VARCHAR(20) DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'telegram', 'web', 'api')),
    language VARCHAR(5) DEFAULT 'es',
    context JSONB DEFAULT '{}', -- Contexto de la conversación
    tags TEXT[], -- Tags para categorización
    satisfaction_rating INTEGER CHECK (satisfaction_rating >= 1 AND satisfaction_rating <= 5),
    satisfaction_feedback TEXT,
    assigned_agent_id UUID, -- ID del agente humano si se transfiere
    transfer_reason TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    message_count INTEGER DEFAULT 0,
    ai_message_count INTEGER DEFAULT 0,
    human_message_count INTEGER DEFAULT 0,
    
    -- Constraints
    CONSTRAINT conversations_duration_positive CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    CONSTRAINT conversations_message_counts_positive CHECK (
        message_count >= 0 AND 
        ai_message_count >= 0 AND 
        human_message_count >= 0
    )
);

-- Índices para conversations
CREATE INDEX idx_conversations_tenant_id ON conversations(tenant_id);
CREATE INDEX idx_conversations_chatbot_id ON conversations(chatbot_id);
CREATE INDEX idx_conversations_user_phone ON conversations(user_phone);
CREATE INDEX idx_conversations_session_id ON conversations(session_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_channel ON conversations(channel);
CREATE INDEX idx_conversations_started_at ON conversations(started_at DESC);
CREATE INDEX idx_conversations_tags ON conversations USING GIN(tags);
CREATE INDEX idx_conversations_satisfaction ON conversations(satisfaction_rating);

-- RLS para conversations
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_tenant_isolation" ON conversations
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =====================================================

-- Tabla: messages
-- Registro de todos los mensajes individuales
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    chatbot_id UUID NOT NULL,
    whatsapp_message_id VARCHAR(100), -- ID del mensaje en WhatsApp
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'audio', 'document', 'location', 'contact', 'sticker', 'reaction')),
    content JSONB NOT NULL DEFAULT '{}', -- Contenido del mensaje
    sender_phone VARCHAR(20),
    sender_name VARCHAR(200),
    is_from_ai BOOLEAN DEFAULT false,
    ai_request_id UUID REFERENCES ai_requests(id) ON DELETE SET NULL,
    flow_id UUID REFERENCES flows(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE
);

-- Índices para messages
CREATE INDEX idx_messages_tenant_id ON messages(tenant_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_chatbot_id ON messages(chatbot_id);
CREATE INDEX idx_messages_whatsapp_id ON messages(whatsapp_message_id);
CREATE INDEX idx_messages_direction ON messages(direction);
CREATE INDEX idx_messages_type ON messages(message_type);
CREATE INDEX idx_messages_sender_phone ON messages(sender_phone);
CREATE INDEX idx_messages_is_from_ai ON messages(is_from_ai);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_status ON messages(status);

-- RLS para messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_tenant_isolation" ON messages
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =====================================================

-- Tabla: analytics_events
-- Eventos para analytics detallados
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
    chatbot_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- Tipo de evento (message_sent, flow_started, etc.)
    event_category VARCHAR(50) DEFAULT 'general', -- Categoría del evento
    user_phone VARCHAR(20),
    session_id VARCHAR(100),
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    properties JSONB DEFAULT '{}', -- Propiedades específicas del evento
    value DECIMAL(10,2), -- Valor numérico del evento (opcional)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para analytics_events
CREATE INDEX idx_analytics_events_tenant_id ON analytics_events(tenant_id);
CREATE INDEX idx_analytics_events_chatbot_id ON analytics_events(chatbot_id);
CREATE INDEX idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_events_category ON analytics_events(event_category);
CREATE INDEX idx_analytics_events_user_phone ON analytics_events(user_phone);
CREATE INDEX idx_analytics_events_created_at ON analytics_events(created_at DESC);
CREATE INDEX idx_analytics_events_properties ON analytics_events USING GIN(properties);

-- RLS para analytics_events
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analytics_events_tenant_isolation" ON analytics_events
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =====================================================

-- Tabla: daily_analytics
-- Resúmenes diarios de analytics para consultas rápidas
CREATE TABLE IF NOT EXISTS daily_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
    chatbot_id UUID NOT NULL,
    date DATE NOT NULL,
    total_conversations INTEGER DEFAULT 0,
    total_messages INTEGER DEFAULT 0,
    total_users INTEGER DEFAULT 0,
    ai_requests INTEGER DEFAULT 0,
    ai_cost_usd DECIMAL(10,6) DEFAULT 0.000000,
    avg_conversation_duration DECIMAL(10,2), -- En segundos
    avg_messages_per_conversation DECIMAL(5,2),
    satisfaction_avg DECIMAL(3,2),
    satisfaction_count INTEGER DEFAULT 0,
    flows_started INTEGER DEFAULT 0,
    flows_completed INTEGER DEFAULT 0,
    welcomes_sent INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint único por tenant, chatbot y fecha
    UNIQUE(tenant_id, chatbot_id, date)
);

-- Índices para daily_analytics
CREATE INDEX idx_daily_analytics_tenant_id ON daily_analytics(tenant_id);
CREATE INDEX idx_daily_analytics_chatbot_id ON daily_analytics(chatbot_id);
CREATE INDEX idx_daily_analytics_date ON daily_analytics(date DESC);
CREATE INDEX idx_daily_analytics_conversations ON daily_analytics(total_conversations DESC);
CREATE INDEX idx_daily_analytics_users ON daily_analytics(total_users DESC);

-- RLS para daily_analytics
ALTER TABLE daily_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_analytics_tenant_isolation" ON daily_analytics
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =====================================================

-- Funciones para actualizar contadores automáticamente

-- Función para actualizar contadores de conversación
CREATE OR REPLACE FUNCTION update_conversation_counters()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Actualizar contador de mensajes en la conversación
        UPDATE conversations 
        SET message_count = message_count + 1,
            ai_message_count = CASE WHEN NEW.is_from_ai THEN ai_message_count + 1 ELSE ai_message_count END,
            human_message_count = CASE WHEN NOT NEW.is_from_ai THEN human_message_count + 1 ELSE human_message_count END
        WHERE id = NEW.conversation_id;
        
        -- Crear evento de analytics
        INSERT INTO analytics_events (tenant_id, chatbot_id, event_type, event_category, user_phone, session_id, conversation_id, properties)
        VALUES (
            NEW.tenant_id,
            NEW.chatbot_id,
            'message_' || NEW.direction,
            'messaging',
            NEW.sender_phone,
            (SELECT session_id FROM conversations WHERE id = NEW.conversation_id),
            NEW.conversation_id,
            jsonb_build_object(
                'message_type', NEW.message_type,
                'is_from_ai', NEW.is_from_ai,
                'direction', NEW.direction
            )
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar contadores de conversación
CREATE TRIGGER trigger_update_conversation_counters
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_counters();

-- =====================================================

-- Función para calcular duración de conversación al finalizar
CREATE OR REPLACE FUNCTION calculate_conversation_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status != NEW.status AND NEW.status IN ('completed', 'abandoned', 'transferred') THEN
        NEW.ended_at = NOW();
        NEW.duration_seconds = EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::INTEGER;
        
        -- Crear evento de analytics
        INSERT INTO analytics_events (tenant_id, chatbot_id, event_type, event_category, user_phone, session_id, conversation_id, properties, value)
        VALUES (
            NEW.tenant_id,
            NEW.chatbot_id,
            'conversation_' || NEW.status,
            'conversation',
            NEW.user_phone,
            NEW.session_id,
            NEW.id,
            jsonb_build_object(
                'duration_seconds', NEW.duration_seconds,
                'message_count', NEW.message_count,
                'satisfaction_rating', NEW.satisfaction_rating
            ),
            NEW.duration_seconds
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para calcular duración de conversación
CREATE TRIGGER trigger_calculate_conversation_duration
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION calculate_conversation_duration();

-- =====================================================

-- Función para generar analytics diarios
CREATE OR REPLACE FUNCTION generate_daily_analytics(target_date DATE DEFAULT CURRENT_DATE - INTERVAL '1 day')
RETURNS VOID AS $$
DECLARE
    tenant_record RECORD;
    chatbot_record RECORD;
BEGIN
    -- Iterar por cada tenant y chatbot
    FOR tenant_record IN SELECT DISTINCT tenant_id FROM conversations WHERE DATE(started_at) = target_date LOOP
        FOR chatbot_record IN SELECT DISTINCT chatbot_id FROM conversations WHERE tenant_id = tenant_record.tenant_id AND DATE(started_at) = target_date LOOP
            
            INSERT INTO daily_analytics (
                tenant_id,
                chatbot_id,
                date,
                total_conversations,
                total_messages,
                total_users,
                ai_requests,
                ai_cost_usd,
                avg_conversation_duration,
                avg_messages_per_conversation,
                satisfaction_avg,
                satisfaction_count,
                flows_started,
                flows_completed,
                welcomes_sent,
                errors_count
            )
            SELECT 
                tenant_record.tenant_id,
                chatbot_record.chatbot_id,
                target_date,
                COUNT(DISTINCT c.id) as total_conversations,
                COUNT(m.id) as total_messages,
                COUNT(DISTINCT c.user_phone) as total_users,
                COUNT(DISTINCT ai.id) as ai_requests,
                COALESCE(SUM(ai.cost_usd), 0) as ai_cost_usd,
                AVG(c.duration_seconds) as avg_conversation_duration,
                CASE WHEN COUNT(DISTINCT c.id) > 0 THEN COUNT(m.id)::DECIMAL / COUNT(DISTINCT c.id) ELSE 0 END as avg_messages_per_conversation,
                AVG(c.satisfaction_rating) as satisfaction_avg,
                COUNT(c.satisfaction_rating) as satisfaction_count,
                COUNT(DISTINCT fe.id) FILTER (WHERE fe.status = 'started') as flows_started,
                COUNT(DISTINCT fe.id) FILTER (WHERE fe.status = 'completed') as flows_completed,
                COUNT(DISTINCT wi.id) FILTER (WHERE wi.interaction_type = 'sent') as welcomes_sent,
                COUNT(m.id) FILTER (WHERE m.status = 'failed') as errors_count
            FROM conversations c
            LEFT JOIN messages m ON c.id = m.conversation_id
            LEFT JOIN ai_requests ai ON c.chatbot_id = ai.chatbot_id AND DATE(ai.created_at) = target_date
            LEFT JOIN flow_executions fe ON c.chatbot_id = fe.chatbot_id AND DATE(fe.started_at) = target_date
            LEFT JOIN welcome_interactions wi ON c.chatbot_id = wi.chatbot_id AND DATE(wi.created_at) = target_date
            WHERE c.tenant_id = tenant_record.tenant_id 
                AND c.chatbot_id = chatbot_record.chatbot_id
                AND DATE(c.started_at) = target_date
            GROUP BY tenant_record.tenant_id, chatbot_record.chatbot_id
            ON CONFLICT (tenant_id, chatbot_id, date) 
            DO UPDATE SET
                total_conversations = EXCLUDED.total_conversations,
                total_messages = EXCLUDED.total_messages,
                total_users = EXCLUDED.total_users,
                ai_requests = EXCLUDED.ai_requests,
                ai_cost_usd = EXCLUDED.ai_cost_usd,
                avg_conversation_duration = EXCLUDED.avg_conversation_duration,
                avg_messages_per_conversation = EXCLUDED.avg_messages_per_conversation,
                satisfaction_avg = EXCLUDED.satisfaction_avg,
                satisfaction_count = EXCLUDED.satisfaction_count,
                flows_started = EXCLUDED.flows_started,
                flows_completed = EXCLUDED.flows_completed,
                welcomes_sent = EXCLUDED.welcomes_sent,
                errors_count = EXCLUDED.errors_count,
                updated_at = NOW();
                
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================

-- Datos de ejemplo para ai_configurations
INSERT INTO ai_configurations (tenant_id, chatbot_id, provider, model, system_prompt, created_by) VALUES
(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'openai',
    'gpt-3.5-turbo',
    'Eres un asistente virtual amigable y profesional. Ayudas a los usuarios con sus consultas de manera clara y concisa. Siempre mantén un tono cordial y ofrece ayuda adicional cuando sea apropiado.',
    '00000000-0000-0000-0000-000000000001'
);

-- Datos de ejemplo para conversaciones
INSERT INTO conversations (tenant_id, chatbot_id, user_phone, user_name, session_id, status, message_count, created_by) VALUES
(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '+1234567890',
    'Usuario Demo',
    'session_demo_001',
    'completed',
    5,
    '00000000-0000-0000-0000-000000000001'
);

-- =====================================================

COMMIT;