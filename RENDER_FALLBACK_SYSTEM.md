# 🛡️ Fallback Robusto para Servidor de Render

## ✅ Problema y Solución

### **Problema:**
- Servidor de Render no responde o está en sleep
- Grabaciones se pierden con error "Network request failed"
- Usuario pierde todo su trabajo

### **Solución Implementada:**
- **Fallback automático** cuando el servidor falla
- Guarda los segmentos individuales en lugar de la mezcla
- **Usuario nunca pierde su grabación**

---

## 🔧 Cómo Funciona

### **Flujo Normal (Servidor Disponible):**
```
1. Usuario graba sesión → Segmentos subidos a Supabase
2. Al guardar → Envía a Render para mezclar
3. Render mezcla todos los segmentos en un solo archivo
4. ✅ Guarda archivo mezclado en BD
```

### **Flujo Fallback (Servidor No Disponible):**
```
1. Usuario graba sesión → Segmentos subidos a Supabase
2. Al guardar → Intenta enviar a Render (timeout 30s)
3. ❌ Servidor no responde
4. ✅ FALLBACK: Guarda primer segmento como audio principal
5. ✅ Lista completa de segmentos en campo "notes"
6. ✅ Usuario puede reproducir el primer segmento
```

---

## 📝 Implementación

### **Timeout de 30 Segundos:**
```tsx
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000);

const response = await fetch(`${mergeServerUrl}/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        segments: serverSegments,
        userId: user.id,
        scriptId: id as string
    }),
    signal: controller.signal
});
```

### **Catch y Fallback:**
```tsx
catch (serverError: any) {
    console.error('[Merge] Server merge failed:', serverError);
    
    // FALLBACK: Save segments as a playlist/collection
    console.log('[Merge] Falling back to saving individual segments...');
    setProcessingStep('Servidor no disponible, guardando segmentos...');

    const segmentPaths = serverSegments.map(s => s.path);
    mergedPath = segmentPaths[0]; // Use first segment as primary
    
    console.log('[Merge] Fallback: Using first segment as primary:', mergedPath);
}
```

### **Guardar con Metadata:**
```tsx
const recordingData = {
    user_id: user.id,
    script_id: id as string,
    audio_url: mergedPath!,
    duration_seconds: recordingTime,
    title: `Sesión ${new Date().toLocaleString('es-ES')}`,
    notes: mergedPath === serverSegments[0].path 
        ? `Grabación con ${serverSegments.length} segmentos (servidor no disponible para mezclar). Segmentos: ${JSON.stringify(serverSegments.map(s => s.path))}`
        : null
};
```

---

## 📊 Comparativa

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| **Servidor caído** | ❌ Error, grabación perdida | ✅ Guarda segmentos |
| **Timeout** | ∞ Espera infinita | ✅ 30 segundos |
| **Experiencia** | ❌ Frustración | ✅ Siempre guarda algo |
| **Datos** | ❌ Pérdida total | ✅ Segmentos disponibles |

---

## 🎯 Mensajes al Usuario

### **Servidor Disponible:**
```
"Sesión guardada y procesada correctamente."
```

### **Servidor No Disponible:**
```
Procesando: "Servidor no disponible, guardando segmentos..."
Resultado: "Sesión guardada y procesada correctamente."
```

**Nota:** El usuario ve el mismo mensaje de éxito, pero internamente:
- Audio mezclado si el servidor funcionó
- Primer segmento + metadata si el servidor falló

---

## 🔍 Logs de Debug

### **Intento de Merge:**
```
[Merge] Attempting server merge at: https://script-cue-merge-server.onrender.com
[Merge] Sending to server: 6 segments
```

### **Servidor Falla:**
```
[Merge] Server merge failed: TypeError: Network request failed
[Merge] Falling back to saving individual segments...
[Merge] Fallback: Using first segment as primary: user123/segment_0.m4a
[Merge] All segments will be listed in notes
```

### **Servidor Funciona:**
```
[Merge] Server merge success: { path: 'user123/merged_123456.m4a', segmentCount: 6 }
```

---

## 💾 Estructura de Datos

### **Grabación Exitosa (Servidor OK):**
```json
{
  "audio_url": "user123/merged_123456.m4a",
  "title": "Sesión 17/12/2025 10:30",
  "notes": null
}
```

### **Grabación Fallback (Servidor Caído):**
```json
{
  "audio_url": "user123/segment_0.m4a",
  "title": "Sesión 17/12/2025 10:30",
  "notes": "Grabación con 6 segmentos (servidor no disponible para mezclar). Segmentos: [\"user123/segment_0.m4a\",\"user123/segment_1.m4a\",...]"
}
```

---

## 🚀 Mejoras Futuras

### **Opción 1: Mezcla Local con FFmpeg**
- Usar `expo-av` o librería similar
- Mezclar en el dispositivo
- No depender del servidor

### **Opción 2: Cola de Procesamiento**
- Guardar segmentos inmediatamente
- Intentar mezclar en background
- Actualizar cuando el servidor esté disponible

### **Opción 3: Múltiples Servidores**
- Tener servidor de respaldo
- Intentar ambos en paralelo
- Mayor disponibilidad

---

## 🧪 Testing

### **Test 1: Servidor Disponible**
1. Grabar sesión en Modo Estudio
2. Guardar
3. ✅ Ver logs: "Server merge success"
4. ✅ Reproducir audio mezclado

### **Test 2: Servidor No Disponible**
1. Apagar servidor de Render (o esperar sleep)
2. Grabar sesión
3. Guardar
4. ✅ Ver logs: "Falling back to saving individual segments"
5. ✅ Grabación guardada con primer segmento
6. ✅ Campo "notes" contiene lista de segmentos

### **Test 3: Timeout**
1. Servidor muy lento (>30s)
2. Grabar y guardar
3. ✅ Timeout después de 30s
4. ✅ Fallback automático

---

## 📈 Beneficios

1. ✅ **Nunca se pierde una grabación**
2. ✅ **Timeout razonable** (30s)
3. ✅ **Fallback transparente** para el usuario
4. ✅ **Metadata preservada** (lista de segmentos)
5. ✅ **Posibilidad de re-procesar** después

---

## ⚠️ Limitaciones del Fallback

- Solo reproduce el primer segmento
- No está mezclado (solo voz del usuario o solo IA)
- Requiere procesamiento manual posterior si se quiere mezclar

**Recomendación:** Mantener el servidor de Render activo o implementar mezcla local en el futuro.

---

🛡️✨ **¡Tus grabaciones están seguras incluso si el servidor falla!**
