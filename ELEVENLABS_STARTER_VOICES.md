# 🎤 Sistema de Voces de ElevenLabs - Plan Starter

## 📅 Actualización: 6 de Febrero 2026

### ✅ Cambios Implementados

Se ha actualizado el sistema de voces de ElevenLabs para aprovechar el **plan Starter**, que permite:

1. **Clonar tu propia voz** (hasta 10 voces)
2. **Agregar voces de la librería** a "Mis Voces" (hasta 10 voces totales)
3. **Usar voces públicas** (ilimitadas)

---

## 🎯 Cómo Funciona Ahora

### **Orden de Visualización:**

Cuando seleccionas **ElevenLabs** como operador de voces, las voces se muestran en este orden:

1. **⭐ Mis Voces Personalizadas** (primero)
   - Voces que agregaste de la librería
   - Categoría: `generated`

2. **🎤 Mis Voces Clonadas** (segundo)
   - Voces clonadas de tu propia voz
   - Categoría: `cloned`

3. **📢 Voces Públicas de ElevenLabs** (último)
   - Voces gratuitas disponibles para todos
   - Categoría: `premade`

Dentro de cada categoría, las voces están **ordenadas alfabéticamente**.

---

## 🔧 Configuración Técnica

### **Archivo Modificado:**
- `utils/voiceService.ts` - Función `getElevenLabsVoices()`

### **Cambios Clave:**

**Antes (Plan Free):**
```typescript
// Solo mostraba voces públicas
const freeVoices = voices.filter((voice: any) => voice.category === 'premade');
```

**Ahora (Plan Starter):**
```typescript
// Muestra todas las voces, priorizando las personalizadas
const myVoices = voices.filter((voice: any) => 
  voice.category === 'cloned' || voice.category === 'generated'
);
const publicVoices = voices.filter((voice: any) => 
  voice.category === 'premade'
);

// Combinar: primero tus voces, luego las públicas
const allVoices = [...myVoices, ...publicVoices];
```

---

## 🎭 Categorías de Voces

| Categoría | Descripción | Icono | Plan Requerido |
|-----------|-------------|-------|----------------|
| **`cloned`** | Voces clonadas de tu propia voz | 🎤 | Starter+ |
| **`generated`** | Voces agregadas de la librería | ⭐ | Starter+ |
| **`premade`** | Voces públicas de ElevenLabs | 📢 | Free |

---

## 📱 Interfaz de Usuario

### **VoiceSelector Component:**

El componente `VoiceSelector.tsx` ahora muestra separadores visuales entre categorías:

```
┌─────────────────────────────────┐
│ 🎤 Mis Voces Clonadas          │
├─────────────────────────────────┤
│ ✓ Alex (Mi voz)                │
│   María (Voz clonada)           │
├─────────────────────────────────┤
│ ⭐ Mis Voces Personalizadas     │
├─────────────────────────────────┤
│   Antonio (Librería)            │
│   Carmen (Librería)             │
├─────────────────────────────────┤
│ 📢 Voces Públicas de ElevenLabs│
├─────────────────────────────────┤
│   Adam                          │
│   Bella                         │
│   ...                           │
└─────────────────────────────────┘
```

---

## 🔄 Actualizar Voces

### **Cuándo Limpiar la Caché:**

Limpia la caché de voces cuando:
- ✅ Agregues nuevas voces clonadas en ElevenLabs
- ✅ Agregues voces de la librería a "Mis Voces"
- ✅ Elimines voces de tu cuenta
- ✅ Las voces no se actualicen correctamente en la app

### **Cómo Limpiar la Caché:**

**Opción 1: Desde código**
```typescript
import { clearElevenLabsCache } from '@/utils/voiceService';

clearElevenLabsCache();
// Luego reinicia la app
```

**Opción 2: Reiniciar la app**
- Cierra completamente la app
- Vuelve a abrirla
- Las voces se recargarán automáticamente

---

## 🎯 Uso en la App

### **1. Configuración de Personajes:**

Cuando configuras un personaje en un guion:

1. Ve a **Configuración de Personajes**
2. Selecciona **Operador de voces:** `ElevenLabs`
3. Haz clic en **Voz del personaje**
4. Verás tus voces personalizadas **primero**
5. Luego las voces públicas

### **2. Modo Car (Repaso Continuo):**

En el Modo Car, cuando activas "Modo Repaso Continuo":

1. Selecciona **Operador de voces** para cada personaje
2. Si eliges `ElevenLabs`, verás tus voces primero
3. Puedes usar diferentes voces para cada personaje

---

## 💰 Límites del Plan Starter

### **Voces Personalizadas:**
- ✅ Hasta **10 voces** en total (clonadas + librería)
- ✅ Puedes reemplazarlas cuando quieras
- ✅ Sin límite de uso una vez agregadas

### **Caracteres TTS:**
- ✅ 30,000 caracteres/mes
- ✅ ~15-20 guiones promedio
- ⚠️ Monitorea tu uso en el dashboard de ElevenLabs

---

## 🔍 Debugging

### **Ver Voces Disponibles:**

En la consola de desarrollo:
```typescript
import { getElevenLabsVoices } from '@/utils/voiceService';

const voices = await getElevenLabsVoices();
console.log('Total voces:', voices.length);
console.log('Mis voces:', voices.filter(v => v.category !== 'premade').length);
console.log('Voces públicas:', voices.filter(v => v.category === 'premade').length);
```

### **Verificar Categorías:**

```typescript
voices.forEach(v => {
  console.log(`${v.name} - ${v.category}`);
});
```

---

## 📝 Notas Importantes

1. **Caché Automático:**
   - Las voces se cachean automáticamente
   - Se recargan solo cuando es necesario
   - Mejora el rendimiento de la app

2. **API Key:**
   - Asegúrate de tener `EXPO_PUBLIC_ELEVENLABS_API_KEY` en `.env`
   - La API key debe tener permisos del plan Starter

3. **Compatibilidad:**
   - Funciona con plan Free (solo voces públicas)
   - Funciona con plan Starter (voces personalizadas + públicas)
   - Funciona con planes superiores (todas las funciones)

---

## 🚀 Próximos Pasos

### **Recomendaciones:**

1. **Clona tu voz:**
   - Ve a ElevenLabs → Voice Lab → Instant Voice Cloning
   - Graba 1-2 minutos de audio claro
   - Nómbrala (ej: "Alex - Mi Voz")

2. **Agrega voces de la librería:**
   - Ve a ElevenLabs → Voice Library
   - Busca voces en español
   - Haz clic en "Add to My Voices"

3. **Prueba en la app:**
   - Abre un guion
   - Configura un personaje con tu voz clonada
   - Prueba en Modo Estudio

---

## 📞 Soporte

Si tienes problemas:

1. **Verifica la API key** en `.env`
2. **Limpia la caché** de voces
3. **Reinicia la app**
4. **Revisa los logs** en la consola

---

**Última actualización:** 6 de Febrero 2026
