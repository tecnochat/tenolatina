-- Create response cache table
CREATE TABLE IF NOT EXISTS response_cache (
    id BIGSERIAL PRIMARY KEY,
    cache_key TEXT NOT NULL UNIQUE,
    chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
    original_message TEXT NOT NULL,
    response TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Índices
    INDEX idx_cache_key (cache_key),
    INDEX idx_chatbot_created (chatbot_id, created_at)
);

-- Crear índice para búsqueda de texto
CREATE INDEX idx_original_message_trgm ON response_cache USING gin (original_message gin_trgm_ops);

-- Comentario: Este índice ayuda en la búsqueda de mensajes similares
COMMENT ON INDEX idx_original_message_trgm IS 'Índice para búsqueda de similitud en mensajes';