# 🎨 Colores Hardcodeados Pendientes de Cambiar

## ✅ Ya Cambiado
- ✅ `ThemeContext.tsx` - Color primario actualizado a morado

## ⏳ Pendiente de Cambiar

### **1. Botón FAB (+) en Mis Guiones**
**Archivo**: `/app/(tabs)/index.tsx`
**Línea**: ~642

**Cambiar:**
```typescript
backgroundColor: '#007AFF',  // Azul iOS
```

**Por:**
```typescript
backgroundColor: '#683a79',  // Morado
```

---

### **2. Botones de Modos en Resumen del Guion**
**Archivo**: `/app/scripts/[id]/index.tsx`
**Líneas**: 668-669

**Cambiar:**
```typescript
backgroundColor: '#3B82F6',
shadowColor: '#3B82F6',
```

**Por:**
```typescript
backgroundColor: '#683a79',
shadowColor: '#683a79',
```

---

### **3. Botón "Importar Guión"**
**Archivo**: `/app/import-script.tsx`
**Líneas**: 1323-1324, 1346, 1354, 1397

**Cambiar todas las instancias de:**
```typescript
'#3B82F6'
```

**Por:**
```typescript
'#683a79'
```

**Instancias específicas:**
- Línea 1323: `backgroundColor: '#3B82F6',`
- Línea 1324: `borderColor: '#3B82F6',`
- Línea 1346: `borderColor: '#3B82F6',`
- Línea 1354: `color: '#3B82F6',`
- Línea 1397: `backgroundColor: '#3B82F6',`

---

## 📝 Otros Azules Hardcodeados (Opcionales)

### **Reproductor de Grabaciones**
**Archivo**: `/app/(tabs)/recordings.tsx`

- Línea 1613: AudioVisualizer color
- Línea 1652: Waves icon
- Línea 1710: Repeat icon
- Línea 1712: Loop badge
- Línea 1737: Progress bar

### **Modo Casting**
**Archivo**: `/app/scripts/[id]/casting.tsx`

- Línea 1166: ActivityIndicator
- Línea 1556: backgroundColor
- Línea 1562: color

### **Modo Coach**
**Archivo**: `/app/scripts/[id]/coach.tsx`

- Línea 810: borderLeftColor

### **Modo Record**
**Archivo**: `/app/scripts/[id]/record.tsx`

- Múltiples líneas con '#3B82F6'

### **Análisis**
**Archivo**: `/app/scripts/[id]/analysis.tsx`

- Línea 632: shadowColor
- Línea 685: shadowColor

---

## 🚀 Cómo Aplicar los Cambios

### **Opción 1: Buscar y Reemplazar Global**
```bash
# En VS Code o tu editor:
1. Cmd/Ctrl + Shift + F (buscar en archivos)
2. Buscar: #3B82F6
3. Reemplazar por: #683a79
4. Revisar cada resultado antes de reemplazar
```

### **Opción 2: Usar sed (Terminal)**
```bash
# Cambiar en archivos específicos
sed -i '' 's/#3B82F6/#683a79/g' app/(tabs)/index.tsx
sed -i '' 's/#3B82F6/#683a79/g' app/scripts/[id]/index.tsx
sed -i '' 's/#3B82F6/#683a79/g' app/import-script.tsx
```

### **Opción 3: Cambiar Manualmente**
Abrir cada archivo y cambiar las líneas específicas mencionadas arriba.

---

## ⚠️ Nota Importante

**NO cambiar** el azul en:
- `/app/import-script.tsx` línea 28: Es una opción de color para el usuario
  ```typescript
  { value: '#3B82F6', label: 'Azul' },  // ← Dejar como está
  ```

---

## ✅ Resultado Esperado

Después de aplicar estos cambios:
- ✅ Botón "+" morado
- ✅ Botones de modos morados
- ✅ Botón "Importar guión" morado
- ✅ Toda la app con acento morado consistente

---

**Prioridad Alta:**
1. Botón FAB (+)
2. Botones de modos
3. Botón importar

**Prioridad Media:**
- Reproductor
- Modos específicos

🎨💜✨
