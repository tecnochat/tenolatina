-- =====================================================
-- MIGRACIÓN 06: TEAM Y ADMINISTRACIÓN
-- Tablas para gestión de equipos y administración del sistema
-- =====================================================

-- Tabla: team_invitations
-- Invitaciones pendientes para unirse a equipos
CREATE TABLE IF NOT EXISTS team_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    permissions TEXT[] DEFAULT ARRAY[]::TEXT[],
    invited_by UUID NOT NULL,
    invitation_token VARCHAR(500) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
    accepted_at TIMESTAMP WITH TIME ZONE,
    accepted_by UUID,
    message TEXT, -- Mensaje personalizado de invitación
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT team_invitations_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT team_invitations_expires_future CHECK (expires_at > created_at)
);

-- Índices para team_invitations
CREATE INDEX idx_team_invitations_tenant_id ON team_invitations(tenant_id);
CREATE INDEX idx_team_invitations_email ON team_invitations(email);
CREATE INDEX idx_team_invitations_status ON team_invitations(status);
CREATE INDEX idx_team_invitations_expires_at ON team_invitations(expires_at);
CREATE INDEX idx_team_invitations_invited_by ON team_invitations(invited_by);
CREATE UNIQUE INDEX idx_team_invitations_tenant_email_pending ON team_invitations(tenant_id, email) 
    WHERE status = 'pending';

-- RLS para team_invitations
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_invitations_tenant_isolation" ON team_invitations
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =====================================================

-- Tabla: system_settings
-- Configuraciones globales del sistema
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(100) NOT NULL,
    key VARCHAR(200) NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    data_type VARCHAR(20) DEFAULT 'string' CHECK (data_type IN ('string', 'number', 'boolean', 'json', 'array')),
    is_public BOOLEAN DEFAULT false, -- Si es visible en endpoints públicos
    is_editable BOOLEAN DEFAULT true, -- Si puede ser editado via API
    validation_rules JSONB DEFAULT '{}', -- Reglas de validación
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT system_settings_category_key_unique UNIQUE (category, key)
);

-- Índices para system_settings
CREATE INDEX idx_system_settings_category ON system_settings(category);
CREATE INDEX idx_system_settings_key ON system_settings(key);
CREATE INDEX idx_system_settings_is_public ON system_settings(is_public);
CREATE INDEX idx_system_settings_is_editable ON system_settings(is_editable);

-- =====================================================

-- Tabla: feature_flags
-- Flags de características para A/B testing y rollouts graduales
CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL UNIQUE,
    description TEXT,
    is_enabled BOOLEAN DEFAULT false,
    rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
    target_audience JSONB DEFAULT '{}', -- Criterios de audiencia objetivo
    conditions JSONB DEFAULT '{}', -- Condiciones para activar la feature
    metadata JSONB DEFAULT '{}',
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT feature_flags_name_format CHECK (name ~* '^[a-z0-9_-]+$')
);

-- Índices para feature_flags
CREATE INDEX idx_feature_flags_name ON feature_flags(name);
CREATE INDEX idx_feature_flags_is_enabled ON feature_flags(is_enabled);
CREATE INDEX idx_feature_flags_rollout_percentage ON feature_flags(rollout_percentage);

-- =====================================================

-- Tabla: tenant_feature_flags
-- Flags de características específicas por tenant
CREATE TABLE IF NOT EXISTS tenant_feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
    feature_flag_id UUID NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
    is_enabled BOOLEAN NOT NULL,
    override_reason TEXT, -- Razón del override
    expires_at TIMESTAMP WITH TIME ZONE, -- Expiración del override
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT tenant_feature_flags_unique UNIQUE (tenant_id, feature_flag_id)
);

-- Índices para tenant_feature_flags
CREATE INDEX idx_tenant_feature_flags_tenant_id ON tenant_feature_flags(tenant_id);
CREATE INDEX idx_tenant_feature_flags_feature_flag_id ON tenant_feature_flags(feature_flag_id);
CREATE INDEX idx_tenant_feature_flags_is_enabled ON tenant_feature_flags(is_enabled);
CREATE INDEX idx_tenant_feature_flags_expires_at ON tenant_feature_flags(expires_at);

-- RLS para tenant_feature_flags
ALTER TABLE tenant_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_feature_flags_tenant_isolation" ON tenant_feature_flags
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =====================================================

