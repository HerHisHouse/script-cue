# ReplicaStudio MVP

ReplicaStudio es una aplicación móvil y web que permite a actores practicar sus guiones con respuestas de voz AI. Los actores pueden importar guiones en PDF, seleccionar su personaje y practicar escenas con voces AI respondiendo como los otros personajes.

## Características Principales

### 1. Importación de Guiones PDF
- Sube guiones en formato PDF desde tu dispositivo
- Detección automática de personajes mediante análisis de texto
- Soporte para formato de guión estándar (nombres en MAYÚSCULAS)

### 2. Detección Automática de Personajes
- Identifica personajes automáticamente del texto
- Muestra estadísticas de aparición y porcentaje de líneas
- Asignación de colores únicos para cada personaje
- Selección de tu personaje para modo práctica

### 3. Modo Estudio
- Visualización de diálogos con código de colores por personaje
- Respuestas TTS de IA para líneas de otros personajes
- Opción "Ocultar Líneas" para practicar de memoria
- Grabación de sesiones de práctica
- Indicadores de prosodia (preguntas, exclamaciones, énfasis)

### 4. Modo Auto (Car Mode)
- Interfaz minimalista con botones grandes
- Reproducción automática secuencial
- Control manos libres para práctica segura
- Navegación entre líneas

### 5. Grabaciones
- Graba tus sesiones de práctica
- Reproduce y revisa grabaciones anteriores
- Gestión de archivos de audio

## Stack Tecnológico

### Frontend
- **Framework**: React Native con Expo
- **Navegación**: Expo Router (file-based routing)
- **Estado**: React Context API
- **UI**: React Native (StyleSheet)
- **Audio**: expo-av
- **Documentos**: expo-document-picker, expo-file-system

### Backend
- **Base de Datos**: Supabase (PostgreSQL)
- **Autenticación**: Supabase Auth
- **Almacenamiento**: Supabase Storage
- **Funciones**: Supabase Edge Functions (Deno)
- **TTS**: Servicio configurable (Google Cloud TTS mock)

## Estructura del Proyecto

```
project/
├── app/                          # Rutas de la aplicación (Expo Router)
│   ├── (tabs)/                   # Navegación con pestañas
│   │   ├── _layout.tsx          # Layout de pestañas
│   │   ├── index.tsx            # Pantalla de guiones
│   │   ├── recordings.tsx       # Pantalla de grabaciones
│   │   └── settings.tsx         # Pantalla de ajustes
│   ├── scripts/[id]/            # Rutas dinámicas de guiones
│   │   ├── index.tsx            # Detalle del guión
│   │   ├── characters.tsx       # Selección de personaje
│   │   ├── studio.tsx           # Modo estudio
│   │   └── car.tsx              # Modo auto
│   ├── auth.tsx                 # Pantalla de autenticación
│   ├── import-script.tsx        # Importar guión
│   └── _layout.tsx              # Layout raíz
├── components/                   # Componentes reutilizables
│   ├── ScriptCard.tsx           # Tarjeta de guión
│   ├── CharacterItem.tsx        # Item de personaje
│   ├── DialogueLine.tsx         # Línea de diálogo
│   └── RecordingControls.tsx   # Controles de grabación
├── contexts/                     # Contextos de React
│   └── AuthContext.tsx          # Contexto de autenticación
├── utils/                        # Utilidades
│   ├── supabase.ts              # Cliente Supabase
│   ├── pdfParser.ts             # Parser de guiones PDF
│   ├── tts.ts                   # Servicio TTS
│   ├── audio.ts                 # Utilidades de audio
│   └── storage.ts               # Gestión de archivos
├── types/                        # Definiciones TypeScript
│   └── database.ts              # Tipos de base de datos
└── supabase/                     # Supabase configuration
    └── migrations/               # Migraciones de BD

```

## Base de Datos

### Tablas Principales

1. **profiles** - Perfiles de usuario
2. **scripts** - Guiones importados
3. **characters** - Personajes detectados en guiones
4. **scenes** - Escenas del guión
5. **dialogues** - Diálogos individuales
6. **practice_sessions** - Sesiones de práctica
7. **recordings** - Grabaciones de audio
8. **tts_cache** - Caché de audio TTS

### Storage Buckets

- **scripts** - PDFs de guiones
- **recordings** - Archivos de audio de grabaciones

## Funciones Edge (Supabase)

### 1. parse-pdf
Procesa archivos PDF y extrae personajes y diálogos.

