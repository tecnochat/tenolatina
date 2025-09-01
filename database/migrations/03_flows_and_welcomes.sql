-- =====================================================
-- MIGRACIÓN 03: FLOWS Y WELCOMES
-- Tablas para gestión de flujos y mensajes de bienvenida
-- =====================================================

-- Tabla: flows
-- Gestiona los flujos de conversación de los chatbots
CREATE TABLE IF NOT EXISTS flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
    chatbot_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    trigger_keywords TEXT[], -- Array de palabras clave que activan el flujo
    trigger_conditions JSONB DEFAULT '{}', -- Condiciones adicionales para activar el flujo
    flow_data JSONB NOT NULL DEFAULT '{}', -- Estructura del flujo (nodos, conexiones, etc.)
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0, -- Prioridad del flujo (mayor número = mayor prioridad)
    category VARCHAR(50) DEFAULT 'general', -- Categoría del flujo
    tags TEXT[], -- Tags para organización
    usage_count INTEGER DEFAULT 0, -- Contador de veces que se ha usado
    success_rate DECIMAL(5,2) DEFAULT 0.00, -- Tasa de éxito del flujo
    created_by UUID NOT NULL,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT flows_name_length CHECK (LENGTH(name) >= 2),
    CONSTRAINT flows_priority_range CHECK (priority >= 0 AND priority <= 100),
    CONSTRAINT flows_success_rate_range CHECK (success_rate >= 0 AND success_rate <= 100)
);

-- Índices para flows
CREATE INDEX idx_flows_tenant_id ON flows(tenant_id);
CREATE INDEX idx_flows_chatbot_id ON flows(chatbot_id);
CREATE INDEX idx_flows_is_active ON flows(is_active);
CREATE INDEX idx_flows_priority ON flows(priority DESC);
CREATE INDEX idx_flows_category ON flows(category);
CREATE INDEX idx_flows_trigger_keywords ON flows USING GIN(trigger_keywords);
CREATE INDEX idx_flows_tags ON flows USING GIN(tags);
CREATE INDEX idx_flows_created_at ON flows(created_at DESC);

-- RLS para flows
ALTER TABLE flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flows_tenant_isolation" ON flows
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY "flows_select_policy" ON flows
    FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY "flows_insert_policy" ON flows
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY "flows_update_policy" ON flows
    FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY "flows_delete_policy" ON flows
    FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =====================================================

-- Tabla: welcomes
-- Gestiona los mensajes de bienvenida de los chatbots
CREATE TABLE IF NOT EXISTS welcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
    chatbot_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'audio', 'document', 'template')),
    content JSONB NOT NULL DEFAULT '{}', -- Contenido del mensaje (texto, media, etc.)
    conditions JSONB DEFAULT '{}', -- Condiciones para mostrar este welcome
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0, -- Prioridad del mensaje de bienvenida
    schedule JSONB DEFAULT '{}', -- Programación del mensaje (horarios, días, etc.)
    personalization JSONB DEFAULT '{}', -- Configuración de personalización
    usage_count INTEGER DEFAULT 0, -- Contador de veces que se ha usado
    success_rate DECIMAL(5,2) DEFAULT 0.00, -- Tasa de éxito del welcome
    created_by UUID NOT NULL,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT welcomes_name_length CHECK (LENGTH(name) >= 2),
    CONSTRAINT welcomes_priority_range CHECK (priority >= 0 AND priority <= 100),
    CONSTRAINT welcomes_success_rate_range CHECK (success_rate >= 0 AND success_rate <= 100)
);

-- Índices para welcomes
CREATE INDEX idx_welcomes_tenant_id ON welcomes(tenant_id);
CREATE INDEX idx_welcomes_chatbot_id ON welcomes(chatbot_id);
CREATE INDEX idx_welcomes_is_active ON welcomes(is_active);
CREATE INDEX idx_welcomes_priority ON welcomes(priority DESC);
CREATE INDEX idx_welcomes_message_type ON welcomes(message_type);
CREATE INDEX idx_welcomes_created_at ON welcomes(created_at DESC);

-- RLS para welcomes
ALTER TABLE welcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "welcomes_tenant_isolation" ON welcomes
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY "welcomes_select_policy" ON welcomes
    FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY "welcomes_insert_policy" ON welcomes
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY "welcomes_update_policy" ON welcomes
    FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY "welcomes_delete_policy" ON welcomes
    FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =====================================================

