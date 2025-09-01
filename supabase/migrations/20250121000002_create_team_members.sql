-- Migración: Crear tabla de miembros del equipo para sistema RBAC
-- Fecha: 2025-01-21
-- Descripción: Tabla para gestionar miembros del equipo y sus roles por tenant

-- Crear tabla team_members
CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    
    -- Información del miembro
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    
    -- Rol y permisos
    role VARCHAR(50) DEFAULT 'viewer' CHECK (role IN ('tenant_admin', 'chatbot_editor', 'operator', 'viewer')),
    
    -- Estado de la invitación
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'removed')),
    
    -- Información de invitación
    invited_by UUID REFERENCES auth.users(id),
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    
    -- Configuraciones específicas
    can_invite_others BOOLEAN DEFAULT FALSE,
    can_manage_billing BOOLEAN DEFAULT FALSE,
    
    -- Restricciones de acceso
    allowed_chatbots UUID[] DEFAULT '{}', -- Array de IDs de chatbots permitidos (vacío = todos)
    
    -- Metadatos
    last_activity_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(tenant_id, user_id),
    UNIQUE(tenant_id, email)
);

-- Crear índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_team_members_tenant_id ON public.team_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email ON public.team_members(email);
CREATE INDEX IF NOT EXISTS idx_team_members_status ON public.team_members(status);
CREATE INDEX IF NOT EXISTS idx_team_members_role ON public.team_members(role);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_team_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
CREATE TRIGGER trigger_update_team_members_updated_at
    BEFORE UPDATE ON public.team_members
    FOR EACH ROW
    EXECUTE FUNCTION update_team_members_updated_at();

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Política RLS: Los tenant admins pueden ver todos los miembros de su equipo
CREATE POLICY "Tenant admins can view team members" ON public.team_members
    FOR SELECT USING (
        tenant_id = auth.uid() OR
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.tenant_id = team_members.tenant_id
            AND tm.user_id = auth.uid()
            AND tm.role = 'tenant_admin'
            AND tm.status = 'active'
        )
    );

-- Política RLS: Solo tenant admins pueden insertar nuevos miembros
CREATE POLICY "Tenant admins can invite members" ON public.team_members
    FOR INSERT WITH CHECK (
        tenant_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.tenant_id = team_members.tenant_id
            AND tm.user_id = auth.uid()
            AND tm.role = 'tenant_admin'
            AND tm.status = 'active'
            AND tm.can_invite_others = TRUE
        )
    );

-- Política RLS: Solo tenant admins pueden actualizar miembros
CREATE POLICY "Tenant admins can update members" ON public.team_members
    FOR UPDATE USING (
        tenant_id = auth.uid() OR
        user_id = auth.uid() OR -- Los usuarios pueden actualizar su propia info
        EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.tenant_id = team_members.tenant_id
            AND tm.user_id = auth.uid()
            AND tm.role = 'tenant_admin'
            AND tm.status = 'active'
        )
    );

-- Política RLS: Solo tenant admins pueden eliminar miembros
CREATE POLICY "Tenant admins can remove members" ON public.team_members
    FOR DELETE USING (
        tenant_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.tenant_id = team_members.tenant_id
            AND tm.user_id = auth.uid()
            AND tm.role = 'tenant_admin'
            AND tm.status = 'active'
        )
    );

-- Crear tabla para invitaciones pendientes
CREATE TABLE IF NOT EXISTS public.team_invitations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    
    -- Información de la invitación
    role VARCHAR(50) NOT NULL CHECK (role IN ('chatbot_editor', 'operator', 'viewer')),
    invited_by UUID NOT NULL REFERENCES auth.users(id),
    
    -- Token de invitación
    invitation_token UUID DEFAULT gen_random_uuid(),
    
    -- Configuraciones
    can_invite_others BOOLEAN DEFAULT FALSE,
    allowed_chatbots UUID[] DEFAULT '{}',
    
    -- Estado y fechas
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
    accepted_at TIMESTAMPTZ,
    
    -- Metadatos
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(tenant_id, email),
    UNIQUE(invitation_token)
);

