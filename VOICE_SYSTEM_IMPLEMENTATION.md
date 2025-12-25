# 🎤 Sistema de Voces - Implementación Actualizada

## ✅ Resumen de Cambios

### Archivos Creados:
1. **`/utils/voiceService.ts`** - Servicio de voces
2. **`/components/VoiceSelector.tsx`** - Componente selector de voces
3. **`/supabase/migrations/20251216_add_voice_fields_to_characters.sql`** - Migración DB

### Archivos Modificados:
1. **`/app/import-script.tsx`** - Reorganización de selectores
2. **`/utils/ttsCache.ts`** - Prioriza voice_id sobre gender
3. **`/types/database.ts`** - Añadido voice_id y voice_provider a Character
4. **`/utils/pdfParser.ts`** - Añadido voice_id y voice_provider

---

## 🔧 Configuración Necesaria

### 1. Ejecutar la Migración SQL
```sql
-- Ejecutar en Supabase SQL Editor:
ALTER TABLE characters ADD COLUMN IF NOT EXISTS voice_id TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS voice_provider TEXT;
```

### 2. API Keys (ya configuradas)
- **OpenAI**: `EXPO_PUBLIC_OPENAI_API_KEY`
- **ElevenLabs**: `EXPO_PUBLIC_ELEVENLABS_API_KEY`

---

## 🎯 Nuevo Flujo de Usuario

### Orden de los campos en la configuración de personajes:

1. **Nombre del personaje**
2. **Checkbox "Este es mi personaje"**
3. **Operador de voces** (OpenAI / ElevenLabs / Sistema)
4. **Voz del personaje** (voces según el operador seleccionado)
5. **Color**

### Comportamiento:

- Al seleccionar **OpenAI**: Muestra 6 voces disponibles con preview
- Al seleccionar **ElevenLabs**: Carga voces de la API con preview
- Al seleccionar **Sistema**: Muestra voces del dispositivo con preview

### Cambiar de operador:
- Limpia la voz seleccionada automáticamente
- Permite seleccionar una nueva voz del operador elegido

---

## 🎨 Voces Disponibles

### OpenAI (6 voces fijas)
| ID | Nombre | Género | Descripción |
|---|---|---|---|
| alloy | Alloy | Neutra | Voz neutra y versátil |
| echo | Echo | Masculino | Voz masculina profunda |
| fable | Fable | Masculino | Voz con acento británico |
| onyx | Onyx | Masculino | Voz masculina grave y seria |
| nova | Nova | Femenino | Voz femenina cálida |
| shimmer | Shimmer | Femenino | Voz femenina suave y clara |

### ElevenLabs
- Se cargan dinámicamente desde la API
- Incluye voces gratuitas y premium
- URLs de preview incluidas

### Sistema (Offline)
- Voces del dispositivo
- Funcionan sin conexión
- Varían según iOS/Android

---

## 🔊 Preview de Voces

Cada voz tiene un botón de altavoz para escuchar una muestra:

- **OpenAI**: Genera "Hola, esta es mi voz. ¿Qué te parece?"
- **ElevenLabs**: Usa la URL de preview de la API
- **Sistema**: Usa expo-speech para reproducir muestra

---

## 🔄 Compatibilidad

### Guiones Existentes:
- Siguen funcionando con `voice_gender`
- El sistema prioriza `voice_id` si existe

### Prioridad de Configuración:
```
1. character.voice_id + character.voice_provider (nuevo)
2. characterVoices config (settings)
3. gender-based default (legacy)
```

---

## 🧪 Testing

1. Importar nuevo guión
2. Seleccionar "Operador de voces" → OpenAI
3. Tocar "Seleccionar voz" 
4. Verificar que aparecen 6 voces con icono de altavoz
5. Tocar el altavoz para escuchar preview
6. Seleccionar una voz
7. Cambiar a ElevenLabs y verificar que aparecen otras voces
8. Cambiar a Sistema y verificar voces del dispositivo
9. Entrar a Modo Estudio y verificar que se usa la voz correcta

---

🎤🎭✨