-- Tabla: flow_executions
-- Registra las ejecuciones de flujos para analytics
CREATE TABLE IF NOT EXISTS flow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
    flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    chatbot_id UUID NOT NULL,
    user_phone VARCHAR(20) NOT NULL,
    session_id VARCHAR(100),
    status VARCHAR(20) DEFAULT 'started' CHECK (status IN ('started', 'in_progress', 'completed', 'failed', 'abandoned')),
    current_step VARCHAR(100), -- Paso actual del flujo
    steps_completed INTEGER DEFAULT 0,
    total_steps INTEGER DEFAULT 0,
    execution_data JSONB DEFAULT '{}', -- Datos de la ejecución
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    
    -- Constraints
    CONSTRAINT flow_executions_steps_positive CHECK (steps_completed >= 0 AND total_steps >= 0),
    CONSTRAINT flow_executions_duration_positive CHECK (duration_seconds IS NULL OR duration_seconds >= 0)
);

-- Índices para flow_executions
CREATE INDEX idx_flow_executions_tenant_id ON flow_executions(tenant_id);
CREATE INDEX idx_flow_executions_flow_id ON flow_executions(flow_id);
CREATE INDEX idx_flow_executions_chatbot_id ON flow_executions(chatbot_id);
CREATE INDEX idx_flow_executions_status ON flow_executions(status);
CREATE INDEX idx_flow_executions_user_phone ON flow_executions(user_phone);
CREATE INDEX idx_flow_executions_started_at ON flow_executions(started_at DESC);

-- RLS para flow_executions
ALTER TABLE flow_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flow_executions_tenant_isolation" ON flow_executions
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =====================================================

-- Tabla: welcome_interactions
-- Registra las interacciones con mensajes de bienvenida
CREATE TABLE IF NOT EXISTS welcome_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
    welcome_id UUID NOT NULL REFERENCES welcomes(id) ON DELETE CASCADE,
    chatbot_id UUID NOT NULL,
    user_phone VARCHAR(20) NOT NULL,
    session_id VARCHAR(100),
    interaction_type VARCHAR(20) DEFAULT 'sent' CHECK (interaction_type IN ('sent', 'delivered', 'read', 'replied', 'ignored')),
    response_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para welcome_interactions
CREATE INDEX idx_welcome_interactions_tenant_id ON welcome_interactions(tenant_id);
CREATE INDEX idx_welcome_interactions_welcome_id ON welcome_interactions(welcome_id);
CREATE INDEX idx_welcome_interactions_chatbot_id ON welcome_interactions(chatbot_id);
CREATE INDEX idx_welcome_interactions_user_phone ON welcome_interactions(user_phone);
CREATE INDEX idx_welcome_interactions_created_at ON welcome_interactions(created_at DESC);

-- RLS para welcome_interactions
ALTER TABLE welcome_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "welcome_interactions_tenant_isolation" ON welcome_interactions
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =====================================================

-- Funciones para actualizar contadores automáticamente

-- Función para actualizar usage_count en flows
CREATE OR REPLACE FUNCTION update_flow_usage_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE flows 
        SET usage_count = usage_count + 1,
            updated_at = NOW()
        WHERE id = NEW.flow_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar usage_count en flows
CREATE TRIGGER trigger_update_flow_usage_count
    AFTER INSERT ON flow_executions
    FOR EACH ROW
    EXECUTE FUNCTION update_flow_usage_count();

-- Función para actualizar usage_count en welcomes
CREATE OR REPLACE FUNCTION update_welcome_usage_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.interaction_type = 'sent' THEN
        UPDATE welcomes 
        SET usage_count = usage_count + 1,
            updated_at = NOW()
        WHERE id = NEW.welcome_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar usage_count en welcomes
CREATE TRIGGER trigger_update_welcome_usage_count
    AFTER INSERT ON welcome_interactions
    FOR EACH ROW
    EXECUTE FUNCTION update_welcome_usage_count();

-- =====================================================

-- Función para calcular success_rate de flows
CREATE OR REPLACE FUNCTION calculate_flow_success_rate(flow_uuid UUID)
RETURNS DECIMAL AS $$
DECLARE
    total_executions INTEGER;
    completed_executions INTEGER;
    success_rate DECIMAL(5,2);
