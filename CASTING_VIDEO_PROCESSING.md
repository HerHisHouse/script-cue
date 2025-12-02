# Implementación de Procesamiento de Video en Casting Mode

## ✅ Cambios Implementados

### 1. Servidor (Render.com)
- ✅ Añadido endpoint `/process-casting` en `server/index.js`
- ✅ Lógica de FFmpeg para mezclar audio de usuario con audio de IA
- ✅ Descarga de videos y audios desde Supabase Storage
- ✅ Subida de videos procesados a Supabase Storage

### 2. App (React Native)
- ✅ Añadido tracking de timestamps en `casting.tsx`
- ✅ Registro de cuándo habla cada personaje (IA vs usuario)
- ✅ Subida de video raw a Supabase
- ✅ Llamada al servidor de Render para procesamiento
- ✅ UI de "Procesando..." con barra de progreso
- ✅ Guardado del video procesado en la base de datos

### 3. Documentación
- ✅ README del servidor con instrucciones
- ✅ `.env.example` actualizado con `EXPO_PUBLIC_RENDER_SERVER_URL`

## 🔧 Pasos que DEBES Realizar

### Paso 1: Añadir Variable de Entorno

Edita tu archivo `.env` local y añade:

```bash
EXPO_PUBLIC_RENDER_SERVER_URL=https://script-cue-merge-server.onrender.com
```

(Reemplaza con la URL real de tu servidor en Render)

### Paso 2: Desplegar el Servidor Actualizado

El código del servidor ya está actualizado. Solo necesitas hacer push a tu repositorio:

```bash
git add .
git commit -m "Add video processing endpoint for Casting Mode"
git push
```

Render.com detectará automáticamente los cambios y redesplegará el servidor.

### Paso 3: Verificar que FFmpeg está Disponible

Render.com incluye FFmpeg por defecto, pero si tienes problemas, verifica los logs del servidor en Render.com. Si FFmpeg no está disponible, actualiza `render.yaml`:

```yaml
services:
  - type: web
    name: script-cue-merge-server
    env: node
    buildCommand: |
      cd server && npm install
      # Instalar FFmpeg si no está disponible
      apt-get update && apt-get install -y ffmpeg || true
    startCommand: node server/index.js
    envVars:
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_SERVICE_KEY
        sync: false
```

### Paso 4: Probar el Flujo Completo

1. **Genera TTS para el guión** (si no lo has hecho):
   - Abre el guión en la app
   - Ve a Configuración → Generar TTS
   - Espera a que se generen todos los audios

2. **Graba un Casting**:
   - Abre Modo Casting
   - Pulsa el botón de grabación (rojo)
   - Actúa tu escena (el teleprompter avanzará automáticamente)
   - Detén la grabación

3. **Espera el Procesamiento**:
   - Verás un modal "Procesando tu casting..."
   - La barra de progreso mostrará el avance
   - Esto puede tardar 30-60 segundos

4. **Verifica el Resultado**:
   - El video procesado aparecerá en "Grabaciones"
   - Reproduce el video
   - Deberías escuchar tu voz + la voz de IA de alta calidad

## 🐛 Troubleshooting

### El servidor no procesa el video

**Verifica los logs en Render.com:**
1. Ve a tu dashboard de Render
2. Selecciona el servicio `script-cue-merge-server`
3. Ve a la pestaña "Logs"
4. Busca errores relacionados con FFmpeg o Supabase

**Errores comunes:**
- `FFmpeg not found`: FFmpeg no está instalado → Actualiza `render.yaml`
- `Failed to download video`: El video no se subió correctamente a Supabase
- `Failed to download AI audio`: Los audios TTS no están en el caché → Genera TTS primero

### El video no tiene audio de IA

**Verifica:**
1. ¿Generaste los audios TTS antes de grabar?
2. ¿Los audios están en Supabase Storage en la carpeta correcta?
3. Revisa los logs del servidor para ver si descargó los audios correctamente

### La app se queda en "Procesando..." indefinidamente

**Posibles causas:**
1. El servidor de Render está caído o tardando mucho
2. Error de red entre la app y Render
3. El servidor devolvió un error pero la app no lo manejó

**Solución:**
- Verifica los logs del servidor en Render
- Verifica los logs de la app en Expo
- Si el servidor está lento, considera aumentar el plan de Render

## 📊 Flujo Técnico Completo

```
1. Usuario graba video en Casting Mode
   ↓
2. App registra timestamps:
   - Línea 0 (IA): 0.0s - 3.2s → audio en /cache/line_0.mp3
   - Línea 1 (Usuario): 3.2s - 5.5s
   - Línea 2 (IA): 5.5s - 8.1s → audio en /cache/line_2.mp3
   ↓
3. App sube video raw a Supabase Storage
   ↓
4. App llama a Render: POST /process-casting
   {
     videoPath: "user_id/casting_raw.mp4",
     lineTimings: [...]
   }
   ↓
5. Servidor Render:
   a. Descarga video raw
   b. Extrae audio del usuario
   c. Descarga audios de IA del caché
   d. Mezcla audios con FFmpeg
   e. Reemplaza audio del video
   f. Sube video procesado
   ↓
6. Servidor responde: { path: "user_id/casting_processed.mp4" }
   ↓
7. App guarda en DB y muestra éxito
   ↓
8. Usuario ve el video en "Grabaciones"
```

## 🎯 Próximos Pasos Opcionales

1. **Optimización**: Comprimir el video antes de subir (reducir tamaño)
2. **Calidad**: Permitir al usuario elegir calidad de video (720p, 1080p)
3. **Preview**: Mostrar preview del video antes de procesar
4. **Reintentos**: Añadir lógica de reintentos si el procesamiento falla
5. **Notificaciones**: Enviar notificación push cuando el procesamiento termine

## ❓ ¿Necesitas Ayuda?

Si encuentras algún problema:
1. Revisa los logs del servidor en Render.com
2. Revisa los logs de la app en Expo
3. Verifica que todas las variables de entorno estén configuradas
4. Asegúrate de que los audios TTS estén generados antes de grabar
