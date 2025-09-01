-- Habilitar la extensión vector si no está habilitada
create extension if not exists vector;

-- Función para actualizar el timestamp de updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

-- Función para buscar en el historial de chat
create or replace function match_chat_history(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_chatbot_id uuid
)
returns table (
  id uuid,
  message text,
  response text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    ch.id,
    ch.message,
    ch.response,
    1 - (ch.embedding <=> query_embedding) as similarity
  from chat_history ch
  where ch.chatbot_id = p_chatbot_id
    and 1 - (ch.embedding <=> query_embedding) > match_threshold
  order by ch.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Función para buscar prompts de conocimiento similares
create or replace function match_knowledge_prompts(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_chatbot_id uuid
)
returns table (
  id uuid,
  category text,
  prompt_text text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    kp.id,
    kp.category,
    kp.prompt_text,
    1 - (kp.embedding <=> query_embedding) as similarity
  from knowledge_prompts kp
  where kp.chatbot_id = p_chatbot_id
    and kp.is_active = true
    and 1 - (kp.embedding <=> query_embedding) > match_threshold
  order by kp.embedding <=> query_embedding
  limit match_count;
end;
$$; 