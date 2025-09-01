-- =====================================================
-- MIGRACIÓN 05: WEBHOOKS Y LOGS
-- Tablas para gestión de webhooks y sistema de logging
-- =====================================================

-- Tabla: webhook_configurations
-- Configuraciones de webhooks por tenant
CREATE TABLE IF NOT EXISTS webhook_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    url TEXT NOT NULL,
    method VARCHAR(10) DEFAULT 'POST' CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
    headers JSONB DEFAULT '{}', -- Headers personalizados
    authentication JSONB DEFAULT '{}', -- Configuración de autenticación
    events TEXT[] NOT NULL, -- Eventos que disparan el webhook
    conditions JSONB DEFAULT '{}', -- Condiciones para disparar el webhook
    retry_policy JSONB DEFAULT '{
        "max_retries": 3,
        "retry_delay_seconds": 60,
        "backoff_multiplier": 2
    }',
    timeout_seconds INTEGER DEFAULT 30 CHECK (timeout_seconds > 0 AND timeout_seconds <= 300),
    is_active BOOLEAN DEFAULT true,
    secret_token VARCHAR(255), -- Token secreto para verificar firma
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    created_by UUID NOT NULL,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT webhook_configurations_name_length CHECK (LENGTH(name) >= 2),
    CONSTRAINT webhook_configurations_url_format CHECK (url ~* '^https?://.*'),
    CONSTRAINT webhook_configurations_events_not_empty CHECK (array_length(events, 1) > 0)
);

-- Índices para webhook_configurations
CREATE INDEX idx_webhook_configurations_tenant_id ON webhook_configurations(tenant_id);
CREATE INDEX idx_webhook_configurations_is_active ON webhook_configurations(is_active);
CREATE INDEX idx_webhook_configurations_events ON webhook_configurations USING GIN(events);
CREATE INDEX idx_webhook_configurations_last_triggered ON webhook_configurations(last_triggered_at DESC);

-- RLS para webhook_configurations
ALTER TABLE webhook_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_configurations_tenant_isolation" ON webhook_configurations
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =====================================================

-- Tabla: webhook_deliveries
-- Registro de entregas de webhooks
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
    webhook_config_id UUID NOT NULL REFERENCES webhook_configurations(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    event_id UUID, -- ID del evento que disparó el webhook
    payload JSONB NOT NULL,
    url TEXT NOT NULL,
    method VARCHAR(10) NOT NULL,
    headers JSONB DEFAULT '{}',
    status_code INTEGER,
    response_body TEXT,
    response_headers JSONB DEFAULT '{}',
    duration_ms INTEGER, -- Duración de la petición en milisegundos
    attempt_number INTEGER DEFAULT 1,
    max_attempts INTEGER DEFAULT 1,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
    error_message TEXT,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    delivered_at TIMESTAMP WITH TIME ZONE
);

-- Índices para webhook_deliveries
CREATE INDEX idx_webhook_deliveries_tenant_id ON webhook_deliveries(tenant_id);
CREATE INDEX idx_webhook_deliveries_webhook_config_id ON webhook_deliveries(webhook_config_id);
CREATE INDEX idx_webhook_deliveries_event_type ON webhook_deliveries(event_type);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_created_at ON webhook_deliveries(created_at DESC);
CREATE INDEX idx_webhook_deliveries_next_retry ON webhook_deliveries(next_retry_at) WHERE next_retry_at IS NOT NULL;

-- RLS para webhook_deliveries
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_deliveries_tenant_isolation" ON webhook_deliveries
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =====================================================

-- Tabla: system_logs
-- Logs del sistema para debugging y auditoría
CREATE TABLE IF NOT EXISTS system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenant_profiles(id) ON DELETE CASCADE, -- NULL para logs del sistema
    level VARCHAR(10) NOT NULL CHECK (level IN ('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL')),
    category VARCHAR(50) DEFAULT 'general', -- Categoría del log
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}', -- Detalles adicionales
    source VARCHAR(100), -- Fuente del log (archivo, función, etc.)
    user_id UUID, -- Usuario relacionado (si aplica)
    session_id VARCHAR(100), -- Sesión relacionada (si aplica)
    request_id VARCHAR(100), -- ID de request (si aplica)
    ip_address INET, -- Dirección IP
    user_agent TEXT, -- User agent
    stack_trace TEXT, -- Stack trace para errores
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para system_logs
CREATE INDEX idx_system_logs_tenant_id ON system_logs(tenant_id);
CREATE INDEX idx_system_logs_level ON system_logs(level);
CREATE INDEX idx_system_logs_category ON system_logs(category);
CREATE INDEX idx_system_logs_created_at ON system_logs(created_at DESC);
CREATE INDEX idx_system_logs_user_id ON system_logs(user_id);
CREATE INDEX idx_system_logs_session_id ON system_logs(session_id);
CREATE INDEX idx_system_logs_request_id ON system_logs(request_id);

