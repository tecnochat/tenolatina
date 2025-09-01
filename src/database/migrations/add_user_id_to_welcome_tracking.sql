-- Agregar columna user_id
ALTER TABLE welcome_tracking 
ADD COLUMN user_id UUID;

-- Actualizar registros existentes con el user_id correspondiente
UPDATE welcome_tracking wt
SET user_id = w.user_id
FROM welcomes w
WHERE wt.welcome_id = w.id;

-- Hacer la columna no nullable
ALTER TABLE welcome_tracking 
ALTER COLUMN user_id SET NOT NULL;

-- Agregar foreign key
ALTER TABLE welcome_tracking
ADD CONSTRAINT fk_welcome_tracking_user
FOREIGN KEY (user_id) 
REFERENCES auth.users(id);

-- Agregar índice para mejorar performance
CREATE INDEX idx_welcome_tracking_user_id 
ON welcome_tracking(user_id);
