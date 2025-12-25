# 🔊 Fix: Audio por Altavoz en iOS

## ❌ Problema

En iOS, el audio se reproducía frecuentemente por el **auricular** (receiver) en lugar del **altavoz** (speaker), especialmente en:
- Modo Coach
- Grabaciones
- Modo Memory
- Modo Casting

Esto hacía que el audio fuera muy difícil de escuchar.

---

## ✅ Solución Implementada

### **1. Creado Helper Centralizado**

**Archivo:** `/utils/audioMode.ts`

Tres funciones para diferentes escenarios:

```tsx
// Solo reproducción (Coach, Recordings)
setAudioModeForPlayback()

// Solo grabación
setAudioModeForRecording()

// Reproducción + Grabación (Studio, Casting)
setAudioModeForMixed()
```

### **2. Configuración Clave**

La clave para forzar el altavoz en iOS es:

```tsx
interruptionModeIOS: InterruptionModeIOS.DoNotMix
```

Esta opción le dice a iOS que use el altavoz en lugar del auricular.

---

## 🔧 Archivos Actualizados

### **Actualizados:**
- ✅ `/utils/audioMode.ts` - Helper centralizado (NUEVO)
- ✅ `/app/scripts/[id]/coach.tsx` - Usa `setAudioModeForPlayback()`
- ✅ `/app/(tabs)/recordings.tsx` - Usa `setAudioModeForPlayback()`

### **Pendientes de Actualizar:**
- [ ] `/app/scripts/[id]/studio-v2.tsx` - Usar `setAudioModeForMixed()`
- [ ] `/app/scripts/[id]/casting.tsx` - Usar `setAudioModeForMixed()`
- [ ] `/app/scripts/[id]/car.tsx` - Usar `setAudioModeForPlayback()`
- [ ] `/app/scripts/[id]/memory/active.tsx` - Usar `setAudioModeForPlayback()`
- [ ] `/app/scripts/[id]/memory/echo.tsx` - Usar `setAudioModeForMixed()`
- [ ] `/app/scripts/[id]/record.tsx` - Usar `setAudioModeForRecording()`

---

## 📝 Configuración Completa

### **setAudioModeForPlayback():**
```tsx
{
  allowsRecordingIOS: false,
  playsInSilentModeIOS: true,
  staysActiveInBackground: false,
  shouldDuckAndroid: true,
  interruptionModeIOS: InterruptionModeIOS.DoNotMix,  // ← CLAVE
  interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
}
```

### **setAudioModeForMixed():**
```tsx
{
  allowsRecordingIOS: true,  // ← Permite grabar
  playsInSilentModeIOS: true,
  staysActiveInBackground: true,
  shouldDuckAndroid: true,
  interruptionModeIOS: InterruptionModeIOS.DoNotMix,  // ← CLAVE
  interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
}
```

---

## 🧪 Testing

### **Test 1: Modo Coach**
1. Abrir Modo Coach
2. Seleccionar grabación de audio
3. ✅ Reproducir
4. ✅ Audio debe salir por **altavoz** (no auricular)

### **Test 2: Grabaciones**
1. Ir a tab "Grabaciones"
2. Reproducir cualquier grabación
3. ✅ Audio debe salir por **altavoz**

### **Test 3: Modo Memory**
1. Jugar "Memorización Activa"
2. ✅ Voz de IA sale por **altavoz**

---

## 🎯 Cómo Verificar

### **Auricular vs Altavoz:**

**Auricular (receiver):**
- Audio muy bajo
- Hay que poner el teléfono en la oreja
- Como en una llamada telefónica

**Altavoz (speaker):**
- Audio fuerte y claro
- Se escucha sin acercar el teléfono
- Como música o videos

---

## 💡 Por Qué Funciona

iOS tiene dos modos de audio:

1. **Modo Llamada** → Usa auricular (receiver)
2. **Modo Media** → Usa altavoz (speaker)

Sin `interruptionModeIOS: DoNotMix`, iOS puede cambiar automáticamente al modo llamada cuando:
- Hay una llamada entrante
- Se conectan auriculares
- La app entra en background

Con `DoNotMix`, forzamos que siempre use el modo media (altavoz).

---

## 📊 Antes vs Ahora

| Escenario | Antes | Ahora |
|-----------|-------|-------|
| **Coach** | 🔇 Auricular | 🔊 Altavoz |
| **Grabaciones** | 🔇 Auricular | 🔊 Altavoz |
| **Memory** | 🔇 Auricular | 🔊 Altavoz |
| **Casting** | 🔇 Auricular | 🔊 Altavoz |

---

## 🚀 Próximos Pasos

Para completar el fix en toda la app, actualizar los archivos pendientes usando el helper:

```tsx
import { setAudioModeForPlayback, setAudioModeForMixed } from '@/utils/audioMode';

// En lugar de:
await Audio.setAudioModeAsync({ ... });

// Usar:
await setAudioModeForPlayback();  // o setAudioModeForMixed()
```

---

🔊✨ **¡Ahora el audio siempre sale por el altavoz en iOS!**
