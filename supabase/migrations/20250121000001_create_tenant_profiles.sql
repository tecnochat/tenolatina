-- Migración: Crear tabla de perfiles de tenant para sistema multi-tenant
-- Fecha: 2025-01-21
-- Descripción: Tabla para almacenar información de suscripción y límites por tenant

-- Crear tabla tenant_profiles
CREATE TABLE IF NOT EXISTS public.tenant_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    company VARCHAR(200),
    phone VARCHAR(20),
    
    -- Información de suscripción
    subscription_status VARCHAR(20) DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'cancelled', 'expired')),
    subscription_plan VARCHAR(20) DEFAULT 'basic' CHECK (subscription_plan IN ('basic', 'pro', 'enterprise')),
    subscription_starts_at TIMESTAMPTZ,
    subscription_ends_at TIMESTAMPTZ,
    trial_ends_at TIMESTAMPTZ,
    
    -- Límites por plan
    max_chatbots INTEGER DEFAULT 3,
    max_monthly_messages INTEGER DEFAULT 1000,
    max_whatsapp_sessions INTEGER DEFAULT 1,
    
    -- Configuraciones adicionales
    timezone VARCHAR(50) DEFAULT 'UTC',
    language VARCHAR(10) DEFAULT 'es',
    
    -- Metadatos
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(user_id),
    UNIQUE(email)
);

-- Crear índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_tenant_profiles_user_id ON public.tenant_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_profiles_email ON public.tenant_profiles(email);
CREATE INDEX IF NOT EXISTS idx_tenant_profiles_subscription_status ON public.tenant_profiles(subscription_status);
CREATE INDEX IF NOT EXISTS idx_tenant_profiles_created_at ON public.tenant_profiles(created_at);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_tenant_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
CREATE TRIGGER trigger_update_tenant_profiles_updated_at
    BEFORE UPDATE ON public.tenant_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_tenant_profiles_updated_at();

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.tenant_profiles ENABLE ROW LEVEL SECURITY;

-- Política RLS: Los usuarios solo pueden ver y modificar su propio perfil
CREATE POLICY "Users can view own profile" ON public.tenant_profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON public.tenant_profiles
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON public.tenant_profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Política para administradores (opcional, para soporte)
CREATE POLICY "Admins can view all profiles" ON public.tenant_profiles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE auth.users.id = auth.uid() 
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Crear tabla para tracking de uso mensual
CREATE TABLE IF NOT EXISTS public.tenant_usage_tracking (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    month_year VARCHAR(7) NOT NULL, -- Formato: 2025-01
    
    -- Contadores de uso
    messages_sent INTEGER DEFAULT 0,
    api_calls INTEGER DEFAULT 0,
    storage_used_mb DECIMAL(10,2) DEFAULT 0,
    
    -- Metadatos
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(user_id, month_year)
);

-- Índices para tenant_usage_tracking
CREATE INDEX IF NOT EXISTS idx_tenant_usage_user_id ON public.tenant_usage_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_usage_month_year ON public.tenant_usage_tracking(month_year);

-- RLS para tenant_usage_tracking
ALTER TABLE public.tenant_usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage" ON public.tenant_usage_tracking
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own usage" ON public.tenant_usage_tracking
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage" ON public.tenant_usage_tracking
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Función para obtener o crear registro de uso mensual
CREATE OR REPLACE FUNCTION get_or_create_monthly_usage(p_user_id UUID, p_month_year VARCHAR(7))
RETURNS UUID AS $$
DECLARE
    usage_id UUID;
BEGIN
    -- Intentar obtener registro existente
    SELECT id INTO usage_id
    FROM public.tenant_usage_tracking
    WHERE user_id = p_user_id AND month_year = p_month_year;
    
    -- Si no existe, crear uno nuevo
    IF usage_id IS NULL THEN
        INSERT INTO public.tenant_usage_tracking (user_id, month_year)
        VALUES (p_user_id, p_month_year)
        RETURNING id INTO usage_id;
    END IF;
    
    RETURN usage_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para incrementar contador de mensajes
CREATE OR REPLACE FUNCTION increment_message_count(p_user_id UUID, p_count INTEGER DEFAULT 1)
RETURNS BOOLEAN AS $$
DECLARE
    current_month VARCHAR(7);
    usage_id UUID;
BEGIN
    -- Obtener mes actual
    current_month := TO_CHAR(NOW(), 'YYYY-MM');
    
    -- Obtener o crear registro de uso
    usage_id := get_or_create_monthly_usage(p_user_id, current_month);
    
    -- Incrementar contador
    UPDATE public.tenant_usage_tracking
    SET messages_sent = messages_sent + p_count,
        updated_at = NOW()
    WHERE id = usage_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para verificar límites del tenant
