# Controles de Pantalla de Bloqueo en iOS y Android

## ✅ Estado: IMPLEMENTADO

La librería `react-native-track-player` ha sido instalada y configurada para proporcionar controles nativos de pantalla de bloqueo en iOS y Android.

## Funcionalidades Implementadas

### iOS
- ✅ Controles en Centro de Control
- ✅ Controles en Pantalla de Bloqueo
- ✅ Información de "Now Playing" (título, artista)
- ✅ Barra de progreso interactiva
- ✅ Soporte para CarPlay
- ✅ Comandos de auriculares

### Android
- ✅ Notificación de Media
- ✅ Controles en pantalla de bloqueo
- ✅ Información de pista actual
- ✅ Integración con Bluetooth/auriculares

## Archivos Modificados/Creados

### Configuración
- `app.json` - Agregado plugin `react-native-track-player`
- `app/_layout.tsx` - Inicialización de TrackPlayer y registro del servicio

### Servicios
- `utils/trackPlayerService.ts` - Servicio principal de TrackPlayer
- `services/playbackService.ts` - Manejador de eventos remotos
- `hooks/useTrackPlayerRecordings.ts` - Hook para integrar en recordings.tsx

## Cómo Funciona

### 1. Inicialización
El servicio se inicializa automáticamente cuando la app arranca:

```typescript
// app/_layout.tsx
TrackPlayer.registerPlaybackService(() => PlaybackService);

// En AppRoot useEffect
await setupTrackPlayer();
```

### 2. Uso en Componentes
Para usar TrackPlayer en cualquier componente:

```typescript
import { useTrackPlayerRecordings } from '@/hooks/useTrackPlayerRecordings';

function MyComponent() {
  const {
    isPlaying,
    currentRecording,
    position,
    duration,
    togglePlayPause,
    skipToNext,
    skipToPrevious,
    seekTo,
    loadQueue,
  } = useTrackPlayerRecordings();

  // Cargar grabaciones
  await loadQueue(recordings, 0);

  // Controlar reproducción
  await togglePlayPause();
}
```

### 3. Eventos Remotos
Los eventos de la pantalla de bloqueo se manejan automáticamente en `services/playbackService.ts`:

- `RemotePlay` - Botón de reproducir
- `RemotePause` - Botón de pausar
- `RemoteNext` - Siguiente pista
- `RemotePrevious` - Pista anterior
- `RemoteSeek` - Barra de progreso
- `RemoteDuck` - Bajar volumen cuando hay otra app

## Integración con recordings.tsx

Para migrar completamente recordings.tsx a TrackPlayer:

1. Importar el hook:
```typescript
import { useTrackPlayerRecordings } from '@/hooks/useTrackPlayerRecordings';
```

2. Reemplazar la lógica de expo-av con el hook:
```typescript
const {
  isPlaying,
  currentRecording,
  position,
  duration,
  loadQueue,
  togglePlayPause,
  // ...
} = useTrackPlayerRecordings({
  onTrackChange: (index, track) => {
    console.log('Track changed:', index, track?.title);
  },
  onPlaybackEnd: () => {
    console.log('Playback ended');
  },
});
```

3. Usar `loadQueue` en lugar de `loadAndPlay`:
```typescript
// Antes (expo-av)
await loadAndPlay(index);

// Después (TrackPlayer)
await loadQueue(recordings, index);
```

## Siguiente Paso: Build Nativo

Para que los controles de pantalla de bloqueo funcionen, necesitas crear un nuevo build nativo:

```bash
# Para iOS
eas build --profile development --platform ios

# Para Android
eas build --profile development --platform android

# O para ambos
eas build --profile development --platform all
```

**IMPORTANTE:** Los controles de pantalla de bloqueo NO funcionarán con Expo Go. Debes usar el build nativo (development client).

## Verificar la Instalación

Después del build, verifica que todo funciona:

1. Abre la app instalada
2. Ve a "Grabaciones"
3. Reproduce cualquier grabación de audio
4. Bloquea la pantalla
5. ✅ Deberías ver los controles de reproducción

## Notas Técnicas

- TrackPlayer usa AVAudioSession en iOS para background audio
- El plugin configura automáticamente UIBackgroundModes
- Los videos siguen usando expo-av (no se pueden reproducir con TrackPlayer)
- El hook `useTrackPlayerRecordings` filtra automáticamente los videos

## Recursos

- [react-native-track-player docs](https://react-native-track-player.js.org/)
- [Expo Custom Native Code](https://docs.expo.dev/workflow/customizing/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
