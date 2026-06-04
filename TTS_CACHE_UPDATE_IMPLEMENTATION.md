# Actualización de TTS Cache - Modo Estudio y Editor

## Fecha: 2026-01-21

## Objetivo

Asegurar que cuando se edita o crea una línea de diálogo en el Modo Estudio o en el Editor de texto, el audio TTS se regenere automáticamente y esté disponible en todos los modos de la aplicación.

## Problemas Solucionados

### 1. ✅ Edición de Líneas en Modo Estudio

**Problema:** Al editar el contenido de una línea de diálogo en el modo estudio, el audio TTS antiguo permanecía en caché y no se regeneraba con el nuevo texto.

**Solución Implementada:**

1. **Nueva función `invalidateCacheForLine` en `utils/ttsCache.ts`:**
   - Elimina todas las entradas de caché TTS para una línea específica
   - Borra los archivos de audio del Storage de Supabase
   - Limpia los registros de la tabla `tts_cache`

2. **Actualización de `saveEditedLine` en `studio-v2.tsx`:**
   - Invalida el caché TTS de la línea editada
   - Obtiene la configuración de voz del personaje
   - Regenera el audio TTS automáticamente en segundo plano
   - Muestra mensaje al usuario indicando que el audio se regenerará

**Código agregado:**
```typescript
// En saveEditedLine()
await invalidateCacheForLine(editingLineId);

// Get character info to regenerate TTS
const editedLine = dialogueLines.find(l => l.id === editingLineId);
if (editedLine && !editedLine.isUserCharacter && user?.id) {
    const { data: character } = await supabase
        .from('characters')
        .select('voice_provider, voice_id, voice_gender')
        .eq('script_id', id as string)
        .ilike('name', editedLine.characterName)
        .single();

    if (character) {
        const voiceConfig = {
            provider: (character.voice_provider || 'openai') as 'openai' | 'elevenlabs' | 'system',
            voiceId: character.voice_id || undefined
        };

        generateAndCacheAudio(
            id as string,
            editingLineId,
            editedLine.characterName,
            editedText.trim(),
            voiceConfig,
            user.id
        ).catch(err => {
            console.error('Error regenerating TTS:', err);
        });
    }
}
```

---

### 2. ✅ Creación de Nuevas Líneas en Modo Estudio

**Problema:** Al crear una nueva línea de diálogo usando el botón "+" en el modo estudio, no se generaba el audio TTS automáticamente, por lo que no estaba disponible en otros modos hasta que se regenerara manualmente.

**Solución Implementada:**

1. **Actualización de `createNewLine` en `studio-v2.tsx`:**
   - Después de insertar la nueva línea en la base de datos
   - Verifica si es un personaje AI (no usuario)
   - Obtiene la configuración de voz del personaje
   - Genera el audio TTS automáticamente en segundo plano

**Código agregado:**
```typescript
// En createNewLine()
if (newLine && !selectedCharacter.is_user_character && user?.id) {
    console.log('🎙️ Generating TTS for new line...');
    
    const voiceConfig = {
        provider: (selectedCharacter.voice_provider || 'openai') as 'openai' | 'elevenlabs' | 'system',
        voiceId: selectedCharacter.voice_id || undefined
    };

    generateAndCacheAudio(
        id as string,
        newLine.id,
        selectedCharacter.name,
        newLineText.trim(),
        voiceConfig,
        user.id
    ).catch(err => {
        console.error('Error generating TTS for new line:', err);
    });
}
```

---

### 3. ✅ Edición desde el Editor de Texto

**Problema:** Al editar el guion desde el Editor de texto y guardar, las escenas y líneas se regeneraban pero el caché TTS antiguo permanecía, causando inconsistencias.

**Solución Implementada:**

1. **Actualización de `parse-pdf/index.ts` (Edge Function):**
   - Antes de eliminar las escenas existentes
   - Limpia todo el caché TTS del script
   - Esto asegura que se genere audio fresco para las nuevas líneas

**Código agregado:**
```typescript
// En parse-pdf edge function
console.log('Clearing TTS cache for script:', scriptId);
const { error: cacheDeleteError } = await supabaseAdmin
    .from('tts_cache')
    .delete()
    .eq('script_id', scriptId);

if (cacheDeleteError) {
    console.warn('Warning: Could not clear TTS cache:', cacheDeleteError);
}
```

---

## Archivos Modificados

### 1. `/utils/ttsCache.ts`
- **Agregado:** Función `invalidateCacheForLine(lineId: string)`
- **Propósito:** Invalidar y eliminar todo el caché TTS de una línea específica

### 2. `/app/scripts/[id]/studio-v2.tsx`
- **Agregado:** Import de `invalidateCacheForLine` y `generateAndCacheAudio`
- **Modificado:** Función `saveEditedLine()` - Invalida caché y regenera TTS
- **Modificado:** Función `createNewLine()` - Genera TTS para nuevas líneas
- **Mensajes actualizados:** Informan al usuario que el TTS se regenerará automáticamente

