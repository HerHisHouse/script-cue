# 🎤 Fix: Selección de Voces en Cuentas Nuevas

## ❌ Problema Identificado

Al importar un guion en una cuenta nueva y seleccionar voces para los personajes:
- ✅ Voces de OpenAI y ElevenLabs se guardaban correctamente
- ❌ **Voces del Sistema (System)** NO se guardaban correctamente
- ❌ Siempre usaba OpenAI por defecto

**Causa:**
Cuando se seleccionaba una voz del sistema, el campo `voiceProvider` se guardaba como `undefined` en lugar de `'system'`, causando que la base de datos lo guardara como `null`.

---

## ✅ Solución Aplicada

### **Cambio en `/app/import-script.tsx`:**

**Antes:**
```tsx
if (provider === 'system') {
  updateCharacter(index, {
    systemVoiceId: voiceId,
    voiceId: voiceId,
    voiceProvider: undefined,  // ❌ Se guardaba como null en BD
  });
}
```

**Ahora:**
```tsx
if (provider === 'system') {
  updateCharacter(index, {
    systemVoiceId: voiceId,
    voiceId: voiceId,
    voiceProvider: 'system',  // ✅ Se guarda correctamente
  });
}
```

### **Cambio en el provider del VoiceSelector:**

**Antes:**
```tsx
provider={(char.provider || 'openai') as 'openai' | 'elevenlabs' | 'system'}
```

**Ahora:**
```tsx
provider={(char.voiceProvider || char.provider || 'openai') as 'openai' | 'elevenlabs' | 'system'}
```

Esto asegura que se lea primero `voiceProvider` (el campo correcto) antes de `provider`.

---

## 🔍 Lógica de Prioridad

La app usa esta prioridad para seleccionar la voz:

```
1. character.voice_id + character.voice_provider (BD) ← Máxima prioridad
2. characterConfig (settings)
3. ttsProvider global (settings)
4. Fallback a OpenAI
```

**Ejemplo:**
```tsx
if (character?.voice_id && character?.voice_provider) {
    // Usar voz del personaje (guardada en BD)
    effectiveProvider = character.voice_provider;  // 'system', 'openai', 'elevenlabs'
    voiceId = character.voice_id;
} else if (characterConfig?.provider) {
    // Usar configuración de settings
    effectiveProvider = characterConfig.provider;
} else {
    // Fallback a configuración global
    effectiveProvider = ttsProvider;
}
```

---

## 📊 Estructura en Base de Datos

### **Tabla `characters`:**

| Campo | Tipo | Ejemplo OpenAI | Ejemplo System | Ejemplo ElevenLabs |
|-------|------|----------------|----------------|-------------------|
| `voice_id` | string | "nova" | "com.apple.voice.compact.es-ES.Monica" | "21m00Tcm4TlvDq8ikWAM" |
| `voice_provider` | string | "openai" | **"system"** | "elevenlabs" |

**Antes del fix:**
```json
{
  "voice_id": "com.apple.voice.compact.es-ES.Monica",
  "voice_provider": null  // ❌ NULL causaba que usara OpenAI
}
```

**Después del fix:**
```json
{
  "voice_id": "com.apple.voice.compact.es-ES.Monica",
  "voice_provider": "system"  // ✅ Correcto
}
```

---

## 🧪 Testing

### **Test 1: Cuenta Nueva - Voz del Sistema**
1. Crear cuenta nueva o usar cuenta de prueba
2. Importar un guion PDF
3. En configuración de personaje, seleccionar **"Voz del Sistema"**
4. Elegir una voz (ej: "Mónica" o "Jorge")
5. Guardar guion
6. ✅ Abrir Modo Estudio
7. ✅ Reproducir → Debe usar la voz del sistema seleccionada

### **Test 2: Cuenta Nueva - Voz de OpenAI**
1. Importar guion
2. Seleccionar **"OpenAI"**
3. Elegir voz (ej: "Nova")
4. Guardar
5. ✅ Debe usar voz "Nova" de OpenAI

### **Test 3: Cuenta Nueva - Voz de ElevenLabs**
1. Importar guion
2. Seleccionar **"ElevenLabs"**
3. Elegir voz de la lista
4. Guardar
5. ✅ Debe usar voz de ElevenLabs

### **Test 4: Verificar en Base de Datos**
```sql
SELECT name, voice_id, voice_provider 
FROM characters 
WHERE script_id = 'tu-script-id';
```

Debe mostrar:
```
name          | voice_id                                    | voice_provider
------------- | ------------------------------------------- | --------------
RUBÍ          | com.apple.voice.compact.es-ES.Monica        | system
ALEX          | nova                                        | openai
OTRO          | 21m00Tcm4TlvDq8ikWAM                        | elevenlabs
```

---

## 🎯 Logs de Debug

Cuando reproduces audio, deberías ver en consola:

**Voz del Sistema:**
```
[Studio] Using character voice: com.apple.voice.compact.es-ES.Monica (system)
[Studio] Using system TTS for RUBÍ, voiceId: com.apple.voice.compact.es-ES.Monica
```

**Voz de OpenAI:**
```
[Studio] Using character voice: nova (openai)
[Studio] Attempting to get cached audio for line...
```

**Voz de ElevenLabs:**
```
[Studio] Using character voice: 21m00Tcm4TlvDq8ikWAM (elevenlabs)
[Studio] Attempting to get cached audio for line...
```

---

## 💡 Por Qué Funcionaba en Tu Cuenta

Tu cuenta de siempre probablemente tiene:
- Guiones importados antes del bug
- Configuración en `appSettings` que sobrescribe
- Cache de voces que funcionaba

Las cuentas nuevas:
- No tienen configuración previa
- Dependen 100% de `voice_provider` en BD
- El bug era más evidente

---

## 🚀 Próximos Pasos

**Recarga la app** y prueba con una cuenta nueva:

1. Importar guion
2. Seleccionar diferentes tipos de voces
3. ✅ Todas deben funcionar correctamente
4. ✅ Verificar en BD que `voice_provider` se guarda correctamente

---

🎤✨ **¡Ahora las voces se guardan correctamente en todas las cuentas!**