CREATE OR REPLACE FUNCTION check_tenant_limits(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
    profile_record RECORD;
    usage_record RECORD;
    current_month VARCHAR(7);
    result JSON;
BEGIN
    current_month := TO_CHAR(NOW(), 'YYYY-MM');
    
    -- Obtener perfil del tenant
    SELECT * INTO profile_record
    FROM public.tenant_profiles
    WHERE user_id = p_user_id;
    
    -- Obtener uso actual del mes
    SELECT * INTO usage_record
    FROM public.tenant_usage_tracking
    WHERE user_id = p_user_id AND month_year = current_month;
    
    -- Si no hay registro de uso, crear valores por defecto
    IF usage_record IS NULL THEN
        usage_record.messages_sent := 0;
        usage_record.api_calls := 0;
        usage_record.storage_used_mb := 0;
    END IF;
    
    -- Construir respuesta JSON
    result := json_build_object(
        'chatbots', json_build_object(
            'current', COALESCE((SELECT COUNT(*) FROM public.chatbots WHERE user_id = p_user_id), 0),
            'limit', COALESCE(profile_record.max_chatbots, 3),
            'canCreate', COALESCE((SELECT COUNT(*) FROM public.chatbots WHERE user_id = p_user_id), 0) < COALESCE(profile_record.max_chatbots, 3)
        ),
        'messages', json_build_object(
            'current', COALESCE(usage_record.messages_sent, 0),
            'limit', COALESCE(profile_record.max_monthly_messages, 1000),
            'canSend', COALESCE(usage_record.messages_sent, 0) < COALESCE(profile_record.max_monthly_messages, 1000)
        ),
        'whatsappSessions', json_build_object(
            'current', COALESCE((SELECT COUNT(*) FROM public.assign_qr WHERE user_id = p_user_id AND status = 'connected'), 0),
            'limit', COALESCE(profile_record.max_whatsapp_sessions, 1),
            'canConnect', COALESCE((SELECT COUNT(*) FROM public.assign_qr WHERE user_id = p_user_id AND status = 'connected'), 0) < COALESCE(profile_record.max_whatsapp_sessions, 1)
        )
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear vista para estadísticas de tenant
CREATE OR REPLACE VIEW tenant_stats AS
SELECT 
    tp.user_id,
    tp.email,
    tp.subscription_status,
    tp.subscription_plan,
    
    -- Contadores actuales
    COALESCE(chatbot_count.total, 0) as total_chatbots,
    COALESCE(current_usage.messages_sent, 0) as monthly_messages,
    COALESCE(qr_count.connected, 0) as active_sessions,
    
    -- Límites
    tp.max_chatbots,
    tp.max_monthly_messages,
    tp.max_whatsapp_sessions,
    
    -- Fechas importantes
    tp.trial_ends_at,
    tp.subscription_ends_at,
    tp.last_login_at,
    tp.created_at
    
FROM public.tenant_profiles tp

-- Contar chatbots
LEFT JOIN (
    SELECT user_id, COUNT(*) as total
    FROM public.chatbots
    GROUP BY user_id
) chatbot_count ON tp.user_id = chatbot_count.user_id

-- Uso mensual actual
LEFT JOIN (
    SELECT user_id, messages_sent, api_calls
    FROM public.tenant_usage_tracking
    WHERE month_year = TO_CHAR(NOW(), 'YYYY-MM')
) current_usage ON tp.user_id = current_usage.user_id

-- Sesiones de WhatsApp conectadas
LEFT JOIN (
    SELECT user_id, COUNT(*) as connected
    FROM public.assign_qr
    WHERE status = 'connected'
    GROUP BY user_id
) qr_count ON tp.user_id = qr_count.user_id;

-- Comentarios sobre la migración
COMMENT ON TABLE public.tenant_profiles IS 'Perfiles de tenant para sistema multi-tenant SAAS';
COMMENT ON TABLE public.tenant_usage_tracking IS 'Tracking de uso mensual por tenant';
COMMENT ON VIEW tenant_stats IS 'Vista consolidada de estadísticas por tenant';

-- Insertar datos de ejemplo para testing (opcional)
-- INSERT INTO public.tenant_profiles (user_id, email, first_name, last_name, company)
-- VALUES 
--     ('00000000-0000-0000-0000-000000000001', 'admin@tecnobot.com', 'Admin', 'TecnoBot', 'TecnoBot Inc'),
--     ('00000000-0000-0000-0000-000000000002', 'demo@example.com', 'Demo', 'User', 'Demo Company');

COMMIT;