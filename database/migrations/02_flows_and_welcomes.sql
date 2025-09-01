-- =====================================================
-- MIGRACIÓN 02: FLUJOS Y MENSAJES DE BIENVENIDA
-- =====================================================

-- =====================================================
-- ENUMS ADICIONALES
-- =====================================================
CREATE TYPE flow_type AS ENUM ('welcome', 'menu', 'form', 'ai_chat', 'custom');
CREATE TYPE field_type AS ENUM ('text', 'number', 'email', 'phone', 'date', 'select', 'multiselect', 'boolean');
CREATE TYPE trigger_type AS ENUM ('keyword', 'pattern', 'always', 'condition');

-- =====================================================
-- TABLA: FLOWS (FLUJOS CONVERSACIONALES)
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
    trigger_value TEXT, -- keyword, regex pattern, etc.
    trigger_conditions JSONB DEFAULT '{}',
    
    -- Estructura del flujo
    steps JSONB DEFAULT '[]', -- Array de pasos del flujo
    variables JSONB DEFAULT '{}', -- Variables del flujo
    
    -- Configuración
    settings JSONB DEFAULT '{}',
    
    -- Estado
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0, -- Mayor número = mayor prioridad
    
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

-- Índices para flows
CREATE INDEX IF NOT EXISTS idx_flows_tenant_id ON flows(tenant_id);
CREATE INDEX IF NOT EXISTS idx_flows_chatbot_id ON flows(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_flows_type ON flows(flow_type);
CREATE INDEX IF NOT EXISTS idx_flows_trigger_type ON flows(trigger_type);
CREATE INDEX IF NOT EXISTS idx_flows_active ON flows(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_flows_priority ON flows(priority DESC);
CREATE INDEX IF NOT EXISTS idx_flows_created_at ON flows(created_at);
CREATE INDEX IF NOT EXISTS idx_flows_deleted_at ON flows(deleted_at) WHERE deleted_at IS NULL;

-- =====================================================
-- TABLA: WELCOME_MESSAGES (MENSAJES DE BIENVENIDA)
-- =====================================================
CREATE TABLE IF NOT EXISTS welcome_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
    
    -- Información básica
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Contenido del mensaje
    message_text TEXT NOT NULL,
    media_url TEXT,
    media_type VARCHAR(50), -- image, video, audio, document
    
    -- Configuración de activación
    trigger_conditions JSONB DEFAULT '{}',
    schedule JSONB DEFAULT '{}', -- Horarios específicos
    
    -- Opciones de respuesta rápida
    quick_replies JSONB DEFAULT '[]',
    
    -- Estado
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    
    -- Estadísticas
    sent_count INTEGER DEFAULT 0,
    response_rate DECIMAL(5,2) DEFAULT 0.00,
    
    -- Metadatos
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT valid_media_type CHECK (media_type IN ('image', 'video', 'audio', 'document') OR media_type IS NULL),
    CONSTRAINT valid_priority_welcome CHECK (priority >= 0),
    CONSTRAINT valid_response_rate CHECK (response_rate >= 0 AND response_rate <= 100)
);

-- Índices para welcome_messages
CREATE INDEX IF NOT EXISTS idx_welcome_messages_tenant_id ON welcome_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_welcome_messages_chatbot_id ON welcome_messages(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_welcome_messages_active ON welcome_messages(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_welcome_messages_priority ON welcome_messages(priority DESC);
CREATE INDEX IF NOT EXISTS idx_welcome_messages_created_at ON welcome_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_welcome_messages_deleted_at ON welcome_messages(deleted_at) WHERE deleted_at IS NULL;

-- =====================================================
-- TABLA: FORM_FIELDS (CAMPOS DE FORMULARIOS)
-- =====================================================
CREATE TABLE IF NOT EXISTS form_fields (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    
    -- Información del campo
    name VARCHAR(255) NOT NULL,
    label VARCHAR(255) NOT NULL,
    field_type field_type DEFAULT 'text',
    
    -- Configuración del campo
    is_required BOOLEAN DEFAULT false,
    placeholder TEXT,
    help_text TEXT,
    validation_rules JSONB DEFAULT '{}',
    
    -- Opciones para select/multiselect
    options JSONB DEFAULT '[]',
    
    -- Orden en el formulario
    sort_order INTEGER DEFAULT 0,
    
    -- Estado
    is_active BOOLEAN DEFAULT true,
    
    -- Metadatos
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_sort_order CHECK (sort_order >= 0)
);

-- Índices para form_fields
CREATE INDEX IF NOT EXISTS idx_form_fields_tenant_id ON form_fields(tenant_id);
CREATE INDEX IF NOT EXISTS idx_form_fields_flow_id ON form_fields(flow_id);
CREATE INDEX IF NOT EXISTS idx_form_fields_type ON form_fields(field_type);
CREATE INDEX IF NOT EXISTS idx_form_fields_active ON form_fields(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_form_fields_sort_order ON form_fields(sort_order);

-- =====================================================
-- TABLA: FORM_RESPONSES (RESPUESTAS DE FORMULARIOS)
-- =====================================================
CREATE TABLE IF NOT EXISTS form_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    
    -- Datos de la respuesta
    responses JSONB DEFAULT '{}', -- {field_name: value}
    
    -- Estado
    is_completed BOOLEAN DEFAULT false,
    completion_percentage DECIMAL(5,2) DEFAULT 0.00,
    
    -- Metadatos
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_completion_percentage CHECK (completion_percentage >= 0 AND completion_percentage <= 100)
);

-- Índices para form_responses
CREATE INDEX IF NOT EXISTS idx_form_responses_tenant_id ON form_responses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_form_responses_conversation_id ON form_responses(conversation_id);
CREATE INDEX IF NOT EXISTS idx_form_responses_flow_id ON form_responses(flow_id);
CREATE INDEX IF NOT EXISTS idx_form_responses_completed ON form_responses(is_completed);
CREATE INDEX IF NOT EXISTS idx_form_responses_started_at ON form_responses(started_at);

-- =====================================================
-- TABLA: FLOW_EXECUTIONS (EJECUCIONES DE FLUJOS)
-- =====================================================
CREATE TABLE IF NOT EXISTS flow_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    
    -- Estado de la ejecución
    current_step INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active', -- active, completed, failed, cancelled
    
    -- Datos de la ejecución
    variables JSONB DEFAULT '{}', -- Variables específicas de esta ejecución
    step_history JSONB DEFAULT '[]', -- Historial de pasos ejecutados
    
    -- Metadatos
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_current_step CHECK (current_step >= 0),
    CONSTRAINT valid_execution_status CHECK (status IN ('active', 'completed', 'failed', 'cancelled'))
);

-- Índices para flow_executions
CREATE INDEX IF NOT EXISTS idx_flow_executions_tenant_id ON flow_executions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_flow_executions_conversation_id ON flow_executions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_flow_executions_flow_id ON flow_executions(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_executions_status ON flow_executions(status);
CREATE INDEX IF NOT EXISTS idx_flow_executions_started_at ON flow_executions(started_at);

-- =====================================================
-- TABLA: QUICK_REPLIES (RESPUESTAS RÁPIDAS)
-- =====================================================
CREATE TABLE IF NOT EXISTS quick_replies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
    
    -- Información básica
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Configuración
    trigger_keywords TEXT[], -- Array de palabras clave
    response_text TEXT NOT NULL,
    response_media_url TEXT,
    response_media_type VARCHAR(50),
    
    -- Acciones adicionales
    actions JSONB DEFAULT '{}', -- Acciones a ejecutar después de responder
    
    -- Estado
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    
    -- Estadísticas
    usage_count INTEGER DEFAULT 0,
    
    -- Metadatos
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT valid_response_media_type CHECK (response_media_type IN ('image', 'video', 'audio', 'document') OR response_media_type IS NULL),
    CONSTRAINT valid_priority_quick_reply CHECK (priority >= 0)
);

-- Índices para quick_replies
CREATE INDEX IF NOT EXISTS idx_quick_replies_tenant_id ON quick_replies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quick_replies_chatbot_id ON quick_replies(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_quick_replies_active ON quick_replies(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_quick_replies_priority ON quick_replies(priority DESC);
CREATE INDEX IF NOT EXISTS idx_quick_replies_keywords ON quick_replies USING GIN(trigger_keywords);
CREATE INDEX IF NOT EXISTS idx_quick_replies_created_at ON quick_replies(created_at);
CREATE INDEX IF NOT EXISTS idx_quick_replies_deleted_at ON quick_replies(deleted_at) WHERE deleted_at IS NULL;

-- =====================================================
-- FUNCIONES ADICIONALES
-- =====================================================

-- Función para buscar respuestas rápidas por palabra clave
CREATE OR REPLACE FUNCTION find_quick_reply_by_keyword(
    p_chatbot_id UUID,
    p_message_text TEXT
)
RETURNS TABLE(
    reply_id UUID,
    response_text TEXT,
    response_media_url TEXT,
    response_media_type VARCHAR(50),
    actions JSONB,
    priority INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        qr.id,
        qr.response_text,
        qr.response_media_url,
        qr.response_media_type,
        qr.actions,
        qr.priority
    FROM quick_replies qr
    WHERE qr.chatbot_id = p_chatbot_id
        AND qr.is_active = true
        AND qr.deleted_at IS NULL
        AND (
            -- Buscar coincidencias exactas en keywords
            EXISTS (
                SELECT 1 FROM unnest(qr.trigger_keywords) AS keyword
                WHERE LOWER(p_message_text) LIKE '%' || LOWER(keyword) || '%'
            )
        )
    ORDER BY qr.priority DESC, qr.created_at ASC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener el siguiente paso de un flujo
CREATE OR REPLACE FUNCTION get_next_flow_step(
    p_execution_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_execution RECORD;
    v_flow RECORD;
    v_steps JSONB;
    v_current_step INTEGER;
    v_next_step JSONB;
BEGIN
    -- Obtener la ejecución actual
    SELECT * INTO v_execution
    FROM flow_executions
    WHERE id = p_execution_id AND status = 'active';
    
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    
    -- Obtener el flujo
    SELECT * INTO v_flow
    FROM flows
    WHERE id = v_execution.flow_id AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    
    v_steps := v_flow.steps;
    v_current_step := v_execution.current_step;
    
    -- Verificar si hay más pasos
    IF v_current_step >= jsonb_array_length(v_steps) THEN
        -- Marcar como completado
        UPDATE flow_executions
        SET status = 'completed', completed_at = NOW()
        WHERE id = p_execution_id;
        
        RETURN NULL;
    END IF;
    
    -- Obtener el siguiente paso
    v_next_step := v_steps -> v_current_step;
    
    -- Actualizar el paso actual
    UPDATE flow_executions
    SET current_step = v_current_step + 1,
        updated_at = NOW()
    WHERE id = p_execution_id;
    
    RETURN v_next_step;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS ADICIONALES
-- =====================================================

-- Triggers para updated_at
CREATE TRIGGER update_flows_updated_at BEFORE UPDATE ON flows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_welcome_messages_updated_at BEFORE UPDATE ON welcome_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_form_fields_updated_at BEFORE UPDATE ON form_fields
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_form_responses_updated_at BEFORE UPDATE ON form_responses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_flow_executions_updated_at BEFORE UPDATE ON flow_executions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quick_replies_updated_at BEFORE UPDATE ON quick_replies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- POLÍTICAS RLS ADICIONALES
-- =====================================================

-- Habilitar RLS
ALTER TABLE flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE welcome_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;

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

-- Políticas para welcome_messages
CREATE POLICY "Users can view tenant welcome messages" ON welcome_messages
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "Members can manage tenant welcome messages" ON welcome_messages
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member') AND is_active = true
        )
    );

-- Políticas para form_fields
CREATE POLICY "Users can view tenant form fields" ON form_fields
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "Members can manage tenant form fields" ON form_fields
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member') AND is_active = true
        )
    );

-- Políticas para form_responses
CREATE POLICY "Users can view tenant form responses" ON form_responses
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "System can manage form responses" ON form_responses
    FOR ALL USING (true); -- Para el sistema de chatbot

-- Políticas para flow_executions
CREATE POLICY "Users can view tenant flow executions" ON flow_executions
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "System can manage flow executions" ON flow_executions
    FOR ALL USING (true); -- Para el sistema de chatbot

-- Políticas para quick_replies
CREATE POLICY "Users can view tenant quick replies" ON quick_replies
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "Members can manage tenant quick replies" ON quick_replies
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member') AND is_active = true
        )
    );

-- =====================================================
-- INSERTAR REGISTRO EN MIGRATIONS
-- =====================================================
INSERT INTO migrations (filename, checksum, success) 
VALUES ('02_flows_and_welcomes.sql', 'flows_and_welcomes', true)
ON CONFLICT (filename) DO NOTHING;

-- =====================================================
-- COMENTARIOS
-- =====================================================
COMMENT ON TABLE flows IS 'Flujos conversacionales configurables';
COMMENT ON TABLE welcome_messages IS 'Mensajes de bienvenida personalizados';
COMMENT ON TABLE form_fields IS 'Campos de formularios para recolección de datos';
COMMENT ON TABLE form_responses IS 'Respuestas de usuarios a formularios';
COMMENT ON TABLE flow_executions IS 'Ejecuciones activas de flujos conversacionales';
COMMENT ON TABLE quick_replies IS 'Respuestas rápidas automáticas por palabras clave';