# Correcciones Modo Casting - 2 Diciembre 2025

## Problemas Solucionados

### 1. ✅ VAD (Voice Activity Detection) no avanzaba después de la primera frase

**Causa raíz**: 
- El `vadRecordingRef.current` no se limpiaba correctamente entre líneas
- El estado `isUserSpeakingRef.current` no se reseteaba
- La función `startVAD()` retornaba temprano si ya existía una grabación

**Solución implementada**:
```typescript
async function startVAD() {
  // CRÍTICO: Siempre detener el VAD existente primero
  if (vadRecordingRef.current) {
    console.log('[Casting] Stopping existing VAD before starting new one');
    await stopVAD();
  }

  // Reset de estado
  isUserSpeakingRef.current = false;
  setMetering(-160);
  
  // ... resto del código
}
```

**Mejoras adicionales**:
- Logs más detallados para debugging:
  - "Speech detected!" cuando se detecta voz
  - "Silence after speech, starting timer..." cuando empieza el silencio
  - "Silence timeout reached, advancing..." cuando se cumple el timeout
  - "VAD started successfully" cuando se inicia correctamente

### 2. ✅ Error "Payload Too Large" al procesar video

**Causa raíz**:
- El video se enviaba en base64, lo que aumenta el tamaño ~33%
- El límite de Express estaba en 50MB
- Videos de más de ~37MB fallaban

**Solución implementada**:

#### Cliente (`casting.tsx`):
- Guardar `audioPath` con URI completa (`file://...`) en lugar de ruta relativa
- Leer archivos de audio de IA directamente con la URI completa
- Enviar video + archivos de audio de IA en base64 al servidor

#### Servidor (`server/index.js`):
```javascript
// Aumentar límite de 50MB a 200MB
app.use(express.json({ limit: '200mb' }));

// Recibir archivos de audio en base64 del cliente
if (req.body.aiAudioFiles && Array.isArray(req.body.aiAudioFiles)) {
  for (const aiFile of req.body.aiAudioFiles) {
    const aiBuffer = Buffer.from(aiFile.base64, 'base64');
    // ... guardar y procesar
  }
}
```

## Flujo Actualizado

### Grabación en Modo Casting:

1. **Usuario inicia grabación** → `startRecording()`
2. **Para cada línea de diálogo**:
   - Si es línea de IA:
     - Reproduce audio TTS desde caché
     - Guarda timing con `audioPath` completa (file://...)
     - Avanza automáticamente al terminar
   - Si es línea del usuario:
     - Inicia VAD
     - Detecta cuando el usuario habla
     - Espera 1.5s de silencio
     - Avanza automáticamente
3. **Usuario detiene grabación** → `stopRecording()`
4. **Procesamiento**:
   - Lee video en base64
   - Lee archivos de audio de IA en base64
   - Envía todo al servidor de Render
   - Servidor mezcla audio y video
   - Sube solo el video final a Supabase

### Parámetros VAD:
```typescript
const SILENCE_THRESHOLD = -40; // dB (más alto = más sensible)
const SILENCE_DURATION = 1500; // ms (1.5 segundos)
```

## Cómo Probar

### 1. Esperar deploy de Render
- Ir a https://dashboard.render.com
- Verificar que el servicio se haya desplegado correctamente
- Buscar en los logs: "🎵 Audio Merge Server running on port 10000"

### 2. Probar VAD
1. Abrir un guion en Modo Casting
2. Iniciar grabación (botón rojo)
3. Esperar a que la IA hable
4. Cuando sea tu turno, hablar claramente
5. **Verificar en logs**:
   ```
   [Casting] Starting VAD...
   [Casting] VAD started successfully
   [Casting] Speech detected!
   [Casting] Silence after speech, starting timer...
   [Casting] Silence timeout reached, advancing...
   ```
6. Repetir para varias líneas

### 3. Probar procesamiento de video
1. Grabar una escena completa (2-3 minutos)
2. Detener grabación
3. **Verificar en logs del cliente**:
   ```
   [Casting] Preparing video and audio for processing...
   [Casting] Reading AI audio files...
   [Casting] Prepared X AI audio files  // X debe ser > 0
   [Casting] Sending video to Render for processing...
   ```
4. **Verificar en logs de Render**:
   ```
   [Casting] Processing video for user...
   [Casting] Decoding video from base64...
   [Casting] Video saved (XX.XX MB)
   [Casting] Processing AI audio files...
   [Casting] Processed X AI audio segments
   [Casting] Mixing audio tracks...
   [Casting] Success! Processed video uploaded
   ```

## Troubleshooting

### Si el VAD no avanza:
1. Verificar que los logs muestren "VAD started successfully"
2. Verificar que detecte voz: "Speech detected!"
3. Ajustar `SILENCE_THRESHOLD` si es necesario (línea 104 de casting.tsx)
4. Ajustar `SILENCE_DURATION` si es necesario (línea 105 de casting.tsx)

### Si el video falla al procesar:
1. Verificar que `Prepared X AI audio files` sea > 0
2. Verificar que el servidor de Render esté activo
3. Verificar que el límite de 200mb esté aplicado en Render
4. Si el video es muy largo (>5 min), considerar dividir en escenas

### Si "Prepared 0 AI audio files":
1. Verificar que `audioPath` se guarde correctamente en los logs
2. Verificar que los archivos TTS estén en caché
3. Verificar que `isRecording` sea `true` cuando la IA habla

## Archivos Modificados

- ✅ `app/scripts/[id]/casting.tsx` - VAD y lectura de audio
- ✅ `app/scripts/[id]/studio-v2.tsx` - Fix tipo TypeScript
- ✅ `app/import-script.tsx` - Agregar estilo backdrop
- ✅ `server/index.js` - Aumentar límite y recibir audio en base64
- ✅ `supabase/functions/mix-casting-audio/deno.json` - Config Deno

## Próximos Pasos

1. ⏳ Esperar deploy de Render (~2-3 minutos)
2. 🧪 Probar VAD con varias líneas
3. 🎬 Probar procesamiento de video completo
4. 📊 Revisar logs para verificar funcionamiento
5. ⚙️ Ajustar parámetros si es necesario
