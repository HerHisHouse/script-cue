# 📚 FAQs - Preguntas Frecuentes

## ✅ Implementación Completada

### **Nueva Pantalla: `/app/faqs.tsx`**

Pantalla completa de preguntas frecuentes con:
- ✅ 15 preguntas organizadas por categorías
- ✅ Diseño de acordeón expandible
- ✅ Navegación desde Ajustes
- ✅ Diseño responsive y adaptable a temas

---

## 📋 Categorías de FAQs

### **1. General (2 preguntas)**
- ¿Qué es Script Cue?
- ¿Cómo importo un guión?

### **2. Modos de Estudio (4 preguntas)**
- ¿Qué es el Modo Estudio?
- ¿Qué es el Modo Casting?
- ¿Qué es el Modo Coach?
- ¿Qué es el Modo Coche?

### **3. Grabaciones (2 preguntas)**
- ¿Dónde se guardan mis grabaciones?
- ¿Cómo reproduzco un video de Modo Casting?

### **4. Proyectos (1 pregunta)**
- ¿Qué son los proyectos?

### **5. Análisis (1 pregunta)**
- ¿Qué es el Análisis de Personaje?

### **6. Configuración (2 preguntas)**
- ¿Cómo cambio las voces de la IA?
- ¿Qué es el almacenamiento local?

### **7. Problemas Comunes (3 preguntas)**
- El Modo Casting da error 504
- No puedo reproducir mis videos
- El reconocimiento de voz no funciona

---

## 🎨 Características de la Pantalla

### **Diseño**
```tsx
• Header con botón de retroceso
• Título "Preguntas Frecuentes"
• Scroll vertical
• Categorías organizadas
• Tarjetas expandibles
• Iconos de chevron (arriba/abajo)
• Tarjeta de contacto al final
```

### **Interacción**
- Toca una pregunta para expandir/contraer
- Solo una pregunta expandida a la vez
- Animación suave
- Colores adaptativos al tema

### **Responsive**
- Usa `rf()` para tamaños de fuente
- Usa `rp()` para padding/margin
- Se adapta a diferentes tamaños de pantalla

---

## 🔗 Acceso a FAQs

### **Desde Ajustes**
```
Ajustes
  ↓
Sección "Ayuda"
  ↓
"Preguntas Frecuentes"
  ↓
Pantalla de FAQs
```

### **Ubicación en Ajustes**
- Después de "Acerca de"
- Antes de "Aviso Legal"
- Nueva sección "Ayuda"

---

## 📝 Contenido de las FAQs

### **Ejemplo: Modo Casting**
```
Pregunta: ¿Qué es el Modo Casting?

Respuesta:
El Modo Casting te permite grabar video de tu actuación 
mientras la IA lee las líneas de los otros personajes. 
Es ideal para:

• Crear self-tapes profesionales
• Practicar audiciones
• Revisar tu actuación

El video final incluye tanto tu actuación como el audio 
de la IA mezclado.
```

### **Ejemplo: Error 504**
```
Pregunta: El Modo Casting da error 504

Respuesta:
Este error ocurre cuando el servidor está iniciándose 
(tarda ~1 minuto). Para solucionarlo:

1. Espera 1-2 minutos
2. Intenta grabar de nuevo
3. El segundo intento debería funcionar

El servidor se "duerme" después de 15 minutos sin uso, 
pero se despierta automáticamente al abrir el Modo Casting.
```

---

## 🎯 Beneficios para los Usuarios

### **Onboarding Mejorado**
- ✅ Los nuevos usuarios aprenden rápido
- ✅ Descubren todas las funcionalidades
- ✅ Entienden cómo usar cada modo

### **Soporte Self-Service**
- ✅ Resuelven dudas sin contactar soporte
- ✅ Soluciones a problemas comunes
- ✅ Disponible 24/7

### **Mejor Experiencia**
- ✅ Menos frustración
- ✅ Más confianza al usar la app
- ✅ Mayor retención de usuarios

---

## 🚀 Cómo Expandir en el Futuro

### **Agregar Más FAQs**
```tsx
// En /app/faqs.tsx
const faqs: FAQ[] = [
  // ... FAQs existentes
  {
    category: 'Nueva Categoría',
    question: '¿Nueva pregunta?',
    answer: 'Nueva respuesta...',
  },
];
```

### **Agregar Videos Tutoriales**
- Incrustar videos de YouTube
- GIFs animados
- Capturas de pantalla

### **Agregar Búsqueda**
- Barra de búsqueda en el header
- Filtrar FAQs por palabra clave
- Resaltar texto coincidente

---

## 📊 Estructura de Archivos

```
/app
  ├── faqs.tsx          ← Nueva pantalla de FAQs
  └── (tabs)
      └── settings.tsx  ← Actualizado con botón FAQs
```

---

## ✨ Resultado

**Ahora los usuarios pueden:**
1. ✅ Ir a Ajustes
2. ✅ Tocar "Preguntas Frecuentes"
3. ✅ Ver todas las FAQs organizadas
4. ✅ Expandir las que les interesen
5. ✅ Aprender a usar la app

**Cobertura de temas:**
- ✅ Todos los modos explicados
- ✅ Problemas comunes resueltos
- ✅ Configuración explicada
- ✅ Funcionalidades principales

🎭📚✨
