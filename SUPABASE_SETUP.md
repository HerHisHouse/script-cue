# Guía de Configuración de Supabase para Mezcla de Audio

Sigue estos pasos **EXACTAMENTE** en tu dashboard de Supabase.

## Paso 1: Crear Bucket de Storage

1. Ve a tu proyecto en https://supabase.com/dashboard
2. En el menú lateral, haz clic en **Storage**
3. Haz clic en **"New bucket"**
4. Nombre del bucket: `casting-audio`
5. **Public bucket**: Desmarcado (NO público)
6. Haz clic en **"Create bucket"**

## Paso 2: Configurar Políticas RLS del Bucket

1. Con el bucket `casting-audio` seleccionado, ve a la pestaña **"Policies"**
2. Haz clic en **"New Policy"**

### Política 1: Permitir Upload

- **Policy name**: `Users can upload own audio files`
- **Allowed operation**: `INSERT`
- **Target roles**: `authenticated`
- **USING expression** (dejar vacío)
- **WITH CHECK expression**:
```sql
bucket_id = 'casting-audio' AND (storage.foldername(name))[1] = auth.uid()::text
```
- Haz clic en **"Review"** y luego **"Save policy"**

### Política 2: Permitir Read

- Haz clic en **"New Policy"** nuevamente
- **Policy name**: `Users can read own audio files`
- **Allowed operation**: `SELECT`
- **Target roles**: `authenticated`
- **USING expression**:
```sql
bucket_id = 'casting-audio' AND (storage.foldername(name))[1] = auth.uid()::text
```
- **WITH CHECK expression** (dejar vacío)
- Haz clic en **"Review"** y luego **"Save policy"**

### Política 3: Permitir Delete

- Haz clic en **"New Policy"** nuevamente
- **Policy name**: `Users can delete own audio files`
- **Allowed operation**: `DELETE`
- **Target roles**: `authenticated`
- **USING expression**:
```sql
bucket_id = 'casting-audio' AND (storage.foldername(name))[1] = auth.uid()::text
```
- **WITH CHECK expression** (dejar vacío)
- Haz clic en **"Review"** y luego **"Save policy"**

## Paso 3: Crear Edge Function

1. Abre una terminal en tu proyecto local (donde está `/Users/alexdiaz/Documents/RS`)

2. Asegúrate de tener Supabase CLI instalado:
```bash
# Si no lo tienes instalado
brew install supabase/tap/supabase

# Verificar instalación
supabase --version
```

3. Inicializar Supabase en tu proyecto (si no lo has hecho):
```bash
cd /Users/alexdiaz/Documents/RS
supabase init
```

4. Crear la Edge Function:
```bash
supabase functions new mix-casting-audio
```

Esto creará el archivo: `supabase/functions/mix-casting-audio/index.ts`

5. **Importante**: Voy a crear el contenido de este archivo por ti en el siguiente paso

## Paso 4: Instalar FFmpeg en Edge Function

Las Edge Functions de Supabase Deno necesitan una configuración especial para FFmpeg.

Crea el archivo `supabase/functions/mix-casting-audio/ffmpeg-installer.ts` con el contenido que te proporcionaré.

## Paso 5: Desplegar la Edge Function

```bash
# Login a Supabase (si no lo has hecho)
supabase login

# Link a tu proyecto
supabase link --project-ref TU_PROJECT_REF

# Desplegar la función
supabase functions deploy mix-casting-audio
```

**Nota**: Encontrarás tu `PROJECT_REF` en el dashboard de Supabase, en Settings → General → Reference ID

## Verificación

Al terminar estos pasos deberías tener:
- ✅ Bucket `casting-audio` creado
- ✅ 3 políticas RLS configuradas
- ✅ Edge Function `mix-casting-audio` desplegada

¿Listo para continuar? Te daré el código de la Edge Function a continuación.