-- Tabla: maintenance_windows
-- Ventanas de mantenimiento programadas
CREATE TABLE IF NOT EXISTS maintenance_windows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    maintenance_type VARCHAR(50) DEFAULT 'scheduled' CHECK (maintenance_type IN ('scheduled', 'emergency', 'security')),
    severity VARCHAR(20) DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    affected_services TEXT[] DEFAULT ARRAY[]::TEXT[], -- Servicios afectados
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    estimated_duration_minutes INTEGER,
    actual_start_time TIMESTAMP WITH TIME ZONE,
    actual_end_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'extended')),
    notification_sent BOOLEAN DEFAULT false,
    notification_channels TEXT[] DEFAULT ARRAY['email', 'dashboard'], -- Canales de notificación
    created_by UUID NOT NULL,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT maintenance_windows_time_order CHECK (end_time > start_time),
    CONSTRAINT maintenance_windows_title_length CHECK (LENGTH(title) >= 5)
);

-- Índices para maintenance_windows
CREATE INDEX idx_maintenance_windows_start_time ON maintenance_windows(start_time);
CREATE INDEX idx_maintenance_windows_end_time ON maintenance_windows(end_time);
CREATE INDEX idx_maintenance_windows_status ON maintenance_windows(status);
CREATE INDEX idx_maintenance_windows_severity ON maintenance_windows(severity);
CREATE INDEX idx_maintenance_windows_type ON maintenance_windows(maintenance_type);

-- =====================================================

-- Tabla: system_health_checks
-- Checks de salud del sistema
CREATE TABLE IF NOT EXISTS system_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(100) NOT NULL,
    check_type VARCHAR(50) NOT NULL, -- database, api, external_service, etc.
    status VARCHAR(20) NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
    response_time_ms INTEGER,
    error_message TEXT,
    details JSONB DEFAULT '{}',
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT system_health_checks_response_time_positive CHECK (response_time_ms IS NULL OR response_time_ms >= 0)
);

-- Índices para system_health_checks
CREATE INDEX idx_system_health_checks_service_name ON system_health_checks(service_name);
CREATE INDEX idx_system_health_checks_check_type ON system_health_checks(check_type);
CREATE INDEX idx_system_health_checks_status ON system_health_checks(status);
CREATE INDEX idx_system_health_checks_checked_at ON system_health_checks(checked_at DESC);

-- =====================================================

-- Tabla: api_keys
-- Claves de API para acceso programático
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    key_hash VARCHAR(500) NOT NULL UNIQUE, -- Hash de la clave
    key_prefix VARCHAR(20) NOT NULL, -- Prefijo visible de la clave
    permissions TEXT[] DEFAULT ARRAY[]::TEXT[], -- Permisos específicos
    scopes TEXT[] DEFAULT ARRAY[]::TEXT[], -- Alcances permitidos
    rate_limit_per_minute INTEGER DEFAULT 60,
    rate_limit_per_hour INTEGER DEFAULT 1000,
    rate_limit_per_day INTEGER DEFAULT 10000,
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP WITH TIME ZONE,
    last_used_ip INET,
    usage_count INTEGER DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_by UUID NOT NULL,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT api_keys_name_length CHECK (LENGTH(name) >= 3),
    CONSTRAINT api_keys_rate_limits_positive CHECK (
        rate_limit_per_minute > 0 AND 
        rate_limit_per_hour > 0 AND 
        rate_limit_per_day > 0
    )
);

-- Índices para api_keys
CREATE INDEX idx_api_keys_tenant_id ON api_keys(tenant_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_key_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_is_active ON api_keys(is_active);
CREATE INDEX idx_api_keys_expires_at ON api_keys(expires_at);
CREATE INDEX idx_api_keys_last_used_at ON api_keys(last_used_at DESC);

-- RLS para api_keys
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_tenant_isolation" ON api_keys
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =====================================================

-- Tabla: rate_limits
-- Límites de velocidad dinámicos
CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenant_profiles(id) ON DELETE CASCADE,
    user_id UUID,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
    identifier VARCHAR(200) NOT NULL, -- IP, user_id, api_key, etc.
    resource VARCHAR(100) NOT NULL, -- Recurso limitado
    limit_type VARCHAR(50) NOT NULL, -- minute, hour, day, month
    max_requests INTEGER NOT NULL,
    current_requests INTEGER DEFAULT 0,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    window_end TIMESTAMP WITH TIME ZONE NOT NULL,
    reset_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT rate_limits_max_requests_positive CHECK (max_requests > 0),
    CONSTRAINT rate_limits_current_requests_non_negative CHECK (current_requests >= 0),
    CONSTRAINT rate_limits_window_order CHECK (window_end > window_start),
    CONSTRAINT rate_limits_unique_window UNIQUE (identifier, resource, limit_type, window_start)
);