BEGIN
    -- Contar total de ejecuciones
    SELECT COUNT(*) INTO total_executions
    FROM flow_executions
    WHERE flow_id = flow_uuid;
    
    -- Contar ejecuciones completadas
    SELECT COUNT(*) INTO completed_executions
    FROM flow_executions
    WHERE flow_id = flow_uuid AND status = 'completed';
    
    -- Calcular tasa de éxito
    IF total_executions > 0 THEN
        success_rate := (completed_executions::DECIMAL / total_executions::DECIMAL) * 100;
    ELSE
        success_rate := 0;
    END IF;
    
    -- Actualizar en la tabla flows
    UPDATE flows
    SET success_rate = success_rate,
        updated_at = NOW()
    WHERE id = flow_uuid;
    
    RETURN success_rate;
END;
$$ LANGUAGE plpgsql;

-- =====================================================

-- Función para calcular success_rate de welcomes
CREATE OR REPLACE FUNCTION calculate_welcome_success_rate(welcome_uuid UUID)
RETURNS DECIMAL AS $$
DECLARE
    total_sent INTEGER;
    total_replied INTEGER;
    success_rate DECIMAL(5,2);
BEGIN
    -- Contar total de mensajes enviados
    SELECT COUNT(*) INTO total_sent
    FROM welcome_interactions
    WHERE welcome_id = welcome_uuid AND interaction_type = 'sent';
    
    -- Contar total de respuestas
    SELECT COUNT(*) INTO total_replied
    FROM welcome_interactions
    WHERE welcome_id = welcome_uuid AND interaction_type = 'replied';
    
    -- Calcular tasa de éxito
    IF total_sent > 0 THEN
        success_rate := (total_replied::DECIMAL / total_sent::DECIMAL) * 100;
    ELSE
        success_rate := 0;
    END IF;
    
    -- Actualizar en la tabla welcomes
    UPDATE welcomes
    SET success_rate = success_rate,
        updated_at = NOW()
    WHERE id = welcome_uuid;
    
    RETURN success_rate;
END;
$$ LANGUAGE plpgsql;

-- =====================================================

-- Datos de ejemplo para flows
INSERT INTO flows (tenant_id, chatbot_id, name, description, trigger_keywords, flow_data, category, created_by) VALUES
(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Flujo de Bienvenida',
    'Flujo principal para dar la bienvenida a nuevos usuarios',
    ARRAY['hola', 'inicio', 'empezar', 'comenzar'],
    '{
        "nodes": [
            {
                "id": "start",
                "type": "message",
                "content": "¡Hola! Bienvenido a nuestro servicio. ¿En qué puedo ayudarte?",
                "options": ["Información", "Soporte", "Ventas"]
            }
        ]
    }',
    'onboarding',
    '00000000-0000-0000-0000-000000000001'
),
(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Soporte Técnico',
    'Flujo para atención de soporte técnico',
    ARRAY['soporte', 'ayuda', 'problema', 'error'],
    '{
        "nodes": [
            {
                "id": "support_start",
                "type": "message",
                "content": "Entiendo que necesitas soporte. ¿Podrías describir tu problema?"
            }
        ]
    }',
    'support',
    '00000000-0000-0000-0000-000000000001'
);

-- Datos de ejemplo para welcomes
INSERT INTO welcomes (tenant_id, chatbot_id, name, message_type, content, created_by) VALUES
(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Bienvenida Principal',
    'text',
    '{
        "text": "¡Hola! 👋 Bienvenido a nuestro chatbot. Estoy aquí para ayudarte. Escribe *menu* para ver las opciones disponibles.",
        "formatting": {
            "bold": ["menu"],
            "emoji": true
        }
    }',
    '00000000-0000-0000-0000-000000000001'
),
(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Bienvenida Horario Comercial',
    'text',
    '{
        "text": "¡Hola! Gracias por contactarnos. Nuestro horario de atención es de Lunes a Viernes de 9:00 AM a 6:00 PM. ¿En qué puedo ayudarte?",
        "conditions": {
            "business_hours": true
        }
    }',
    '00000000-0000-0000-0000-000000000001'
);

-- =====================================================

COMMIT;