**Endpoint**: `POST /functions/v1/parse-pdf`

**Parámetros**:
```json
{
  "scriptId": "uuid",
  "fileContent": "base64_string",
  "fileName": "script.pdf"
}
```

### 2. generate-speech
Genera audio TTS para diálogos de personajes.

**Endpoint**: `POST /functions/v1/generate-speech`

**Parámetros**:
```json
{
  "text": "Texto del diálogo",
  "voiceGender": "male|female|neutral",
  "voicePreset": "natural|warm|deep|authoritative",
  "prosodyHints": {
    "emphasis": 1,
    "hasQuestion": true,
    "hasExclamation": false,
    "emotion": "neutral",
    "pace": "normal"
  }
}
```

## Configuración de Desarrollo

### Requisitos Previos

- Node.js 18+
- npm o yarn
- Expo CLI
- Cuenta de Supabase

### Variables de Entorno

El archivo `.env` ya está configurado con:

```env
EXPO_PUBLIC_SUPABASE_URL=tu_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=tu_supabase_anon_key
```

### Instalación

1. Instalar dependencias:
```bash
npm install
```

2. Iniciar el servidor de desarrollo:
```bash
npm run dev
```

3. Escanea el código QR con Expo Go en tu dispositivo móvil o presiona:
   - `w` para abrir en navegador web
   - `i` para iOS simulator
   - `a` para Android emulator

### Scripts Disponibles

- `npm run dev` - Inicia el servidor de desarrollo
- `npm run build:web` - Construye para web
- `npm run typecheck` - Verifica tipos TypeScript
- `npm run lint` - Ejecuta el linter

## Flujo de Uso

1. **Registro/Login** - El usuario se autentica
2. **Importar Guión** - Sube un PDF y el sistema procesa
3. **Detección de Personajes** - El sistema detecta personajes automáticamente
4. **Seleccionar Personaje** - El usuario elige su personaje
5. **Modo Estudio** - Práctica con respuestas TTS de IA
6. **Grabación** - Opcional: graba la sesión
7. **Modo Auto** - Alternativa para práctica manos libres

## Algoritmo de Detección de Personajes

El parser utiliza las siguientes reglas:

1. **Nombres de Personaje**: Líneas en MAYÚSCULAS (2-30 caracteres)
   - Regex: `^([A-ZÑÁÉÍÓÚ0-9 \-]{2,30})$`
   - Excluye: INT., EXT., encabezados de escena

2. **Diálogos**: Líneas de texto después del nombre del personaje

3. **Indicadores de Prosodia**:
   - `?` → hasQuestion = true
   - `!` → hasExclamation = true, emphasis incrementa
   - Múltiples `!` → mayor énfasis

4. **Estadísticas**:
   - Cuenta líneas por personaje
   - Calcula porcentaje de aparición
   - Ordena por frecuencia

## Limitaciones Conocidas

1. **TTS Mock**: La función generate-speech actualmente devuelve audio mock. Para producción, integrar con:
   - Google Cloud Text-to-Speech
   - ElevenLabs API
   - Amazon Polly
   - Reve AI

2. **Parsing PDF**: El sistema extrae texto plano. PDFs con formato complejo pueden requerir procesamiento adicional.

3. **Plataforma Web**: Algunas características nativas (grabación de audio avanzada) tienen funcionalidad limitada en web.

## Próximos Pasos

### Para Producción

1. **Integrar TTS Real**:
   - Configurar API key de proveedor TTS
   - Actualizar función `generate-speech`
   - Implementar caché de audio

2. **Mejorar Parser PDF**:
   - Usar librería PDF más robusta
   - Manejar formatos de guión variados
   - Detección de acotaciones escénicas

3. **Voice Activity Detection**:
   - Implementar VAD real para detectar fin de habla del usuario
   - Auto-trigger de respuestas TTS

4. **Testing**:
   - Unit tests para parser
   - Integration tests para flujo completo
   - E2E tests para UI

5. **Performance**:
   - Optimizar carga de escenas largas
   - Implementar paginación
   - Precarga de audio TTS

## Soporte

Para problemas o preguntas sobre el código, revisar:
- Logs de Supabase Edge Functions
- Console del navegador / dispositivo
- Documentación de Expo: https://docs.expo.dev
- Documentación de Supabase: https://supabase.com/docs

## Licencia

Proyecto MVP - Todos los derechos reservados
