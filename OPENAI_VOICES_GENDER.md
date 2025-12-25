# ✅ Voces de OpenAI por Género - Implementado

## 🐛 Problema Original

Cuando se configuraba un personaje con género **Masculino** o **Femenino** en OpenAI, siempre se generaba audio con voz femenina (alloy).

### Causa
- La función `preGenerateScriptAudio` usaba por defecto `{ provider: 'openai' }` sin especificar `voiceId`
- Esto hacía que siempre se usara 'alloy' (voz neutral/femenina) como fallback
- No se estaba consultando el campo `voice_gender` del personaje

---

## ✅ Solución Implementada

### 1. Función Helper: `getOpenAIVoiceByGender()`

Mapea el género del personaje a voces apropiadas de OpenAI:

```typescript
function getOpenAIVoiceByGender(gender: 'male' | 'female' | 'neutral' | null | undefined): string {
    if (gender === 'male') {
        return 'echo';  // Voz masculina profunda
    } else if (gender === 'female') {
        return 'nova';  // Voz femenina cálida
    }
    return 'alloy';  // Voz neutral
}
```

### 2. Voces de OpenAI Disponibles

| Voz | Género | Características |
|-----|--------|-----------------|
| **echo** | Masculino | Profunda, clara |
| **fable** | Masculino | Acento británico |
| **onyx** | Masculino | Grave, autoritaria |
| **nova** | Femenino | Cálida, amigable |
| **shimmer** | Femenino | Suave, delicada |
| **alloy** | Neutral | Versátil, equilibrada |

### 3. Lógica Actualizada en `preGenerateScriptAudio()`

Ahora la función:

1. **Obtiene el personaje** de la base de datos
2. **Lee `voice_gender`** del personaje
3. **Aplica la voz apropiada** según el género:
   - Si **no hay configuración** → Usa OpenAI con voz según género
   - Si **OpenAI sin voz específica** → Asigna voz según género
   - Si **hay configuración específica** → Respeta la configuración

```typescript
// Obtener personaje
const character = characters?.find(
    c => c.name.toLowerCase().trim() === line.character_name.toLowerCase().trim()
);

// Determinar voz
let voiceConfig = characterVoices[characterName];

if (!voiceConfig) {
    // Sin configuración → usar género
    const voiceId = getOpenAIVoiceByGender(character?.voice_gender);
    voiceConfig = { 
        provider: 'openai',
        voiceId
    };
} else if (voiceConfig.provider === 'openai' && !voiceConfig.voiceId) {
    // OpenAI sin voz → usar género
    voiceConfig = {
        ...voiceConfig,
        voiceId: getOpenAIVoiceByGender(character?.voice_gender)
    };
}
```

---

## 🎯 Comportamiento Actual

### Escenario 1: Sin Configuración de Voz
**Usuario no configura voz específica**
- Personaje Masculino → `echo` (voz masculina)
- Personaje Femenino → `nova` (voz femenina)
- Personaje Neutral → `alloy` (voz neutral)

### Escenario 2: OpenAI Seleccionado, Sin Voz Específica
**Usuario selecciona OpenAI pero no elige voz**
- Personaje Masculino → `echo`
- Personaje Femenino → `nova`
- Personaje Neutral → `alloy`

### Escenario 3: Voz Específica Configurada
**Usuario selecciona voz específica (ej: shimmer)**
- Se respeta la configuración del usuario
- No se aplica mapeo automático

---

## 📊 Mapeo de Géneros

### Base de Datos
```typescript
Character {
  voice_gender: 'male' | 'female' | 'neutral' | null
}
```

### OpenAI
```typescript
'male' → 'echo'      // Voz masculina profunda
'female' → 'nova'    // Voz femenina cálida
'neutral' → 'alloy'  // Voz neutral
null → 'alloy'       // Fallback neutral
```

---

## 🧪 Cómo Probar

1. **Crear/Editar un guion**
2. **Configurar personajes**:
   - Personaje A: Género Masculino
   - Personaje B: Género Femenino
   - Personaje C: Género Neutral
3. **Ir a Modo Estudio**
4. **Configurar voces**:
   - Seleccionar "OpenAI" como proveedor
   - NO seleccionar voz específica (dejar por defecto)
5. **Generar audio**
6. **Verificar**:
   - Personaje A → Voz masculina (echo)
   - Personaje B → Voz femenina (nova)
   - Personaje C → Voz neutral (alloy)

---

## 🎨 Mejoras Futuras (Opcional)

### 1. Variedad de Voces
Rotar entre voces del mismo género:
- Masculino: `echo`, `fable`, `onyx`
- Femenino: `nova`, `shimmer`

### 2. Configuración en UI
Permitir al usuario elegir qué voz usar para cada género en Ajustes.

### 3. Caché Inteligente
Regenerar audio si cambia el género del personaje.

---

## 📝 Archivos Modificados

- `/Users/alexdiaz/Documents/RS/utils/ttsCache.ts`
  - Agregada función `getOpenAIVoiceByGender()`
  - Actualizada lógica en `preGenerateScriptAudio()`

---

## ✅ Estado Actual

- ✅ Función helper implementada
- ✅ Mapeo de géneros funcionando
- ✅ Voces apropiadas por género
- ✅ Respeta configuración manual del usuario
- ✅ Fallback a 'alloy' para casos sin género

**¡Las voces de OpenAI ahora respetan el género configurado!** 🎭🎙️
