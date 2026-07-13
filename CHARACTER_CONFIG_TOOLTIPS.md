# ℹ️ Tooltips Informativos en Configuración de Personajes

## ✅ Mejoras Implementadas

Se han agregado tooltips informativos con el icono **ℹ️** en los campos clave de la configuración de personajes para mejorar la experiencia de usuario.

---

## 📍 Tooltips Agregados

### **1. Campo "Nombre"**

**Ubicación:** Junto al label "Nombre"

**Mensaje:**
```
Nombre del personaje

Escribe el nombre exactamente como aparece en el guion.

• Si lleva tildes, escríbelas
• Si lleva comillas, inclúyelas
• Si tiene caracteres especiales, cópialos

Esto permite que la app detecte correctamente los diálogos.
```

**Por qué es importante:**
- Los usuarios a veces escriben nombres simplificados (sin tildes, sin comillas)
- Esto causa que la app no detecte los diálogos correctamente
- El tooltip educa al usuario sobre la importancia de la precisión

---

### **2. Campo "Color"**

**Ubicación:** Junto al label "Color"

**Mensaje:**
```
Color del personaje

Selecciona el color de las tarjetas con los diálogos de este personaje.

Esto te ayudará a identificar visualmente quién habla en cada momento durante los modos de estudio.
```

**Por qué es importante:**
- Explica el propósito del color (identificación visual)
- Clarifica que afecta las tarjetas de diálogo
- Ayuda a entender la utilidad en los modos de estudio

---

## 🎨 Diseño

### **Icono:**
- **Componente:** `Info` de `lucide-react-native`
- **Tamaño:** 16px
- **Color:** `colors.primary` (azul)
- **Interacción:** TouchableOpacity con Alert

### **Layout:**
```tsx
<View style={styles.labelWithInfo}>
  <Text style={styles.label}>Nombre</Text>
  <TouchableOpacity onPress={showTooltip}>
    <Info size={16} color={colors.primary} />
  </TouchableOpacity>
</View>
```

### **Estilos:**
```tsx
labelWithInfo: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  marginBottom: 8,
}

infoButton: {
  padding: 4,
  marginTop: 12,
}
```

---

## 🔧 Implementación Técnica

### **Archivos Modificados:**
- `/app/import-script.tsx`

### **Cambios:**
1. ✅ Import de `Info` desde `lucide-react-native`
2. ✅ Tooltip en campo "Nombre"
3. ✅ Tooltip en campo "Color"
4. ✅ Estilos `labelWithInfo` y `infoButton`

---

## 📱 Experiencia de Usuario

**Antes:**
- Usuario no sabía por qué sus personajes no se detectaban
- No entendía para qué servía el color

**Ahora:**
- ✅ Icono ℹ️ visible junto a cada campo importante
- ✅ Al tocar el icono, aparece un Alert con explicación clara
- ✅ Instrucciones específicas y ejemplos
- ✅ Mejor comprensión del propósito de cada campo

---

## 🧪 Testing

1. **Abrir importar guion**
2. **Configurar personajes**
3. **Verificar** que aparece el icono ℹ️ junto a "Nombre"
4. **Tocar el icono** → Debe mostrar el tooltip
5. **Verificar** que aparece el icono ℹ️ junto a "Color"
6. **Tocar el icono** → Debe mostrar el tooltip

---

ℹ️✨ **¡Usuarios mejor informados = Mejor experiencia!**
