-- Habilitar la extensión pg_trgm primero
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Crear función IMMUTABLE para array_to_string
CREATE OR REPLACE FUNCTION immutable_array_to_string(text[], text) 
RETURNS text AS $$
BEGIN
    RETURN array_to_string($1, $2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Índices para la tabla chatbots
CREATE INDEX IF NOT EXISTS idx_chatbots_user_active ON chatbots(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_chatbots_created ON chatbots(created_at DESC);

-- Índices para optimizar búsquedas en el historial de chat
CREATE INDEX IF NOT EXISTS idx_chat_history_chatbot_phone ON chat_history(chatbot_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_chat_history_created ON chat_history(created_at DESC);

-- Índices para flujos del bot
CREATE INDEX IF NOT EXISTS idx_bot_flows_chatbot_active ON bot_flows(chatbot_id, is_active);
-- Índice para búsqueda de texto en keywords usando función immutable
CREATE INDEX IF NOT EXISTS idx_bot_flows_keyword ON bot_flows USING gin ((immutable_array_to_string(keyword, ' ')) gin_trgm_ops);

-- Índices para mensajes de bienvenida
CREATE INDEX IF NOT EXISTS idx_welcomes_chatbot_active ON welcomes(chatbot_id, is_active);
CREATE INDEX IF NOT EXISTS idx_welcome_tracking_welcome ON welcome_tracking(welcome_id, phone_number);

-- Índices para prompts
CREATE INDEX IF NOT EXISTS idx_behavior_prompts_chatbot ON behavior_prompts(chatbot_id, is_active);
CREATE INDEX IF NOT EXISTS idx_knowledge_prompts_chatbot ON knowledge_prompts(chatbot_id, is_active);

-- Índices para formularios
CREATE INDEX IF NOT EXISTS idx_form_fields_chatbot ON form_fields(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_form_fields_order ON form_fields(order_index);
CREATE INDEX IF NOT EXISTS idx_form_messages_chatbot ON form_messages(chatbot_id);

-- Índices para datos de clientes
CREATE INDEX IF NOT EXISTS idx_client_data_chatbot ON client_data(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_client_data_phone ON client_data(phone_number);

-- Índices para lista negra
CREATE INDEX IF NOT EXISTS idx_blacklist_chatbot_phone ON blacklist(chatbot_id, phone_number);

-- Comentarios explicativos
COMMENT ON INDEX idx_chatbots_user_active IS 'Optimiza búsqueda de chatbots activos por usuario';
COMMENT ON INDEX idx_chat_history_chatbot_phone IS 'Optimiza búsqueda de historial por chatbot y número de teléfono';
COMMENT ON INDEX idx_bot_flows_keyword IS 'Índice GIN para búsqueda eficiente en palabras clave de flujos usando función immutable';
COMMENT ON INDEX idx_blacklist_chatbot_phone IS 'Optimiza verificación de números en lista negra';
COMMENT ON INDEX idx_client_data_chatbot IS 'Optimiza búsqueda de datos de clientes por chatbot';
COMMENT ON INDEX idx_welcome_tracking_welcome IS 'Optimiza tracking de mensajes de bienvenida';