-- Índices para team_invitations
CREATE INDEX IF NOT EXISTS idx_team_invitations_tenant_id ON public.team_invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON public.team_invitations(email);
CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON public.team_invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_team_invitations_status ON public.team_invitations(status);
CREATE INDEX IF NOT EXISTS idx_team_invitations_expires_at ON public.team_invitations(expires_at);

-- RLS para team_invitations
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins can manage invitations" ON public.team_invitations
    FOR ALL USING (
        tenant_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.tenant_id = team_invitations.tenant_id
            AND tm.user_id = auth.uid()
            AND tm.role = 'tenant_admin'
            AND tm.status = 'active'
        )
    );

-- Función para invitar miembro del equipo
CREATE OR REPLACE FUNCTION invite_team_member(
    p_tenant_id UUID,
    p_email VARCHAR(255),
    p_role VARCHAR(50),
    p_invited_by UUID,
    p_can_invite_others BOOLEAN DEFAULT FALSE,
    p_allowed_chatbots UUID[] DEFAULT '{}'
)
RETURNS JSON AS $$
DECLARE
    invitation_record RECORD;
    existing_member RECORD;
    existing_invitation RECORD;
BEGIN
    -- Verificar si el usuario ya es miembro
    SELECT * INTO existing_member
    FROM public.team_members
    WHERE tenant_id = p_tenant_id AND email = p_email;
    
    IF existing_member IS NOT NULL THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'El usuario ya es miembro del equipo',
            'code', 'ALREADY_MEMBER'
        );
    END IF;
    
    -- Verificar si ya existe una invitación pendiente
    SELECT * INTO existing_invitation
    FROM public.team_invitations
    WHERE tenant_id = p_tenant_id AND email = p_email AND status = 'pending';
    
    IF existing_invitation IS NOT NULL THEN
        -- Actualizar invitación existente
        UPDATE public.team_invitations
        SET role = p_role,
            can_invite_others = p_can_invite_others,
            allowed_chatbots = p_allowed_chatbots,
            invitation_token = gen_random_uuid(),
            expires_at = NOW() + INTERVAL '7 days',
            updated_at = NOW()
        WHERE id = existing_invitation.id
        RETURNING * INTO invitation_record;
    ELSE
        -- Crear nueva invitación
        INSERT INTO public.team_invitations (
            tenant_id,
            email,
            role,
            invited_by,
            can_invite_others,
            allowed_chatbots
        ) VALUES (
            p_tenant_id,
            p_email,
            p_role,
            p_invited_by,
            p_can_invite_others,
            p_allowed_chatbots
        ) RETURNING * INTO invitation_record;
    END IF;
    
    RETURN json_build_object(
        'success', TRUE,
        'invitation', row_to_json(invitation_record),
        'message', 'Invitación enviada exitosamente'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para aceptar invitación
CREATE OR REPLACE FUNCTION accept_team_invitation(
    p_invitation_token UUID,
    p_user_id UUID,
    p_first_name VARCHAR(100) DEFAULT NULL,
    p_last_name VARCHAR(100) DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    invitation_record RECORD;
    member_record RECORD;
BEGIN
    -- Obtener invitación
    SELECT * INTO invitation_record
    FROM public.team_invitations
    WHERE invitation_token = p_invitation_token
    AND status = 'pending'
    AND expires_at > NOW();
    
    IF invitation_record IS NULL THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Invitación no válida o expirada',
            'code', 'INVALID_INVITATION'
        );
    END IF;
    
    -- Crear miembro del equipo
    INSERT INTO public.team_members (
        tenant_id,
        user_id,
        email,
        first_name,
        last_name,
        role,
        status,
        invited_by,
        invited_at,
        accepted_at,
        can_invite_others,
        allowed_chatbots
    ) VALUES (
        invitation_record.tenant_id,
        p_user_id,
        invitation_record.email,
        p_first_name,
        p_last_name,
        invitation_record.role,
        'active',
        invitation_record.invited_by,
        invitation_record.created_at,
        NOW(),
        invitation_record.can_invite_others,
        invitation_record.allowed_chatbots
    ) RETURNING * INTO member_record;
    
    -- Marcar invitación como aceptada
    UPDATE public.team_invitations
    SET status = 'accepted',
        accepted_at = NOW(),
        updated_at = NOW()
    WHERE id = invitation_record.id;
    
    RETURN json_build_object(
        'success', TRUE,
        'member', row_to_json(member_record),
        'message', 'Invitación aceptada exitosamente'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para obtener miembros del equipo con estadísticas
CREATE OR REPLACE FUNCTION get_team_members_with_stats(p_tenant_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_agg(
        json_build_object(
            'id', tm.id,
            'user_id', tm.user_id,
            'email', tm.email,
            'first_name', tm.first_name,
            'last_name', tm.last_name,
            'role', tm.role,
            'status', tm.status,
            'can_invite_others', tm.can_invite_others,
            'can_manage_billing', tm.can_manage_billing,
            'allowed_chatbots', tm.allowed_chatbots,
            'invited_at', tm.invited_at,
            'accepted_at', tm.accepted_at,
            'last_activity_at', tm.last_activity_at,
            'stats', json_build_object(
                'chatbots_created', COALESCE(cb.count, 0),
                'flows_created', COALESCE(bf.count, 0),
                'last_login', tp.last_login_at
            )
        )
    ) INTO result
    FROM public.team_members tm
    LEFT JOIN (
        SELECT user_id, COUNT(*) as count
        FROM public.chatbots
        GROUP BY user_id
    ) cb ON tm.user_id = cb.user_id
    LEFT JOIN (
        SELECT user_id, COUNT(*) as count
        FROM public.bot_flows
        GROUP BY user_id
    ) bf ON tm.user_id = bf.user_id
    LEFT JOIN public.tenant_profiles tp ON tm.user_id = tp.user_id
    WHERE tm.tenant_id = p_tenant_id
    AND tm.status IN ('active', 'suspended');
    
    RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para limpiar invitaciones expiradas
CREATE OR REPLACE FUNCTION cleanup_expired_invitations()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    UPDATE public.team_invitations
    SET status = 'expired',
        updated_at = NOW()
    WHERE status = 'pending'
    AND expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear vista para estadísticas de equipo
CREATE OR REPLACE VIEW team_overview AS
SELECT 
    tm.tenant_id,
    COUNT(*) as total_members,
    COUNT(*) FILTER (WHERE tm.status = 'active') as active_members,
    COUNT(*) FILTER (WHERE tm.status = 'suspended') as suspended_members,
    COUNT(*) FILTER (WHERE tm.role = 'tenant_admin') as admins,
    COUNT(*) FILTER (WHERE tm.role = 'chatbot_editor') as editors,
    COUNT(*) FILTER (WHERE tm.role = 'operator') as operators,
    COUNT(*) FILTER (WHERE tm.role = 'viewer') as viewers,
    MAX(tm.last_activity_at) as last_team_activity
FROM public.team_members tm
WHERE tm.status != 'removed'
GROUP BY tm.tenant_id;

-- Comentarios
COMMENT ON TABLE public.team_members IS 'Miembros del equipo por tenant con roles y permisos';
COMMENT ON TABLE public.team_invitations IS 'Invitaciones pendientes para unirse al equipo';
COMMENT ON VIEW team_overview IS 'Vista resumen de estadísticas del equipo por tenant';

-- Crear job para limpiar invitaciones expiradas (requiere pg_cron)
-- SELECT cron.schedule('cleanup-expired-invitations', '0 2 * * *', 'SELECT cleanup_expired_invitations();');

COMMIT;