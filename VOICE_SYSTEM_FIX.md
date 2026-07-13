# 🔧 Corrección del Sistema de Voces - TTS Cache

## ✅ Problema Identificado

El sistema de voces estaba guardando correctamente el `voice_id` y `voice_provider` en la base de datos, pero **no los estaba usando** al reproducir el audio en los diferentes modos de la app. Siempre usaba la voz por defecto.

---

## 🎯 Archivos Modificados

### 1. **`/app/scripts/[id]/studio-v2.tsx`**
**Cambios:**
- Ahora busca el personaje en la base de datos para obtener `voice_id` y `voice_provider`
- **Prioridad**: `character.voice_id` > `characterVoices` (settings) > global setting
- Pasa el `voiceId` correcto a `getCachedAudio()` y `generateAndCacheAudio()`

**Antes:**
```tsx
const voiceId = null; // ❌ Siempre null
```

**Ahora:**
```tsx
if (character?.voice_id && character?.voice_provider) {
  effectiveProvider = character.voice_provider;
  voiceId = character.voice_id; // ✅ Usa la voz del personaje
}
```

---

### 2. **`/app/scripts/[id]/casting.tsx`**
**Cambios:**
- Actualizado el cache check para usar `voice_id` del personaje
- Actualizado el fallback de System TTS para usar `voice_id`

**Ubicaciones:**
- Línea ~296: Cache check background
- Línea ~428: Fallback System TTS

---

### 3. **`/app/scripts/[id]/car.tsx`**
**Cambios:**
- Agregado estado `characters` para cargar personajes de la BD
- Actualizado para usar `voice_id` del personaje al buscar en cache
- Determina `effectiveProvider` y `voiceId` antes de llamar a `getCachedAudio()`

---

### 4. **`/types/database.ts`**
**Cambios:**
- Actualizado tipo `voice_provider` para incluir `'system'`

**Antes:**
```tsx
voice_provider: 'openai' | 'elevenlabs' | null;
```

**Ahora:**
```tsx
voice_provider: 'openai' | 'elevenlabs' | 'system' | null;
```

---

## 🔄 Flujo Actualizado

### **Al importar un guion:**
1. Usuario selecciona **Operador de voces** (OpenAI/ElevenLabs/System)
2. Usuario selecciona **Voz del personaje** (muestra solo voces del operador)
3. Se guarda en BD: `voice_id` + `voice_provider`

### **Al reproducir en cualquier modo:**
1. Se carga el personaje de la BD
2. Se obtiene `voice_id` y `voice_provider`
3. Se busca en cache con esos parámetros exactos
4. Si no existe, se genera con esa voz específica

---

## ✅ Prioridad de Configuración

```
1. character.voice_id + character.voice_provider (BD) ← NUEVO
2. characterVoices config (settings)
3. global ttsProvider setting
```

---

## 🧪 Testing

1. **Importar nuevo guion**
2. **Configurar personaje con voz de OpenAI** (ej: "Nova")
3. **Abrir Modo Estudio** → Verificar que suena "Nova"
4. **Cambiar a ElevenLabs** y seleccionar otra voz
5. **Abrir Modo Casting** → Verificar que suena la voz de ElevenLabs
6. **Abrir Modo Car** → Verificar que suena la voz correcta

---

## 📝 Logs para Debug

Ahora verás en la consola:
```
[Studio] Using character voice: nova (openai)
[Casting] Using character voice: 21m00Tcm4TlvDq8ikWAM (elevenlabs)
[Car Mode] Using character voice: alloy (openai)
```

---

🎤🎭✨ **¡Sistema de voces completamente funcional!**
