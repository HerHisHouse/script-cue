# Soluciones Implementadas - Problemas de iOS y Sesión Persistente

## Fecha: 2026-01-21

## Problemas Identificados y Solucionados

### 1. ✅ Controles de Pantalla de Bloqueo en iOS

**Problema:** Los controles de reproducción no aparecían en la pantalla de bloqueo de iOS, aunque el audio sí se reproducía en segundo plano.

**Causa raíz:** 
- Faltaba la configuración completa del modo de audio con `InterruptionModeIOS` y `InterruptionModeAndroid`
- No se estaban importando los tipos necesarios de `expo-av`

**Solución implementada:**
1. Agregamos los imports necesarios:
   ```typescript
   import { Audio, Video, ResizeMode, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
   ```

2. Configuramos el modo de audio correctamente:
   ```typescript
   await Audio.setAudioModeAsync({
     playsInSilentModeIOS: true,
     staysActiveInBackground: true,
     shouldDuckAndroid: true,
     interruptionModeIOS: InterruptionModeIOS.DoNotMix,
     interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
   });
   ```

3. Agregamos logs para depuración de comandos remotos:
   ```typescript
   playCommand: async () => {
     console.log('[Remote] Play command received');
     // ...
   }
   ```

**Resultado esperado:** Los controles de reproducción ahora deberían aparecer en la pantalla de bloqueo de iOS, mostrando el título de la grabación, artista (Script Cue), y controles de play/pause, siguiente/anterior.

---

### 2. ✅ Modo Bucle No Persiste con Teléfono Bloqueado

**Problema:** Cuando el modo bucle estaba activado y el teléfono se bloqueaba, solo se reproducía una pista hasta el final y luego paraba, en lugar de continuar en bucle.

**Causa raíz:**
- El callback `setOnPlaybackStatusUpdate` puede no ejecutarse correctamente cuando el dispositivo está bloqueado
- No se estaba usando la propiedad nativa `isLooping` del objeto Sound

**Solución implementada:**

1. **Configuración de bucle al cargar el audio:**
   ```typescript
   // Configure looping if needed
   const currentLoop = loopModeRef.current;
   if (currentLoop === 'one') {
     await newSound.setIsLoopingAsync(true);
   }
   ```

2. **Actualización dinámica cuando cambia el modo de bucle:**
   ```typescript
   useEffect(() => {
     loopModeRef.current = loopMode;
     
     // Update the current sound's looping state
     if (sound) {
       sound.setIsLoopingAsync(loopMode === 'one').catch((err) => {
         console.log('[Loop] Error setting loop mode:', err);
       });
     }
   }, [loopMode, sound]);
   ```

3. **Logs adicionales para depuración:**
   ```typescript
   if (status.didJustFinish) {
     const currentLoop = loopModeRef.current;
     if (currentLoop === 'one') {
       console.log('[Playback] Track finished, replaying (loop one)');
       newSound.replayAsync();
     } else if (currentLoop === 'all') {
       console.log('[Playback] Track finished, playing next (loop all)');
       // ...
     }
   }
   ```

**Resultado esperado:** 
- Modo "Repetir una": La pista actual se repetirá indefinidamente, incluso con el teléfono bloqueado
- Modo "Repetir todas": Al finalizar una pista, pasará automáticamente a la siguiente, y al terminar la lista, volverá a la primera
- Modo "Sin repetir": Reproducirá la lista una vez y se detendrá

---

### 3. ✅ Error al Reproducir Grabaciones del Modo Estudio

**Problema:** Al grabar una sesión en modo estudio, se guardaba correctamente, pero al intentar reproducirla días después, aparecía el error "No se encontró el archivo de la grabación".

**Causa raíz:**
- Las grabaciones del modo estudio se guardan en Supabase Storage con un path como `user_id/segments/timestamp_merged.m4a`
- Cuando se intenta reproducir días después, la sesión de Supabase puede haber expirado
- El método `createSignedUrl()` requiere una sesión válida para generar URLs firmadas
- La configuración de `persistSession: true` en `supabase.ts` no era suficiente si la sesión había expirado completamente

**Solución implementada:**