-- RLS para system_logs
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_logs_tenant_isolation" ON system_logs
    FOR ALL USING (tenant_id IS NULL OR tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =====================================================

-- Tabla: audit_logs
-- Logs de auditoría para acciones importantes
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    action VARCHAR(100) NOT NULL, -- Acción realizada
    resource_type VARCHAR(50) NOT NULL, -- Tipo de recurso afectado
    resource_id UUID, -- ID del recurso afectado
    old_values JSONB, -- Valores anteriores (para updates)
    new_values JSONB, -- Valores nuevos (para inserts/updates)
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(100),
    request_id VARCHAR(100),
    metadata JSONB DEFAULT '{}', -- Metadatos adicionales
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para audit_logs
CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX idx_audit_logs_resource_id ON audit_logs(resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- RLS para audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_tenant_isolation" ON audit_logs
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =====================================================

-- Tabla: api_usage_logs
-- Logs de uso de API para rate limiting y analytics
CREATE TABLE IF NOT EXISTS api_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenant_profiles(id) ON DELETE CASCADE,
    user_id UUID,
    api_key_id UUID, -- Si se usa API key
    endpoint VARCHAR(200) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER,
    request_size_bytes INTEGER,
    response_size_bytes INTEGER,
    ip_address INET,
    user_agent TEXT,
    rate_limit_key VARCHAR(100), -- Clave para rate limiting
    rate_limit_remaining INTEGER, -- Requests restantes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para api_usage_logs
CREATE INDEX idx_api_usage_logs_tenant_id ON api_usage_logs(tenant_id);
CREATE INDEX idx_api_usage_logs_user_id ON api_usage_logs(user_id);
CREATE INDEX idx_api_usage_logs_endpoint ON api_usage_logs(endpoint);
CREATE INDEX idx_api_usage_logs_status_code ON api_usage_logs(status_code);
CREATE INDEX idx_api_usage_logs_created_at ON api_usage_logs(created_at DESC);
CREATE INDEX idx_api_usage_logs_rate_limit_key ON api_usage_logs(rate_limit_key);

-- RLS para api_usage_logs
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_usage_logs_tenant_isolation" ON api_usage_logs
    FOR ALL USING (tenant_id IS NULL OR tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =====================================================

-- Tabla: notification_logs
-- Logs de notificaciones enviadas
CREATE TABLE IF NOT EXISTS notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
    user_id UUID,
    notification_type VARCHAR(50) NOT NULL, -- email, sms, push, webhook
    channel VARCHAR(50) NOT NULL, -- Canal específico (smtp, twilio, etc.)
    recipient VARCHAR(255) NOT NULL, -- Email, teléfono, etc.
    subject VARCHAR(500),
    content TEXT,
    template_id VARCHAR(100), -- ID del template usado
    template_variables JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
    provider_id VARCHAR(100), -- ID del proveedor externo
    provider_response JSONB DEFAULT '{}',
    error_message TEXT,
    cost_usd DECIMAL(10,6) DEFAULT 0.000000,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE
);

-- Índices para notification_logs
CREATE INDEX idx_notification_logs_tenant_id ON notification_logs(tenant_id);
CREATE INDEX idx_notification_logs_user_id ON notification_logs(user_id);
CREATE INDEX idx_notification_logs_type ON notification_logs(notification_type);
CREATE INDEX idx_notification_logs_status ON notification_logs(status);
CREATE INDEX idx_notification_logs_recipient ON notification_logs(recipient);
CREATE INDEX idx_notification_logs_created_at ON notification_logs(created_at DESC);

-- RLS para notification_logs
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_logs_tenant_isolation" ON notification_logs
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =====================================================

-- Funciones para gestión de webhooks

-- Función para disparar webhook
CREATE OR REPLACE FUNCTION trigger_webhook(
    p_tenant_id UUID,
    p_event_type VARCHAR,
    p_event_id UUID,
    p_payload JSONB
)
RETURNS VOID AS $$
DECLARE
    webhook_config RECORD;
BEGIN
    -- Buscar configuraciones de webhook activas para este evento
    FOR webhook_config IN 
        SELECT * FROM webhook_configurations 
        WHERE tenant_id = p_tenant_id 
        AND is_active = true 
        AND p_event_type = ANY(events)
    LOOP
        -- Crear registro de entrega
        INSERT INTO webhook_deliveries (
            tenant_id,
            webhook_config_id,
            event_type,
            event_id,
            payload,
            url,
            method,
            headers,
            max_attempts
        ) VALUES (
            p_tenant_id,
            webhook_config.id,
            p_event_type,
            p_event_id,
            p_payload,
            webhook_config.url,
            webhook_config.method,
            webhook_config.headers,
            (webhook_config.retry_policy->>'max_retries')::INTEGER + 1
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================

-- Función para logging del sistema
CREATE OR REPLACE FUNCTION log_system_event(
    p_level VARCHAR,
    p_category VARCHAR,
    p_message TEXT,
    p_details JSONB DEFAULT '{}',
    p_tenant_id UUID DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_source VARCHAR DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO system_logs (
        tenant_id,
        level,
        category,
        message,
        details,
        source,
        user_id
    ) VALUES (
        p_tenant_id,
        p_level,
        p_category,
        p_message,
        p_details,
        p_source,
        p_user_id
    ) RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================

-- Función para auditoría
CREATE OR REPLACE FUNCTION log_audit_event(
    p_tenant_id UUID,
    p_user_id UUID,
    p_action VARCHAR,
    p_resource_type VARCHAR,
    p_resource_id UUID DEFAULT NULL,
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    audit_id UUID;
BEGIN
    INSERT INTO audit_logs (
        tenant_id,
        user_id,
        action,
        resource_type,
        resource_id,
        old_values,
        new_values,
        metadata
    ) VALUES (
        p_tenant_id,
        p_user_id,
        p_action,
        p_resource_type,
        p_resource_id,
        p_old_values,
        p_new_values,
        p_metadata
    ) RETURNING id INTO audit_id;
    
    RETURN audit_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================

-- Función para limpiar logs antiguos
CREATE OR REPLACE FUNCTION cleanup_old_logs(
    p_days_to_keep INTEGER DEFAULT 90
)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
    temp_count INTEGER;
BEGIN
    -- Limpiar system_logs
    DELETE FROM system_logs 
    WHERE created_at < NOW() - INTERVAL '1 day' * p_days_to_keep;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Limpiar api_usage_logs
    DELETE FROM api_usage_logs 
    WHERE created_at < NOW() - INTERVAL '1 day' * p_days_to_keep;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Limpiar webhook_deliveries (mantener más tiempo para debugging)
    DELETE FROM webhook_deliveries 
    WHERE created_at < NOW() - INTERVAL '1 day' * (p_days_to_keep * 2);
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Limpiar notification_logs
    DELETE FROM notification_logs 
    WHERE created_at < NOW() - INTERVAL '1 day' * p_days_to_keep;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Los audit_logs se mantienen por más tiempo (no se limpian automáticamente)
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================

-- Triggers para auditoría automática en tablas importantes

-- Función genérica para auditoría automática
CREATE OR REPLACE FUNCTION auto_audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
    tenant_id_val UUID;
    user_id_val UUID;
    action_val VARCHAR;
BEGIN
    -- Obtener tenant_id
    IF TG_OP = 'DELETE' THEN
        tenant_id_val := OLD.tenant_id;
    ELSE
        tenant_id_val := NEW.tenant_id;
    END IF;
    
    -- Obtener user_id del contexto (si está disponible)
    BEGIN
        user_id_val := current_setting('app.current_user_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        user_id_val := NULL;
    END;
    
    -- Determinar acción
    IF TG_OP = 'INSERT' THEN
        action_val := 'CREATE';
        PERFORM log_audit_event(
            tenant_id_val,
            user_id_val,
            action_val,
            TG_TABLE_NAME,
            NEW.id,
            NULL,
            to_jsonb(NEW)
        );
    ELSIF TG_OP = 'UPDATE' THEN
        action_val := 'UPDATE';
        PERFORM log_audit_event(
            tenant_id_val,
            user_id_val,
            action_val,
            TG_TABLE_NAME,
            NEW.id,
            to_jsonb(OLD),
            to_jsonb(NEW)
        );
    ELSIF TG_OP = 'DELETE' THEN
        action_val := 'DELETE';
        PERFORM log_audit_event(
            tenant_id_val,
            user_id_val,
            action_val,
            TG_TABLE_NAME,
            OLD.id,
            to_jsonb(OLD),
            NULL
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Aplicar triggers de auditoría a tablas importantes
CREATE TRIGGER audit_trigger_tenant_profiles
    AFTER INSERT OR UPDATE OR DELETE ON tenant_profiles
    FOR EACH ROW EXECUTE FUNCTION auto_audit_trigger();

CREATE TRIGGER audit_trigger_team_members
    AFTER INSERT OR UPDATE OR DELETE ON team_members
    FOR EACH ROW EXECUTE FUNCTION auto_audit_trigger();

CREATE TRIGGER audit_trigger_flows
    AFTER INSERT OR UPDATE OR DELETE ON flows
    FOR EACH ROW EXECUTE FUNCTION auto_audit_trigger();

CREATE TRIGGER audit_trigger_ai_configurations
    AFTER INSERT OR UPDATE OR DELETE ON ai_configurations
    FOR EACH ROW EXECUTE FUNCTION auto_audit_trigger();

-- =====================================================

-- Datos de ejemplo para webhook_configurations
INSERT INTO webhook_configurations (tenant_id, name, url, events, created_by) VALUES
(
    '00000000-0000-0000-0000-000000000001',
    'Webhook de Mensajes',
    'https://api.example.com/webhooks/messages',
    ARRAY['message_received', 'message_sent'],
    '00000000-0000-0000-0000-000000000001'
),
(
    '00000000-0000-0000-0000-000000000001',
    'Webhook de Conversaciones',
    'https://api.example.com/webhooks/conversations',
    ARRAY['conversation_started', 'conversation_ended'],
    '00000000-0000-0000-0000-000000000001'
);

-- =====================================================

COMMIT;