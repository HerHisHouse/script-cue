-- La caché de voces guardaba una sola fila por línea y voz (UNIQUE line_id, provider, voice_id).
-- Si dos versiones de la app (o dos dispositivos) mandaban un texto distinto para la misma
-- línea —p.ej. "[angry] …" y "[Enfadado] …"—, cada una pisaba la fila de la otra y las dos
-- volvían a generar (y pagar) el audio en cada uso. Ahora hay una fila por cada texto distinto.
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT con.conname INTO constraint_name
    FROM pg_constraint con
    WHERE con.conrelid = 'public.tts_cache'::regclass
      AND con.contype = 'u'
      AND (
        SELECT array_agg(att.attname::text ORDER BY att.attname)
        FROM unnest(con.conkey) AS k(attnum)
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
      ) = ARRAY['line_id', 'provider', 'voice_id'];

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.tts_cache DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

ALTER TABLE public.tts_cache
    ADD CONSTRAINT tts_cache_line_provider_voice_text_key UNIQUE (line_id, provider, voice_id, text_hash);
