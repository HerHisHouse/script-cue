# 🎬 Modo Casting - Error 504 Gateway Timeout

## 🐛 Problema Identificado

### **Error:**
```
504 Gateway Timeout
Processing failed: 504
```

### **Causa:**
El servidor de Render.com tarda demasiado en procesar el video y Cloudflare corta la conexión después de ~100 segundos.

---

## 🔍 Por Qué Ocurre

### **1. Servidor Gratuito de Render**
- Se "duerme" después de 15 minutos de inactividad
- Tarda ~30-60 segundos en "despertar"
- Durante ese tiempo, las peticiones dan timeout

### **2. Procesamiento de Video con FFmpeg**
- Mezclar video + múltiples audios es intensivo
- Puede tardar 1-3 minutos dependiendo de:
  - Duración del video
  - Número de líneas de diálogo
  - Calidad del video

### **3. Timeout de Cloudflare**
- Cloudflare (proxy de Render) tiene timeout de ~100 segundos
- Si el servidor no responde en ese tiempo → 504

---

## ✅ Solución Implementada

### **1. Timeout Extendido (3 minutos)**
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 min

const response = await fetch(url, {
  method: 'POST',
  body: formData,
  signal: controller.signal,
});
```

### **2. Detección Específica de Timeout**
```typescript
// Detectar 504 (Gateway Timeout) y 524 (Cloudflare Timeout)
if (response.status === 504 || response.status === 524) {
  throw new Error('El servidor tardó demasiado...');
}
```

### **3. Mensajes Claros al Usuario**

**Timeout del servidor (504/524):**
```
"El servidor tardó demasiado en procesar el video. 
Esto suele ocurrir cuando el servidor está iniciándose 
(tarda ~1 minuto). Por favor, espera un momento e 
inténtalo de nuevo."
```

**Timeout del cliente (3 minutos):**
```
"El procesamiento tardó más de 3 minutos. Esto puede 
ocurrir con videos largos o si el servidor está ocupado. 
Intenta con un video más corto o espera unos minutos 
y vuelve a intentarlo."
```

---

## 🔄 Flujo Actualizado

```
Usuario graba video en Modo Casting
    ↓
Termina grabación
    ↓
Sube video + audios a Render
    ↓
Render procesa (puede tardar):
    - 30-60s si está "dormido" (despertar)
    - 30-120s procesamiento FFmpeg
    ↓
Si tarda > 100s → Cloudflare timeout (504)
    ↓
App detecta 504 y muestra mensaje claro ✅
    ↓
Usuario espera 1 minuto e intenta de nuevo
    ↓
Servidor ya está "despierto" → Procesa rápido ✅
```

---

## 💡 Recomendaciones para el Usuario

### **Si aparece error 504:**
1. ⏱️ **Espera 1-2 minutos** (el servidor se está iniciando)
2. 🔄 **Intenta de nuevo** (ahora debería funcionar)
3. 📹 **Si persiste**, graba un video más corto

### **Para evitar el problema:**
- Graba escenas cortas (< 2 minutos)
- Espera unos segundos entre grabaciones
- Si el servidor está "dormido", la primera grabación puede fallar

---

## 🚀 Soluciones Futuras (Opcionales)

### **Opción 1: Procesamiento Asíncrono**
```
1. Subir video
2. Servidor procesa en background
3. App consulta cada 5s si está listo
4. Cuando termina, descarga el video
```

**Ventajas:**
- ✅ No hay timeouts
- ✅ Puede procesar videos largos

**Desventajas:**
- ❌ Más complejo de implementar
- ❌ Requiere polling o websockets

### **Opción 2: Servidor Siempre Activo**
```
Pagar plan de Render ($7/mes)
- Servidor nunca se duerme
- Respuesta más rápida
```

### **Opción 3: Procesamiento Local**
```
Usar FFmpeg en el dispositivo
- No depende del servidor
- Más rápido
```

**Desventajas:**
- ❌ Muy complejo de implementar
- ❌ Consume batería
- ❌ Puede no funcionar en todos los dispositivos

---

## 📊 Estadísticas de Timeout

| Escenario | Tiempo | Resultado |
|-----------|--------|-----------|
| Servidor despierto, video corto | 10-30s | ✅ OK |
| Servidor despierto, video largo | 30-90s | ✅ OK |
| Servidor dormido, video corto | 60-90s | ⚠️ Puede timeout |
| Servidor dormido, video largo | 90-180s | ❌ Timeout probable |

---

## 🗂️ Archivos Modificados

**`/app/scripts/[id]/casting.tsx`**
- Agregado `AbortController` con timeout de 3 minutos
- Detección específica de errores 504/524
- Mensajes de error más claros y útiles

---

## ✨ Resultado

**Ahora el usuario:**
1. ✅ Recibe un mensaje claro cuando hay timeout
2. ✅ Sabe que debe esperar y reintentar
3. ✅ Entiende por qué ocurre el error
4. ✅ Tiene un timeout más largo (3 min vs 100s)

**El servidor:**
- ✅ Tiene más tiempo para procesar
- ✅ Puede manejar videos más largos
- ⚠️ Sigue teniendo el problema de "despertar"

---

**Recomendación:** Si el problema persiste frecuentemente, considera implementar procesamiento asíncrono o actualizar a un plan de servidor que no se duerma.

🎬🎥✨
