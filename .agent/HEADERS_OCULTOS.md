# 🚫 Headers de Navegación - SIEMPRE OCULTOS

## ⚠️ REGLA IMPORTANTE

**NUNCA mostrar los headers nativos de Expo Router en la app.**

Los usuarios NO deben ver:
- "Tabs"
- "Script/[id]"
- Nombres de rutas internas
- Headers blancos por defecto

---

## ✅ Configuración Actual

### 1. Layout Principal (`app/_layout.tsx`)
```tsx
<Stack
  screenOptions={{
    headerShown: false,  // ← Global para todas las pantallas
  }}
>
  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
  <Stack.Screen name="auth" options={{ headerShown: false }} />
  <Stack.Screen name="scripts/[id]/index" options={{ headerShown: false }} />
  // ... todas las rutas con headerShown: false
</Stack>
```

### 2. Layout de Tabs (`app/(tabs)/_layout.tsx`)
```tsx
<Tabs
  screenOptions={{
    headerShown: false,  // ← Ya configurado
    // ...
  }}
>
```

### 3. Layout de Scripts (`app/scripts/_layout.tsx`)
```tsx
<Stack
  screenOptions={{
    headerShown: false,  // ← Oculta headers en todas las rutas de scripts
  }}
/>
```

### 4. Layout de Scripts/[id] (`app/scripts/[id]/_layout.tsx`)
```tsx
<Stack
  screenOptions={{
    headerShown: false,  // ← Oculta headers en todas las rutas dinámicas
  }}
/>
```

---

## 📋 Checklist para Nuevas Pantallas

Cuando crees una nueva pantalla, SIEMPRE:

1. ✅ Usar `SafeAreaView` de `react-native-safe-area-context`
2. ✅ Crear tu propio header personalizado con componentes de React Native
3. ✅ NO confiar en el header nativo de Expo Router
4. ✅ Si creas un nuevo `_layout.tsx`, incluir `screenOptions={{ headerShown: false }}`
5. ✅ Si agregas una nueva ruta en `app/_layout.tsx`, incluir `options={{ headerShown: false }}`

---

## 🎨 Patrón de Header Personalizado

```tsx
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, TouchableOpacity } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';

export default function MyScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header personalizado */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', color: colors.text }}>
          Mi Pantalla
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Contenido */}
      <View style={{ flex: 1 }}>
        {/* Tu contenido aquí */}
      </View>
    </SafeAreaView>
  );
}
```

---

## 🗂️ Estructura de Layouts

```
app/
├── _layout.tsx                    ← headerShown: false (global)
├── (tabs)/
│   └── _layout.tsx               ← headerShown: false (tabs)
├── scripts/
│   ├── _layout.tsx               ← headerShown: false (scripts)
│   └── [id]/
│       ├── _layout.tsx           ← headerShown: false (script detail)
│       ├── index.tsx             ← Pantalla resumen
│       ├── analysis.tsx          ← Modo Análisis
│       ├── studio-v2.tsx         ← Modo Estudio
│       ├── coach.tsx             ← Modo Coach
│       ├── casting.tsx           ← Modo Casting
│       ├── car.tsx               ← Modo Coche
│       └── memory/
│           └── _layout.tsx       ← headerShown: false (memory)
```

---

## 🔍 Verificación

Para verificar que no hay headers visibles:

1. Recarga la app
2. Navega por todas las pantallas
3. NO deberías ver:
   - Headers blancos con texto de rutas
   - "Tabs", "Script", "[id]", etc.
   - Botones de navegación nativos

4. SÍ deberías ver:
   - Headers personalizados con tu diseño
   - Colores del tema aplicados
   - Botones personalizados (ArrowLeft, etc.)

---

## ⚡ Recordatorio

**SIEMPRE que crees una nueva pantalla:**
- ❌ NO usar el header nativo
- ✅ SÍ crear header personalizado
- ✅ SÍ configurar `headerShown: false`
- ✅ SÍ usar `SafeAreaView`

---

## 📝 Pantallas Actuales (Todas con Headers Ocultos)

- ✅ Tabs (Mis Guiones, Grabaciones, Mis proyectos, Ajustes)
- ✅ Auth
- ✅ Scan Script
- ✅ Import Script
- ✅ Script Resumen
- ✅ Modo Estudio
- ✅ Modo Memory
- ✅ Modo Coach
- ✅ Modo Casting
- ✅ Modo Coche
- ✅ Modo Análisis
- ✅ Editor

---

## 🎯 Objetivo

**El usuario NUNCA debe ver elementos de desarrollo interno.**

La app debe sentirse como una aplicación nativa profesional, no como una app en desarrollo con rutas expuestas.
