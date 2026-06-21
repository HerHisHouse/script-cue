-- Columna para identificar si viene de web o app
ALTER TABLE community_waitlist 
ADD COLUMN IF NOT EXISTS fuente TEXT DEFAULT 'app';

-- Hacer user_id opcional (en la web el usuario puede no estar logueado)
ALTER TABLE community_waitlist 
ALTER COLUMN user_id DROP NOT NULL;

-- Índice para evitar emails duplicados desde la web
CREATE UNIQUE INDEX IF NOT EXISTS community_waitlist_email_idx 
ON community_waitlist (email);
