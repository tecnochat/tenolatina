-- Script para eliminar el campo priority de la tabla bot_flows
-- Este campo no es necesario ya que no afecta la funcionalidad del sistema
-- Las coincidencias son exactas y el orden no es relevante

-- Crear función para resetear el campo priority antes de eliminarlo
CREATE OR REPLACE FUNCTION reset_priority() RETURNS void AS $$
BEGIN
    -- Asegurarse de que no hay dependencias en el campo
    UPDATE public.bot_flows SET priority = 0 WHERE priority IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- Ejecutar la función
SELECT reset_priority();

-- Eliminar la función ya que no se necesitará más
DROP FUNCTION reset_priority();

-- Eliminar el campo priority
ALTER TABLE public.bot_flows DROP COLUMN IF EXISTS priority;

-- Verificar que el campo se eliminó correctamente
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'bot_flows' 
        AND column_name = 'priority'
    ) THEN
        RAISE EXCEPTION 'La columna priority no se eliminó correctamente';
    END IF;
END $$;

-- Comentario en la tabla para documentar el cambio
COMMENT ON TABLE public.bot_flows IS 'Tabla de flujos dinámicos. La columna priority fue eliminada ya que no era necesaria para el funcionamiento del sistema.';