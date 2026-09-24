-- Repara grabaciones cuya ruta de la nube se sobrescribió con una ruta local del dispositivo.
--
-- Hasta ahora, "Offline (Descarga en el terminal)" guardaba en recordings.audio_url la ruta
-- file:// de la copia descargada en ese dispositivo. Como la fila se comparte entre todos los
-- dispositivos de la cuenta, los demás la mostraban como "Local", no podían reproducirla ni
-- compartirla, y se perdía la referencia al archivo en Storage (que sigue existiendo). La app ya no
-- escribe esa ruta (la copia Offline es solo del dispositivo); esto restaura la de la nube.
--
-- Solo se tocan filas con audio_url file:// cuyo nombre de archivo coincide con EXACTAMENTE UN
-- objeto del bucket 'recordings' del mismo usuario. Las grabaciones "solo local" de verdad
-- (grabadas sin subir a la nube) no tienen objeto en Storage y no se modifican.

with candidates as (
  select
    r.id as recording_id,
    o.name as storage_path,
    count(*) over (partition by r.id) as matches
  from public.recordings r
  join storage.objects o
    on o.bucket_id = 'recordings'
   and (o.name like r.user_id::text || '/%' or o.owner = r.user_id)
   and regexp_replace(o.name, '^.*/', '') = regexp_replace(r.audio_url, '^.*/', '')
  where r.audio_url like 'file://%'
)
update public.recordings r
set audio_url = c.storage_path
from candidates c
where c.recording_id = r.id
  and c.matches = 1;
