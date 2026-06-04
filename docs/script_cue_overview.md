# Script Cue: Manual de Producto y Descripción Detallada

**Script Cue** es una plataforma integral diseñada específicamente para actores, que utiliza Inteligencia Artificial de vanguardia para transformar la manera en que se estudian, memorizan y ensayan los guiones. La aplicación permite a los usuarios importar guiones en PDF y practicar sus escenas con voces de IA que responden en tiempo real, actuando como compañeros de reparto virtuales.

---

## 1. Pantallas Principales y Navegación

### **A. Mis Guiones (Pantalla de Inicio)**
Es el centro de gestión de la aplicación.
*   **Diseño**: Una interfaz limpia con tarjetas visuales para cada guion, mostrando el título, la fecha de importación y el estado del procesamiento.
*   **Funciones**: 
    *   Búsqueda dinámica de proyectos.
    *   Filtros por género o etiquetas.
    *   Acceso directo al botón flotante de **Importar (+)**.
    *   Gestión de archivos (eliminar o renombrar guiones).

### **B. Importación y Detección de Personajes**
*   **Proceso**: El usuario sube un PDF que se procesa a través de un microservicio Python (Render) y GPT-4o-mini para extraer la estructura.
*   **UX**: Una barra de progreso animada informa al usuario mientras el sistema identifica a los personajes.
*   **Configuración**: Una vez procesado, el usuario selecciona **quién es él** en el guion. El sistema asigna automáticamente colores únicos a cada personaje para facilitar la lectura rápida.

### **C. Editor de Guiones Profesional**
*   **Funciones**: Permite corregir erratas del OCR o modificar diálogos directamente.
*   **Sincronización**: Cualquier cambio en el editor se refleja instantáneamente en la base de datos de escenas y líneas, actualizando todos los modos de práctica.
*   **Diseño**: Editor de texto enriquecido optimizado para móvil con acceso rápido a etiquetas de "Personaje", "Diálogo" y "Escena".

---

## 2. Modos de Práctica y Especialidades

### **Modo Estudio (Studio Mode)** 💎
El modo principal para el "trabajo de mesa".
*   **UX**: Los diálogos se presentan en tarjetas individuales con burbujas de color.
*   **Funciones Especiales**:
    *   **Ocultar líneas**: Permite ocultar el texto del personaje del usuario para forzar la memorización.
    *   **Reproducción Inteligente**: La IA lee las líneas de los demás personajes y espera a que el usuario diga la suya.
    *   **Grabación**: Posibilidad de grabar la toma y escucharla para detectar fallos.

### **Modo Auto (Car Mode)** 🚗
Diseñado para la práctica segura mientras se conduce o se camina.
*   **Diseño**: Interfaz de alto contraste con botones gigantes y navegación simplificada.
*   **UX**: Enfoque total en el audio. El sistema reproduce la escena de forma secuencial automáticamente, permitiendo al actor ensayar sin mirar la pantalla.

### **Modo Memoria (Memory Mode)** 🧠
Herramientas neurocientíficas para el aprendizaje de líneas.
*   **Eco**: La IA dice la línea y el actor la repite.
*   **Refuerzo**: El sistema da pistas (solo la primera palabra o las iniciales) para ayudar cuando el actor se queda en blanco.

### **Modo Casting (Teleprompter & Self-Tape)** 🎬
Convierte el móvil en un estudio de grabación profesional.
*   **Teleprompter**: El guion se desplaza por la pantalla a una velocidad ajustable mientras la cámara frontal graba.
*   **Sin Eco**: Tecnología que silencia el audio del usuario mientras la IA "compañera" habla, permitiendo grabar un self-tape con audio limpio listo para enviar.

### **Modo Coach (Análisis por IA)** 👨‍🏫
Un entrenador de actuación en el bolsillo.
*   **Análisis**: Tras una grabación, la IA analiza la dicción, el ritmo (tempo), la intención emocional y la naturalidad.
*   **Feedback**: Devuelve consejos específicos y ejercicios personalizados para mejorar la interpretación de esa escena concreta.

---

## 3. Filosofía de Diseño y Experiencia de Usuario (UX)

1.  **Jerarquía Visual por Color**: Cada personaje tiene un color persistente. El actor aprende a asociar visualmente cuándo le toca hablar sin leer el nombre.
2.  **Micro-interacciones**: Transiciones suaves entre tarjetas, retroalimentación háptica al pulsar botones y ondas de audio dinámicas durante la grabación.
3.  **Accesibilidad**: Soporte total para **Modo Oscuro** (Dark Mode) y tamaños de fuente ajustables para facilitar la lectura en condiciones de baja luz o fatiga visual.
4.  **Resiliencia**: Sistema de caché de audio TTS para que la aplicación funcione de manera fluida incluso con conexiones de red inestables.

---
*Script Cue: Tu compañero de ensayos, siempre disponible, nunca cansado.*
