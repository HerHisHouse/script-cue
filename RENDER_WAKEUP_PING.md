# 🚀 Wake-Up Ping para Servidor Render

## ✅ Problema Resuelto

**Problema:**
- Render.com pone los servicios gratuitos en "sleep" después de inactividad
- La primera petición después del sleep tarda ~30-60 segundos en despertar el servidor
- Esto causaba errores de "Network request failed" al guardar grabaciones en Modo Estudio

**Solución:**
- Enviar un "ping de despertar" al servidor cuando se inicia una grabación
- El servidor se despierta mientras el usuario graba
- Cuando termina la grabación, el servidor ya está listo para procesar

---

## 🔧 Implementación

### **Archivo Modificado:**
- `/app/scripts/[id]/studio-v2.tsx`

### **Función Agregada:**

```tsx
async function wakeUpRenderServer() {
    try {
        const renderUrl = process.env.EXPO_PUBLIC_RENDER_SERVER_URL || 
                         'https://script-cue-merge-server.onrender.com';
        console.log('[Studio] Waking up Render server:', renderUrl);
        
        // Send a simple ping request (timeout after 5 seconds, don't wait for response)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        fetch(`${renderUrl}/health`, {
            method: 'GET',
            signal: controller.signal,
        })
        .then(response => {
            clearTimeout(timeoutId);
            console.log('[Studio] Render server wake-up ping sent, status:', response.status);
        })
        .catch(error => {
            clearTimeout(timeoutId);
            // Silently fail - this is just a wake-up call
            console.log('[Studio] Render server wake-up ping (expected on cold start):', error.message);
        });
    } catch (error) {
        // Silently fail - this is not critical
        console.log('[Studio] Wake-up ping error (non-critical):', error);
    }
}
```

### **Cuándo se Ejecuta:**

```tsx
async function startSessionRecording() {
    // ...
    setIsRecording(true);

    // Wake up Render server (runs in background, doesn't block)
    wakeUpRenderServer(); // ← AQUÍ

    // Start timer
    recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
    }, 1000) as any;

    // Start flow...
    startPlaying();
}
```

---

## 📊 Flujo de Usuario

### **Antes:**
1. Usuario inicia grabación en Modo Estudio
2. Graba durante 2-3 minutos
3. Presiona "Guardar"
4. ❌ **Error: Network request failed** (servidor dormido)
5. Usuario pierde la grabación

### **Ahora:**
1. Usuario inicia grabación en Modo Estudio
2. ✅ **Ping enviado al servidor** (se despierta en background)
3. Graba durante 2-3 minutos (servidor ya está despierto)
4. Presiona "Guardar"
5. ✅ **Servidor responde inmediatamente**
6. ✅ Grabación guardada exitosamente

---

## 🎯 Características

### **No Bloqueante:**
- El ping se envía en background
- No espera respuesta
- No afecta la experiencia del usuario

### **Timeout de 5 Segundos:**
- Si el servidor no responde en 5 segundos, se cancela
- No causa delays innecesarios

### **Manejo Silencioso de Errores:**
- Si el ping falla, no muestra error al usuario
- Solo registra en consola para debugging
- La grabación continúa normalmente

### **Endpoint Health:**
- El servidor ya tiene `/health` endpoint
- Responde con: `{ status: 'ok', timestamp: '...' }`
- Ligero y rápido

---

## 🧪 Testing

### **Test 1: Primera Grabación del Día**
1. Servidor dormido (no usado en 15+ minutos)
2. Iniciar grabación en Modo Estudio
3. ✅ Ver en consola: `[Studio] Waking up Render server: https://...`
4. Grabar durante 1-2 minutos
5. Guardar grabación
6. ✅ Debe guardar exitosamente (servidor ya despierto)

### **Test 2: Grabaciones Consecutivas**
1. Servidor ya despierto
2. Iniciar nueva grabación
3. ✅ Ping se envía igual (no hace daño)
4. Guardar debe ser instantáneo

### **Test 3: Sin Conexión**
1. Desactivar internet
2. Iniciar grabación
3. ✅ Ping falla silenciosamente
4. ✅ Grabación continúa normal
5. Al guardar, mostrará error de red (comportamiento esperado)

---

## 📝 Logs de Debug

Cuando se inicia una grabación, verás:

```
[Studio] Waking up Render server: https://script-cue-merge-server.onrender.com
```

**Si el servidor está dormido:**
```
[Studio] Render server wake-up ping (expected on cold start): AbortError
```

**Si el servidor está despierto:**
```
[Studio] Render server wake-up ping sent, status: 200
```

---

## 💡 Beneficios

1. ✅ **Elimina errores de cold start** - Servidor listo cuando se necesita
2. ✅ **Experiencia fluida** - Usuario no nota el proceso
3. ✅ **No bloqueante** - No afecta el inicio de grabación
4. ✅ **Robusto** - Maneja errores silenciosamente
5. ✅ **Simple** - Solo 30 líneas de código

---

## 🔄 Aplicable a Otros Modos

Esta técnica se puede aplicar a:
- **Modo Casting** - Ping al iniciar grabación de video
- **Modo Coach** - Ping al abrir la pantalla de análisis

---

🚀✨ **¡Servidor siempre listo cuando lo necesitas!**