### 3. `/supabase/functions/parse-pdf/index.ts`
- **Modificado:** Limpia el caché TTS antes de regenerar escenas y líneas
- **Propósito:** Asegurar que el audio antiguo se elimine cuando se edita desde el editor

---

## Flujo de Actualización de TTS

### Escenario 1: Editar línea en Modo Estudio

1. Usuario edita el texto de una línea
2. Usuario guarda los cambios
3. **Sistema:**
   - Actualiza el contenido en la tabla `lines`
   - Invalida el caché TTS de esa línea específica
   - Obtiene la configuración de voz del personaje
   - Genera nuevo audio TTS en segundo plano
   - Guarda el nuevo audio en Supabase Storage
   - Registra el nuevo caché en la tabla `tts_cache`
4. **Resultado:** El nuevo audio está disponible en todos los modos

### Escenario 2: Crear nueva línea en Modo Estudio

1. Usuario crea una nueva línea con el botón "+"
2. Usuario selecciona personaje y escribe el texto
3. **Sistema:**
   - Inserta la nueva línea en la tabla `lines`
   - Verifica si es un personaje AI
   - Obtiene la configuración de voz del personaje
   - Genera audio TTS en segundo plano
   - Guarda el audio en Supabase Storage
   - Registra el caché en la tabla `tts_cache`
4. **Resultado:** El audio está disponible inmediatamente en todos los modos

### Escenario 3: Editar desde Editor de Texto

1. Usuario edita el HTML del guion en el Editor
2. Usuario guarda los cambios
3. **Sistema:**
   - Llama a la función `parse-pdf` para regenerar estructura
   - `parse-pdf` limpia TODO el caché TTS del script
   - Elimina todas las escenas y líneas antiguas
   - Genera nuevas escenas y líneas con nuevos IDs
   - Las líneas nuevas no tienen caché TTS
4. **Próxima vez que se use el script:**
   - El sistema detectará que no hay caché TTS
   - Generará audio fresco para todas las líneas AI

---

## Consideraciones Técnicas

### Generación en Segundo Plano

- La generación de TTS se ejecuta de forma asíncrona (`.catch()`)
- No bloquea la UI del usuario
- Los errores se registran en consola pero no interrumpen el flujo

### Configuración de Voz

La configuración de voz se obtiene en este orden de prioridad:
1. `voice_id` y `voice_provider` del personaje en la tabla `characters`
2. Configuración por defecto basada en `voice_gender`
3. OpenAI con voz "alloy" como último recurso

### Caché TTS

- **Tabla:** `tts_cache`
- **Campos clave:**
  - `line_id`: ID de la línea (FK)
  - `script_id`: ID del script
  - `provider`: 'openai' | 'elevenlabs' | 'system'
  - `voice_id`: ID de la voz específica
  - `text_hash`: Hash SHA-256 del texto (para detectar cambios)
  - `storage_path`: Ruta del archivo en Supabase Storage

### Validación de Caché

El sistema valida el caché comparando el `text_hash`:
- Si el texto cambió, el caché se invalida automáticamente
- Esto previene usar audio antiguo para texto nuevo

---

## Mensajes al Usuario

### Edición de Línea
```
"Línea actualizada correctamente. El audio TTS se regenerará automáticamente."
```

### Creación de Línea
```
"Nueva línea añadida correctamente. El audio TTS se generará automáticamente."
```

Estos mensajes informan al usuario que:
1. La acción se completó exitosamente
2. El audio TTS se está procesando en segundo plano
3. No necesitan hacer nada más

---

## Verificación

Para verificar que todo funciona correctamente:

1. **Editar una línea en Modo Estudio:**
   - Edita el texto de una línea de diálogo
   - Guarda los cambios
   - Ve a otro modo (Coach, Memory, etc.)
   - Verifica que el audio TTS refleja el nuevo texto

2. **Crear una nueva línea en Modo Estudio:**
   - Crea una nueva línea con el botón "+"
   - Selecciona un personaje AI
   - Escribe el texto
   - Ve a otro modo
   - Verifica que el audio TTS está disponible

3. **Editar desde el Editor:**
   - Edita el guion en el Editor de texto
   - Guarda los cambios
   - Ve al Modo Estudio
   - Verifica que las tarjetas se actualizaron
   - Reproduce el audio en cualquier modo
   - Verifica que el audio se genera correctamente

---

## Logs de Depuración

El sistema registra los siguientes logs para facilitar la depuración:

```typescript
// Al invalidar caché
'🗑️ Invalidating TTS cache for line:', lineId
'✅ Invalidated N cache entries for line'

// Al regenerar TTS
'🎙️ Regenerating TTS for edited line...'
'🎙️ Generating TTS for new line...'

// En parse-pdf
'Clearing TTS cache for script:', scriptId
```

Estos logs ayudan a rastrear el flujo de invalidación y regeneración del caché TTS.