-- Índices para rate_limits
CREATE INDEX idx_rate_limits_tenant_id ON rate_limits(tenant_id);
CREATE INDEX idx_rate_limits_user_id ON rate_limits(user_id);
CREATE INDEX idx_rate_limits_api_key_id ON rate_limits(api_key_id);
CREATE INDEX idx_rate_limits_identifier ON rate_limits(identifier);
CREATE INDEX idx_rate_limits_resource ON rate_limits(resource);
CREATE INDEX idx_rate_limits_reset_at ON rate_limits(reset_at);
CREATE INDEX idx_rate_limits_window_end ON rate_limits(window_end);

-- RLS para rate_limits
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_limits_tenant_isolation" ON rate_limits
    FOR ALL USING (tenant_id IS NULL OR tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =====================================================

-- Funciones para gestión de invitaciones

-- Función para crear invitación de equipo
CREATE OR REPLACE FUNCTION create_team_invitation(
    p_tenant_id UUID,
    p_email VARCHAR,
    p_role VARCHAR,
    p_permissions TEXT[],
    p_invited_by UUID,
    p_message TEXT DEFAULT NULL,
    p_expires_hours INTEGER DEFAULT 168 -- 7 días por defecto
)
RETURNS UUID AS $$
DECLARE
    invitation_id UUID;
    invitation_token VARCHAR;
BEGIN
    -- Generar token único
    invitation_token := encode(gen_random_bytes(32), 'base64');
    
    -- Crear invitación
    INSERT INTO team_invitations (
        tenant_id,
        email,
        role,
        permissions,
        invited_by,
        invitation_token,
        expires_at,
        message
    ) VALUES (
        p_tenant_id,
        p_email,
        p_role,
        p_permissions,
        p_invited_by,
        invitation_token,
        NOW() + INTERVAL '1 hour' * p_expires_hours,
        p_message
    ) RETURNING id INTO invitation_id;
    
    RETURN invitation_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================

-- Función para verificar feature flag
CREATE OR REPLACE FUNCTION is_feature_enabled(
    p_feature_name VARCHAR,
    p_tenant_id UUID DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    global_flag RECORD;
    tenant_override RECORD;
    user_hash INTEGER;
    rollout_enabled BOOLEAN := false;
BEGIN
    -- Obtener flag global
    SELECT * INTO global_flag FROM feature_flags WHERE name = p_feature_name;
    
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- Verificar override por tenant
    IF p_tenant_id IS NOT NULL THEN
        SELECT tff.* INTO tenant_override 
        FROM tenant_feature_flags tff
        JOIN feature_flags ff ON tff.feature_flag_id = ff.id
        WHERE ff.name = p_feature_name 
        AND tff.tenant_id = p_tenant_id
        AND (tff.expires_at IS NULL OR tff.expires_at > NOW());
        
        IF FOUND THEN
            RETURN tenant_override.is_enabled;
        END IF;
    END IF;
    
    -- Si el flag global está deshabilitado, retornar false
    IF NOT global_flag.is_enabled THEN
        RETURN false;
    END IF;
    
    -- Verificar rollout percentage
    IF global_flag.rollout_percentage = 100 THEN
        RETURN true;
    ELSIF global_flag.rollout_percentage = 0 THEN
        RETURN false;
    ELSE
        -- Usar hash del tenant_id o user_id para determinar si está en el rollout
        IF p_tenant_id IS NOT NULL THEN
            user_hash := abs(hashtext(p_tenant_id::text)) % 100;
        ELSIF p_user_id IS NOT NULL THEN
            user_hash := abs(hashtext(p_user_id::text)) % 100;
        ELSE
            user_hash := abs(hashtext(random()::text)) % 100;
        END IF;
        
        RETURN user_hash < global_flag.rollout_percentage;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================

-- Función para generar API key
CREATE OR REPLACE FUNCTION generate_api_key(
    p_tenant_id UUID,
    p_name VARCHAR,
    p_permissions TEXT[],
    p_scopes TEXT[],
    p_created_by UUID,
    p_expires_days INTEGER DEFAULT NULL
)
RETURNS TABLE(api_key_id UUID, api_key VARCHAR) AS $$
DECLARE
    key_id UUID;
    raw_key VARCHAR;
    key_hash VARCHAR;
    key_prefix VARCHAR;
BEGIN
    -- Generar clave aleatoria
    raw_key := 'tk_' || encode(gen_random_bytes(32), 'base64');
    key_prefix := substring(raw_key from 1 for 12) || '...';
    key_hash := encode(digest(raw_key, 'sha256'), 'hex');
    
    -- Insertar en base de datos
    INSERT INTO api_keys (
        tenant_id,
        name,
        key_hash,
        key_prefix,
        permissions,
        scopes,
        expires_at,
        created_by
    ) VALUES (
        p_tenant_id,
        p_name,
        key_hash,
        key_prefix,
        p_permissions,
        p_scopes,
        CASE WHEN p_expires_days IS NOT NULL THEN NOW() + INTERVAL '1 day' * p_expires_days ELSE NULL END,
        p_created_by
    ) RETURNING id INTO key_id;
    
    RETURN QUERY SELECT key_id, raw_key;
END;
$$ LANGUAGE plpgsql;

-- =====================================================

-- Función para verificar rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_identifier VARCHAR,
    p_resource VARCHAR,
    p_limit_type VARCHAR,
    p_max_requests INTEGER,
    p_tenant_id UUID DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_api_key_id UUID DEFAULT NULL
)
RETURNS TABLE(allowed BOOLEAN, remaining INTEGER, reset_at TIMESTAMP WITH TIME ZONE) AS $$
DECLARE
    window_duration INTERVAL;
    window_start_time TIMESTAMP WITH TIME ZONE;
    window_end_time TIMESTAMP WITH TIME ZONE;
    reset_time TIMESTAMP WITH TIME ZONE;
    current_count INTEGER;
    rate_limit_record RECORD;
BEGIN
    -- Determinar duración de ventana
    CASE p_limit_type
        WHEN 'minute' THEN 
            window_duration := INTERVAL '1 minute';
            window_start_time := date_trunc('minute', NOW());
        WHEN 'hour' THEN 
            window_duration := INTERVAL '1 hour';
            window_start_time := date_trunc('hour', NOW());
        WHEN 'day' THEN 
            window_duration := INTERVAL '1 day';
            window_start_time := date_trunc('day', NOW());
        WHEN 'month' THEN 
            window_duration := INTERVAL '1 month';
            window_start_time := date_trunc('month', NOW());
        ELSE
            RAISE EXCEPTION 'Invalid limit_type: %', p_limit_type;
    END CASE;
    
    window_end_time := window_start_time + window_duration;
    reset_time := window_end_time;
    
    -- Buscar registro existente
    SELECT * INTO rate_limit_record
    FROM rate_limits
    WHERE identifier = p_identifier
    AND resource = p_resource
    AND limit_type = p_limit_type
    AND window_start = window_start_time;
    
    IF FOUND THEN
        current_count := rate_limit_record.current_requests;
        
        -- Verificar si se excede el límite
        IF current_count >= p_max_requests THEN
            RETURN QUERY SELECT false, 0, reset_time;
            RETURN;
        END IF;
        
        -- Incrementar contador
        UPDATE rate_limits
        SET current_requests = current_requests + 1,
            updated_at = NOW()
        WHERE id = rate_limit_record.id;
        
        RETURN QUERY SELECT true, p_max_requests - current_count - 1, reset_time;
    ELSE
        -- Crear nuevo registro
        INSERT INTO rate_limits (
            tenant_id,
            user_id,
            api_key_id,
            identifier,
            resource,
            limit_type,
            max_requests,
            current_requests,
            window_start,
            window_end,
            reset_at
        ) VALUES (
            p_tenant_id,
            p_user_id,
            p_api_key_id,
            p_identifier,
            p_resource,
            p_limit_type,
            p_max_requests,
            1,
            window_start_time,
            window_end_time,
            reset_time
        );
        
        RETURN QUERY SELECT true, p_max_requests - 1, reset_time;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================

-- Función para limpiar rate limits expirados
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM rate_limits WHERE window_end < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================

-- Datos de ejemplo

-- System settings
INSERT INTO system_settings (category, key, value, description, data_type, is_public) VALUES
('general', 'app_name', '"TecnoBot SAAS"', 'Nombre de la aplicación', 'string', true),
('general', 'app_version', '"1.0.0"', 'Versión de la aplicación', 'string', true),
('general', 'maintenance_mode', 'false', 'Modo de mantenimiento', 'boolean', true),
('limits', 'max_chatbots_per_tenant', '10', 'Máximo de chatbots por tenant', 'number', false),
('limits', 'max_team_members', '50', 'Máximo de miembros por equipo', 'number', false),
('api', 'rate_limit_per_minute', '60', 'Límite de requests por minuto', 'number', false),
('features', 'ai_enabled', 'true', 'IA habilitada', 'boolean', false),
('features', 'webhooks_enabled', 'true', 'Webhooks habilitados', 'boolean', false);

-- Feature flags
INSERT INTO feature_flags (name, description, is_enabled, rollout_percentage) VALUES
('advanced_analytics', 'Analytics avanzados', true, 100),
('ai_gpt4', 'Acceso a GPT-4', true, 50),
('custom_integrations', 'Integraciones personalizadas', false, 0),
('white_label', 'Marca blanca', false, 10),
('advanced_flows', 'Flujos avanzados', true, 75);

-- =====================================================

COMMIT;