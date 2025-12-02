# Script Cue - Audio/Video Processing Server

Este servidor Node.js se encarga de procesar audio y video para la aplicación Script Cue.

## Funcionalidades

1. **Merge de Audio** (`/merge`): Concatena múltiples segmentos de audio en un solo archivo
2. **Procesamiento de Casting** (`/process-casting`): Mezcla video del usuario con audio de IA

## Requisitos

- Node.js >= 18.0.0
- FFmpeg instalado en el servidor

## Configuración en Render.com

### 1. Variables de Entorno

Configura las siguientes variables en Render:

```
SUPABASE_URL=tu_supabase_url
SUPABASE_SERVICE_KEY=tu_supabase_service_key
```

### 2. Build Command

```bash
cd server && npm install
```

### 3. Start Command

```bash
node server/index.js
```

### 4. Instalar FFmpeg

Render.com incluye FFmpeg por defecto en sus contenedores, pero si necesitas instalarlo manualmente, añade esto al `render.yaml`:

```yaml
services:
  - type: web
    name: script-cue-merge-server
    env: node
    buildCommand: |
      cd server && npm install
      apt-get update && apt-get install -y ffmpeg
    startCommand: node server/index.js
```

## Endpoints

### POST /merge

Concatena múltiples segmentos de audio.

**Request:**
```json
{
  "segments": [
    { "path": "user_id/segment_1.m4a" },
    { "path": "user_id/segment_2.mp3" }
  ],
  "userId": "user_id",
  "scriptId": "script_id"
}
```

**Response:**
```json
{
  "success": true,
  "path": "user_id/1234567890_merged.m4a",
  "segmentCount": 2
}
```

### POST /process-casting

Procesa un video de casting mezclando el audio del usuario con las líneas de IA.

**Request:**
```json
{
  "videoPath": "user_id/casting_1234567890_raw.mp4",
  "scriptId": "script_id",
  "userId": "user_id",
  "lineTimings": [
    {
      "index": 0,
      "type": "ai",
      "startTime": 2.5,
      "duration": 3.2,
      "audioPath": "/path/to/cached/ai/audio.mp3"
    },
    {
      "index": 1,
      "type": "user",
      "startTime": 5.7,
      "duration": 2.1
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "path": "user_id/casting_1234567890_processed.mp4",
  "message": "Video processed successfully"
}
```

## Proceso de Casting

1. **Usuario graba video** en la app (con su voz + micrófono)
2. **App sube video raw** a Supabase Storage
3. **App envía request** a `/process-casting` con:
   - Ruta del video
   - Timestamps de cuándo habla cada personaje
   - Rutas a los audios de IA (desde caché TTS)
4. **Servidor procesa**:
   - Descarga el video del usuario
   - Extrae el audio del video
   - Descarga los audios de IA del caché
   - Mezcla el audio del usuario con los audios de IA en los timestamps correctos
   - Reemplaza la pista de audio del video con la mezcla
   - Sube el video procesado a Supabase
5. **Servidor responde** con la ruta del video procesado
6. **App guarda** el registro en la base de datos

## Desarrollo Local

```bash
cd server
npm install
SUPABASE_URL=your_url SUPABASE_SERVICE_KEY=your_key node index.js
```

El servidor estará disponible en `http://localhost:3000`

## Health Check

```bash
curl http://localhost:3000/health
```

Respuesta:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```
