# 🚗 Modo Coche - Configuración de Voces Persistente

## 📅 Actualización: 6 de Febrero 2026

### ✅ Cambio Implementado

Se ha implementado un sistema de **persistencia de configuración de voces** en el Modo Coche para que recuerde tus preferencias entre sesiones.

---

## 🎯 Cómo Funciona

### **Antes:**
- ❌ Cada vez que entrabas al Modo Coche, se cargaban las voces por defecto
- ❌ Tenías que reconfigurar las voces manualmente cada vez
- ❌ Se perdía tu configuración personalizada

### **Ahora:**
- ✅ La configuración de voces se **guarda automáticamente** al presionar "Empezar"
- ✅ La próxima vez que entres al Modo Coche, **se cargan tus voces guardadas**
- ✅ Cada guion tiene su propia configuración independiente

---

## 🔄 Flujo de Trabajo

### **Primera Vez:**

1. **Entras al Modo Coche**
   - Se cargan las voces configuradas en "Configuración de Personajes"
   - Si no hay configuración, usa voces por defecto de OpenAI

2. **Configuras las voces**
   - Seleccionas el operador (OpenAI, ElevenLabs, Sistema)
   - Eliges la voz específica para cada personaje

3. **Presionas "Empezar"**
   - ✅ La configuración se **guarda automáticamente** en AsyncStorage
   - Se precarga el audio
   - Inicia el Modo Coche

### **Próximas Veces:**

1. **Entras al Modo Coche**
   - ✅ Se **cargan automáticamente** las voces que configuraste la última vez
   - Ya no necesitas reconfigurar nada

2. **Presionas "Empezar"**
   - Inicia directamente con tus voces guardadas

---

## 💾 Almacenamiento

### **Dónde se Guarda:**

- **Tecnología:** AsyncStorage (almacenamiento local del dispositivo)
- **Clave:** `car_mode_voice_config_{scriptId}`
- **Formato:** JSON

### **Ejemplo de Datos Guardados:**

```json
[
  {
    "characterName": "ALEX",
    "provider": "elevenlabs",
    "voiceId": "Alex His"
  },
  {
    "characterName": "MARÍA",
    "provider": "openai",
    "voiceId": "nova"
  }
]
```

---

## 🔧 Lógica de Carga

### **Orden de Prioridad:**

1. **Configuración guardada en AsyncStorage** (la más reciente que configuraste)
2. **Configuración de la base de datos** (de "Configuración de Personajes")
3. **Valores por defecto** (OpenAI - Nova)

### **Código Relevante:**

```typescript
// Al cargar el Modo Coche
const savedConfigsKey = `car_mode_voice_config_${id}`;
const savedConfigsJson = await AsyncStorage.getItem(savedConfigsKey);

if (savedConfigsJson) {
  savedConfigs = JSON.parse(savedConfigsJson);
  // Usar configuración guardada
} else {
  // Usar configuración de la base de datos
}
```

```typescript
// Al presionar "Empezar"
await AsyncStorage.setItem(
  savedConfigsKey, 
  JSON.stringify(characterVoiceConfigs)
);
```

---

## 🎭 Casos de Uso

### **Caso 1: Mismo Guion, Diferentes Voces**

**Escenario:**
- Tienes un guion con 2 personajes
- Pruebas diferentes voces para encontrar la mejor combinación

**Comportamiento:**
- Cada vez que presionas "Empezar", se guarda la nueva configuración
- La próxima vez que entres, se carga la última configuración que guardaste

### **Caso 2: Múltiples Guiones**

**Escenario:**
- Tienes 3 guiones diferentes
- Cada uno con su propia configuración de voces

**Comportamiento:**
- Cada guion guarda su configuración independientemente
- No se mezclan las configuraciones entre guiones

### **Caso 3: Cambio de Dispositivo**

**Escenario:**
- Usas la app en un dispositivo nuevo

**Comportamiento:**
- AsyncStorage es local, así que no se sincroniza
- Se cargará la configuración de la base de datos (de "Configuración de Personajes")
- Al presionar "Empezar", se guardará en el nuevo dispositivo

---

## 🔍 Debugging

### **Ver Configuración Guardada:**

En la consola de desarrollo, verás logs como:

```
[Car Mode] Loaded saved voice configurations: [...]
[Car Mode] Saved voice configurations: [...]
```

### **Limpiar Configuración Guardada:**

Si quieres resetear la configuración:

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

// Limpiar configuración de un guion específico
await AsyncStorage.removeItem(`car_mode_voice_config_{scriptId}`);

// Limpiar TODAS las configuraciones de Modo Coche
const keys = await AsyncStorage.getAllKeys();
const carModeKeys = keys.filter(key => key.startsWith('car_mode_voice_config_'));
await AsyncStorage.multiRemove(carModeKeys);
```

---

## 📝 Notas Técnicas

### **Persistencia:**

- ✅ **Sobrevive a reinicios de la app**
- ✅ **Sobrevive a actualizaciones de la app**
- ❌ **NO se sincroniza entre dispositivos** (es local)
- ❌ **Se pierde si desinstalas la app**

### **Rendimiento:**

- ⚡ **Carga instantánea** (AsyncStorage es muy rápido)
- 💾 **Tamaño mínimo** (~1 KB por guion)
- 🔄 **Sin impacto en la red** (todo es local)

---

## 🚀 Mejoras Futuras (Opcional)

### **Posibles Extensiones:**

1. **Sincronización en la nube:**
   - Guardar configuraciones en Supabase
   - Sincronizar entre dispositivos

2. **Perfiles de voz:**
   - Guardar múltiples configuraciones por guion
   - Cambiar entre perfiles rápidamente

3. **Configuración global:**
   - Voces por defecto para todos los guiones
   - Aplicar a guiones nuevos automáticamente

---

## ✅ Checklist de Verificación

Para confirmar que funciona:

- [ ] Entra al Modo Coche de un guion
- [ ] Cambia las voces de los personajes
- [ ] Presiona "Empezar"
- [ ] Sal del Modo Coche
- [ ] Vuelve a entrar al Modo Coche
- [ ] ✅ Las voces deben ser las que configuraste antes

---

## 📞 Soporte

**Desarrollador:** Alex Díaz  
**Proyecto:** ScriptCue  
**Fecha:** 6 de Febrero 2026

---

**¡Configuración de Voces Persistente Implementada!** 🎉