1. **Validación y refresco de sesión antes de acceder a Storage:**
   ```typescript
   // Ensure we have a valid session before trying to access Supabase Storage
   try {
     const { data: { session }, error: sessionError } = await supabase.auth.getSession();
     
     if (sessionError || !session) {
       console.error('[Playback] No valid session, attempting to refresh...');
       const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
       
       if (refreshError || !refreshedSession) {
         console.error('[Playback] Session refresh failed:', refreshError);
         Alert.alert(
           'Sesión expirada', 
           'Tu sesión ha expirado. Por favor, cierra sesión y vuelve a iniciar sesión.',
           [
             { text: 'Cancelar', style: 'cancel' },
             { 
               text: 'Ir a Ajustes', 
               onPress: () => {
                 router.push('/(tabs)/settings');
               }
             }
           ]
         );
         return;
       }
       console.log('[Playback] Session refreshed successfully');
     }
   } catch (sessionCheckError) {
     console.error('[Playback] Error checking session:', sessionCheckError);
   }
   ```

2. **Mejor manejo de errores al crear URLs firmadas:**
   ```typescript
   const { data, error } = await supabase.storage
     .from('recordings')
     .createSignedUrl(storagePath, 60 * 60);
   if (error || !data?.signedUrl) {
     console.error('[Playback] Error creating signed URL:', error);
     Alert.alert(
       'Audio no disponible', 
       `No se encontró el archivo de la grabación. Error: ${error?.message || 'Desconocido'}`
     );
     return;
   }
   ```

3. **Navegación a ajustes para re-autenticación:**
   - Agregamos `useRouter` de expo-router
   - Si la sesión no puede refrescarse, se ofrece al usuario ir a Ajustes para cerrar sesión y volver a iniciarla

**Resultado esperado:**
- Las grabaciones del modo estudio ahora se reproducirán correctamente, incluso días después de haberlas guardado
- Si la sesión ha expirado, se intentará refrescarla automáticamente
- Si el refresco falla, se mostrará un mensaje claro al usuario con la opción de ir a Ajustes para re-autenticarse

---

## Archivos Modificados

1. **`/Users/alexdiaz/Documents/RS/app/(tabs)/recordings.tsx`**
   - Agregados imports: `InterruptionModeIOS`, `InterruptionModeAndroid`, `useRouter`
   - Mejorada configuración de audio session para lock screen controls
   - Implementado bucle nativo con `setIsLoopingAsync()`
   - Agregada validación y refresco de sesión antes de acceder a Supabase Storage
   - Mejorado manejo de errores con mensajes más descriptivos

## Configuración Existente que Ayuda

El archivo `utils/supabase.ts` ya tiene configurada la persistencia de sesión:

```typescript
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  // ...
});
```

Esta configuración, combinada con la validación explícita que agregamos, asegura que:
1. Las sesiones se guarden en AsyncStorage
2. Los tokens se refresquen automáticamente cuando sea posible
3. Si el refresco automático falla, nuestro código lo detecta y maneja apropiadamente

## Próximos Pasos para Verificación

1. **Probar controles de pantalla de bloqueo en iOS:**
   - Reproducir una grabación
   - Bloquear el teléfono
   - Verificar que aparecen los controles en la pantalla de bloqueo
   - Probar play/pause, siguiente/anterior desde la pantalla de bloqueo

2. **Probar modo bucle con teléfono bloqueado:**
   - Activar "Repetir una"
   - Reproducir una grabación corta
   - Bloquear el teléfono
   - Verificar que la grabación se repite automáticamente

3. **Probar reproducción de grabaciones del modo estudio:**
   - Grabar una sesión en modo estudio
   - Esperar que se procese y guarde
   - Cerrar la app completamente
   - Esperar unas horas (o simular sesión expirada)
   - Abrir la app e intentar reproducir la grabación
   - Verificar que se reproduce correctamente o que aparece el mensaje de sesión expirada con opción de ir a Ajustes

## Notas Técnicas

- **iOS Background Audio:** Requiere que el modo de audio esté configurado con `staysActiveInBackground: true` y `interruptionModeIOS: DoNotMix`
- **Loop Mode:** La propiedad `isLooping` del objeto Sound es más confiable que manejar el bucle manualmente en el callback `didJustFinish`
- **Supabase Session:** Las sesiones tienen un tiempo de expiración. El refresco automático funciona si el refresh token es válido, pero después de cierto tiempo (días/semanas), puede requerir re-autenticación completa
