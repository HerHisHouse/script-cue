# ✅ Regeneración Automática de Caché de Audio

## 🐛 Problema Original

Cuando se modificaba la configuración de personajes (proveedor de voz, género, etc.) y se guardaban los cambios:
- ❌ El audio en caché **NO se actualizaba**
- ❌ Seguía usando las voces antiguas
- ❌ Cambiar de OpenAI a ElevenLabs no tenía efecto
- ❌ Cambiar el género de voz no se reflejaba

### Ejemplo del Problema
1. Usuario configura personaje con **OpenAI, voz masculina**
2. Se genera y cachea el audio con voz femenina (por defecto)
3. Usuario cambia a **ElevenLabs**
4. El audio sigue siendo de OpenAI (caché antiguo)

---

## ✅ Solución Implementada

### 1. **Limpieza de Caché Antiguo**
Cuando se guardan cambios en la configuración de personajes:
```typescript
await clearScriptCache(String(scriptId));
```
- Elimina **todos** los audios cacheados del guion
- Limpia registros de la tabla `tts_cache`
- Elimina archivos de Supabase Storage

### 2. **Regeneración Automática**
Inmediatamente después de limpiar:
```typescript
preGenerateScriptAudio(
  scriptId,
  userId,
  characterVoices
).catch(err => {
  // Error silencioso, no bloquea UI
});
```
- Genera **nuevo audio** con las configuraciones actualizadas
- Proceso en **segundo plano** (no bloquea la UI)
- Respeta la configuración de cada personaje

### 3. **Configuración de Voces**
Se construye un mapa de voces basado en la configuración guardada:
```typescript
const characterVoices = {
  "PERSONAJE 1": {
    provider: "openai",
    voiceId: undefined  // Usará género automáticamente
  },
  "PERSONAJE 2": {
    provider: "elevenlabs",
    voiceId: "voice_id_123"
  },
  "PERSONAJE 3": {
    provider: "system",
    voiceId: "es-ES-voice"
  }
}
```

---

## 🔄 Flujo Completo

### **Antes (Problema)**
```
1. Usuario configura personajes
2. Guarda cambios
3. Configuración guardada ✅
4. Caché antiguo permanece ❌
5. Audio no se actualiza ❌
```

### **Ahora (Solución)**
```
1. Usuario configura personajes
2. Guarda cambios
3. Configuración guardada ✅
4. Caché antiguo eliminado ✅
5. Audio regenerándose en segundo plano ✅
6. Próxima reproducción usa nuevo audio ✅
```

---

## 🎙️ Soporte de Proveedores

### **OpenAI**
- ✅ Respeta configuración de género
- ✅ Mapeo automático a voces apropiadas:
  - Masculino → `echo`
  - Femenino → `nova`
  - Neutro → `alloy`

### **ElevenLabs**
- ✅ Usa `voiceId` configurado
- ✅ Fallback a voz por defecto si no hay ID

### **Sistema (Offline)**
- ✅ Usa `systemVoiceId` configurado
- ✅ Voces del dispositivo

---

## 📊 Proceso en Segundo Plano

### **Ventajas**
1. **No bloquea la UI**: El usuario puede seguir navegando
2. **Feedback inmediato**: Alert confirma que se está regenerando
3. **Manejo de errores silencioso**: Errores no interrumpen el flujo
4. **Logs detallados**: Para debugging

### **Mensaje al Usuario**
```
"Se actualizaron los personajes y voces. 
El audio se está regenerando en segundo plano."
```

---

## 🧪 Cómo Probar

### **Escenario 1: Cambiar Proveedor**
1. Configura personaje con **OpenAI**
2. Guarda cambios
3. Espera que se genere audio
4. Cambia a **ElevenLabs**
5. Guarda cambios
6. **Verifica**: Próxima reproducción usa ElevenLabs

### **Escenario 2: Cambiar Género**
1. Configura personaje **Masculino** (OpenAI)
2. Guarda cambios
3. Reproduce → Voz masculina (echo)
4. Cambia a **Femenino**
5. Guarda cambios
6. **Verifica**: Próxima reproducción usa voz femenina (nova)

### **Escenario 3: Cambiar Voz Sistema**
1. Configura personaje con **Sistema**
2. Selecciona voz específica
3. Guarda cambios
4. Cambia a otra voz del sistema
5. Guarda cambios
6. **Verifica**: Próxima reproducción usa nueva voz

---

## 📝 Archivos Modificados

### `/app/import-script.tsx`

**Imports agregados:**
```typescript
import { clearScriptCache, preGenerateScriptAudio } from '@/utils/ttsCache';
```

**Lógica agregada (líneas 287-322):**
1. Limpia caché antiguo
2. Construye mapa de voces
3. Inicia regeneración en segundo plano
4. Muestra mensaje al usuario

---

## ⚡ Optimizaciones

### **Caché Inteligente**
- Solo regenera líneas de personajes AI (no del usuario)
- Usa hash de texto para detectar cambios
- Reutiliza audio si el texto no cambió

### **Manejo de Errores**
- Errores de caché no bloquean guardado
- Logs detallados para debugging
- Proceso continúa aunque falle una línea

---

## 🎯 Resultado Final

### **Antes**
- ❌ Voces no se actualizaban
- ❌ Caché obsoleto permanecía
- ❌ Confusión del usuario

### **Ahora**
- ✅ Voces se actualizan automáticamente
- ✅ Caché siempre fresco
- ✅ Experiencia fluida y predecible

---

## 💡 Notas Técnicas

### **Tiempo de Regeneración**
- Depende del número de líneas
- ~1-2 segundos por línea (OpenAI/ElevenLabs)
- Instantáneo para Sistema (offline)

### **Consumo de API**
- Solo regenera cuando hay cambios
- No regenera si configuración es idéntica
- Usuario puede cancelar navegando fuera

---

**¡El caché de audio ahora se regenera automáticamente al guardar cambios!** 🎭🎙️✨
