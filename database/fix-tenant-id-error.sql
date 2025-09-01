-- =====================================================
-- SCRIPT PARA CORREGIR ERROR DE TENANT_ID
-- =====================================================
-- 
-- Este script corrige el error "column tenant_id does not exist"
-- agregando la columna tenant_id a tablas existentes antes de
-- crear las políticas RLS
-- 
-- INSTRUCCIONES:
-- 1. Ejecuta este script ANTES del complete-setup.sql
-- 2. O ejecuta este script si ya obtuviste el error
-- =====================================================

-- Verificar y agregar tenant_id a tablas existentes
DO $$
BEGIN
    -- Agregar tenant_id a chatbots si existe la tabla
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'chatbots'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'chatbots' AND column_name = 'tenant_id'
        ) THEN
            ALTER TABLE chatbots ADD COLUMN tenant_id UUID;
            RAISE NOTICE '✅ Columna tenant_id agregada a chatbots';
        ELSE
            RAISE NOTICE '⚠️ Columna tenant_id ya existe en chatbots';
        END IF;
    ELSE
        RAISE NOTICE '📋 Tabla chatbots no existe - se creará en el siguiente script';
    END IF;

    -- Agregar tenant_id a conversations si existe la tabla
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'conversations'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'conversations' AND column_name = 'tenant_id'
        ) THEN
            ALTER TABLE conversations ADD COLUMN tenant_id UUID;
            RAISE NOTICE '✅ Columna tenant_id agregada a conversations';
        ELSE
            RAISE NOTICE '⚠️ Columna tenant_id ya existe en conversations';
        END IF;
    ELSE
        RAISE NOTICE '📋 Tabla conversations no existe - se creará en el siguiente script';
    END IF;

    -- Agregar tenant_id a messages si existe la tabla
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'messages'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'messages' AND column_name = 'tenant_id'
        ) THEN
            ALTER TABLE messages ADD COLUMN tenant_id UUID;
            RAISE NOTICE '✅ Columna tenant_id agregada a messages';
        ELSE
            RAISE NOTICE '⚠️ Columna tenant_id ya existe en messages';
        END IF;
    ELSE
        RAISE NOTICE '📋 Tabla messages no existe - se creará en el siguiente script';
    END IF;

    -- Agregar tenant_id a flows si existe la tabla
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'flows'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'flows' AND column_name = 'tenant_id'
        ) THEN
            ALTER TABLE flows ADD COLUMN tenant_id UUID;
            RAISE NOTICE '✅ Columna tenant_id agregada a flows';
        ELSE
            RAISE NOTICE '⚠️ Columna tenant_id ya existe en flows';
        END IF;
    ELSE
        RAISE NOTICE '📋 Tabla flows no existe - se creará en el siguiente script';
    END IF;

    -- Agregar tenant_id a analytics_events si existe la tabla
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'analytics_events'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'analytics_events' AND column_name = 'tenant_id'
        ) THEN
            ALTER TABLE analytics_events ADD COLUMN tenant_id UUID;
            RAISE NOTICE '✅ Columna tenant_id agregada a analytics_events';
        ELSE
            RAISE NOTICE '⚠️ Columna tenant_id ya existe en analytics_events';
        END IF;
    ELSE
        RAISE NOTICE '📋 Tabla analytics_events no existe - se creará en el siguiente script';
    END IF;

    -- Agregar tenant_id a webhooks si existe la tabla
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'webhooks'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'webhooks' AND column_name = 'tenant_id'
        ) THEN
            ALTER TABLE webhooks ADD COLUMN tenant_id UUID;
            RAISE NOTICE '✅ Columna tenant_id agregada a webhooks';
        ELSE
            RAISE NOTICE '⚠️ Columna tenant_id ya existe en webhooks';
        END IF;
    ELSE
        RAISE NOTICE '📋 Tabla webhooks no existe - se creará en el siguiente script';
    END IF;

    -- Agregar tenant_id a webhook_logs si existe la tabla
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'webhook_logs'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'webhook_logs' AND column_name = 'tenant_id'
        ) THEN
            ALTER TABLE webhook_logs ADD COLUMN tenant_id UUID;
            RAISE NOTICE '✅ Columna tenant_id agregada a webhook_logs';
        ELSE
            RAISE NOTICE '⚠️ Columna tenant_id ya existe en webhook_logs';
        END IF;
    ELSE
        RAISE NOTICE '📋 Tabla webhook_logs no existe - se creará en el siguiente script';
    END IF;

END $$;

-- Mensaje final
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎯 CORRECCIÓN COMPLETADA';
    RAISE NOTICE '✅ Todas las columnas tenant_id han sido verificadas/agregadas';
    RAISE NOTICE '';
    RAISE NOTICE '📋 PRÓXIMO PASO:';
    RAISE NOTICE '1. Ahora ejecuta el script complete-setup.sql';
    RAISE NOTICE '2. El error de tenant_id debería estar resuelto';
END $$;