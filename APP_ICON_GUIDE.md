# 🎨 Configuración de Iconos de la App

## 📱 Tipos de Iconos

Tu app necesita varios tipos de iconos:

### 1. **App Icon** (Icono principal)
- Se muestra en la pantalla de inicio del móvil
- Tamaño recomendado: **1024x1024 px**
- Formato: PNG con fondo sólido (sin transparencia)

### 2. **Adaptive Icon** (Solo Android)
- Android usa iconos adaptativos que se ajustan a diferentes formas
- Necesitas:
  - **Foreground**: La parte principal del icono (puede tener transparencia)
  - **Background**: El fondo (color sólido o imagen)

### 3. **Splash Screen** (Pantalla de carga)
- Se muestra mientras la app carga
- Puede tener versiones para modo claro y oscuro

---

## 🎯 Configuración Actual

Actualmente tienes:
- ✅ `icon.png` - Icono principal (1024x1024)
- ✅ `favicon.png` - Para web

---

## 🌓 Iconos para Modo Claro y Oscuro

**Respuesta corta**: No, los iconos de la app en la pantalla de inicio **NO cambian** según el modo claro/oscuro del sistema. El icono es siempre el mismo.

**PERO** puedes configurar:
1. ✅ **Splash Screen** con versiones para modo claro y oscuro
2. ✅ **Icono adaptativo en Android** con diferentes colores de fondo

---

## 📋 Pasos para Configurar tus Iconos

### Paso 1: Preparar tus Imágenes

Necesitas crear estas imágenes:

#### **Icono Principal** (`icon.png`)
- Tamaño: **1024x1024 px**
- Formato: PNG
- Fondo: Sólido (sin transparencia)
- Ubicación: `assets/images/icon.png`

**Recomendaciones de diseño**:
- Usa colores que funcionen bien en fondos claros Y oscuros
- Evita texto muy pequeño
- Mantén los elementos importantes en el centro (Android puede recortar los bordes)

#### **Icono Adaptativo Android** (Opcional)
Si quieres un icono más sofisticado en Android:

**Foreground** (`adaptive-icon.png`):
- Tamaño: **1024x1024 px**
- Formato: PNG con transparencia
- Solo el logo/símbolo principal
- Ubicación: `assets/images/adaptive-icon.png`

**Background**:
- Puedes usar un color sólido (en `app.json`)
- O una imagen de fondo (`adaptive-icon-background.png`)

#### **Splash Screen** (Pantalla de carga)
- Tamaño: **1284x2778 px** (iPhone 14 Pro Max)
- Formato: PNG
- Ubicación: `assets/images/splash.png`

Para modo oscuro (opcional):
- `assets/images/splash-dark.png`

---

### Paso 2: Actualizar `app.json`

Aquí está la configuración completa con soporte para modo claro/oscuro:

```json
{
  "expo": {
    "name": "Script Cue",
    "slug": "script-cue",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "userInterfaceStyle": "automatic",
    
    "splash": {
      "image": "./assets/images/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff",
      "dark": {
        "image": "./assets/images/splash-dark.png",
        "backgroundColor": "#000000"
      }
    },
    
    "ios": {
      "icon": "./assets/images/icon.png",
      "supportsTablet": true,
      "bundleIdentifier": "com.alexdiaz.scriptcue"
    },
    
    "android": {
      "package": "com.alexdiaz.scriptcue",
      "icon": "./assets/images/icon.png",
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundImage": "./assets/images/adaptive-icon-background.png",
        "backgroundColor": "#ffffff"
      }
    }
  }
}
```

---

### Paso 3: Generar Iconos Automáticamente

Si tienes un solo logo/icono de alta resolución, Expo puede generar todos los tamaños necesarios:

```bash
# Instalar la herramienta
npm install -g @expo/image-utils

# Generar iconos desde tu logo
npx expo-optimize
```

---

## 🎨 Diseño Recomendado para Script Cue

Para una app de guiones, te recomiendo:

### Opción 1: Icono Minimalista
- **Símbolo**: Un micrófono + texto (guion)
- **Colores**: 
  - Primario: Azul (#3B82F6) o Morado (#8B5CF6)
  - Fondo: Blanco o degradado suave
- **Estilo**: Moderno, limpio, profesional

### Opción 2: Icono con Iniciales
- **Texto**: "SC" (Script Cue)
- **Estilo**: Tipografía bold, moderna
- **Fondo**: Color sólido vibrante

---

## 🛠️ Herramientas para Crear Iconos

### Online (Gratis)
1. **Canva** - https://www.canva.com
   - Plantillas de iconos de app
   - Fácil de usar
   
2. **Figma** - https://www.figma.com
   - Más profesional
   - Exporta en múltiples tamaños

3. **App Icon Generator** - https://www.appicon.co
   - Sube un icono de 1024x1024
   - Genera todos los tamaños automáticamente

### Con IA
Puedes usar el comando `generate_image` de este chat para crear un icono:

```
"Crea un icono de app para 'Script Cue', una app de ensayo de guiones. 
Estilo moderno y profesional. Incluye un micrófono y símbolo de texto. 
Colores: azul y morado. Fondo blanco. 1024x1024px."
```

---

## 📝 Checklist de Iconos

- [ ] **icon.png** (1024x1024) - Icono principal
- [ ] **adaptive-icon.png** (1024x1024) - Foreground Android (opcional)
- [ ] **adaptive-icon-background.png** (1024x1024) - Background Android (opcional)
- [ ] **splash.png** (1284x2778) - Splash screen modo claro
- [ ] **splash-dark.png** (1284x2778) - Splash screen modo oscuro (opcional)
- [ ] **favicon.png** (48x48) - Para web

---

## 🚀 Aplicar Cambios

Después de actualizar los iconos:

### Para desarrollo (Expo Go)
```bash
# Limpiar caché
npx expo start --clear
```

### Para APK/IPA (Build)
```bash
# Regenerar archivos nativos
npx expo prebuild --clean

# Construir nuevo APK
eas build --platform android --profile preview
```

---

## 💡 Consejos Importantes

1. **Zona Segura**: En Android, el icono puede recortarse en círculo, cuadrado redondeado, etc. Mantén los elementos importantes en el **centro 70%** del icono.

2. **Contraste**: Asegúrate de que el icono se vea bien en fondos claros Y oscuros (los launchers de Android pueden tener diferentes fondos).

3. **Simplicidad**: Los iconos pequeños (48x48, 72x72) deben ser legibles. Evita detalles muy finos.

4. **Consistencia**: Usa los mismos colores y estilo que tu app.

5. **Testing**: Prueba cómo se ve el icono en:
   - Diferentes launchers de Android (Samsung, Google, Xiaomi)
   - iOS con fondos claros y oscuros
   - Diferentes tamaños (widgets, notificaciones)

---

## 🎨 ¿Quieres que te Genere un Icono?

Puedo crear un icono personalizado para Script Cue usando IA. Solo dime:

1. **Estilo**: ¿Minimalista, moderno, profesional, creativo?
2. **Colores**: ¿Qué colores prefieres? (azul, morado, verde, etc.)
3. **Elementos**: ¿Qué debe incluir? (micrófono, texto, guion, etc.)
4. **Forma**: ¿Circular, cuadrado, con bordes redondeados?

---

## 📚 Recursos Adicionales

- [Expo Icon Guidelines](https://docs.expo.dev/develop/user-interface/app-icons/)
- [Android Adaptive Icons](https://developer.android.com/develop/ui/views/launch/icon_design_adaptive)
- [iOS App Icons](https://developer.apple.com/design/human-interface-guidelines/app-icons)
- [Material Design Icons](https://m3.material.io/styles/icons/overview)
