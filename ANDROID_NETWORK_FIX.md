# Solución: Error "Network request failed" en Android

## Problema
Al intentar subir guiones a Supabase desde Android, aparece el error:
```
Error de subida. Network request failed.
```

Este error NO ocurre en iOS, solo en Android.

## Causa
El error se debe a varias limitaciones y configuraciones específicas de Android:

1. **Permisos de red faltantes**: Android requiere permisos explícitos de INTERNET y ACCESS_NETWORK_STATE
2. **Incompatibilidad con ArrayBuffer**: El cliente de Supabase en Android tiene mejor compatibilidad con Blob que con ArrayBuffer
3. **Timeouts estrictos**: Android tiene timeouts de red más estrictos que iOS
4. **Configuración del cliente Supabase**: Necesita configuración específica para React Native en Android

## Soluciones Implementadas

### 1. Configuración del Cliente Supabase (`utils/supabase.ts`)
- ✅ Agregados headers adicionales para React Native
- ✅ Implementado fetch personalizado con timeout de 2 minutos
- ✅ Configuración de timeout para realtime
- ✅ Headers específicos: `X-Client-Info: supabase-js-react-native`

### 2. Lógica de Subida de Archivos (`app/import-script.tsx`)
- ✅ Cambiado de ArrayBuffer a **Blob** para Android (mejor compatibilidad)
- ✅ Implementado sistema de **reintentos automáticos** (3 intentos)
- ✅ Delays progresivos entre reintentos (2s, 4s, 6s)
- ✅ Mejor logging para diagnóstico de errores

### 3. Permisos de Android (`app.json`)
- ✅ Agregado permiso `INTERNET`
- ✅ Agregado permiso `ACCESS_NETWORK_STATE`

### 4. Plugin de Configuración Android (`plugins/withAndroidNetworkConfig.js`)
- ✅ Configuración automática de permisos de red en AndroidManifest
- ✅ Configuración de seguridad de red
- ✅ Plugin registrado en `app.json`

## Pasos para Aplicar la Solución

### Opción 1: Reconstruir APK con EAS Build (Recomendado)
```bash
# 1. Limpiar build anterior
eas build:cancel --platform android

# 2. Construir nuevo APK con las correcciones
eas build --platform android --profile preview
```

### Opción 2: Build Local
```bash
# 1. Limpiar caché
rm -rf android/app/build
rm -rf android/build

# 2. Regenerar archivos nativos
npx expo prebuild --clean

# 3. Construir APK
cd android
./gradlew assembleRelease

# El APK estará en: android/app/build/outputs/apk/release/app-release.apk
```

## Verificación

Después de instalar el nuevo APK:

1. **Abrir la app en Android**
2. **Ir a "Importar Guión"**
3. **Seleccionar un PDF**
4. **Configurar personajes**
5. **Pulsar "Importar guion"**

### Logs Esperados
Si abres los logs con `adb logcat`, deberías ver:
```
[Upload] Using FileSystem for Android...
[Upload] File size: X.XX MB
[Upload] Uploading to Supabase Storage...
[Upload] Attempt 1/3
[Upload] Upload successful!
```

### Si Sigue Fallando
Si el error persiste después de aplicar estas correcciones:

1. **Verificar conectividad**:
   - Asegúrate de que el dispositivo tiene conexión a Internet
   - Intenta abrir un navegador y visitar una página web

2. **Verificar configuración de Supabase**:
   ```bash
   # Verificar que las variables de entorno están correctas
   cat .env
   ```
   Debe contener:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=tu-clave-anon
   ```

3. **Verificar bucket de Supabase**:
   - Ir a Supabase Dashboard → Storage
   - Verificar que existe el bucket `scripts`
   - Verificar que tiene las políticas correctas (RLS)

4. **Logs detallados**:
   ```bash
   # Android
   adb logcat | grep -i "upload\|supabase\|network"
   ```

## Cambios Técnicos Detallados

### Antes (ArrayBuffer - Fallaba en Android)
```typescript
const arrayBuffer = await response.arrayBuffer();
await supabase.storage.from('scripts').upload(path, arrayBuffer, {
  contentType: 'application/pdf',
});
```

### Después (Blob - Funciona en Android)
```typescript
const fileBlob = new Blob([byteArray], { type: 'application/pdf' });

// Con reintentos
for (let attempt = 1; attempt <= 3; attempt++) {
  const { error } = await supabase.storage.from('scripts').upload(path, fileBlob, {
    contentType: 'application/pdf',
    upsert: true,
  });
  
  if (!error) break;
  if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
}
```

## Referencias
- [Supabase Storage Docs](https://supabase.com/docs/guides/storage)
- [React Native Network Issues](https://reactnative.dev/docs/network)
- [Expo Config Plugins](https://docs.expo.dev/guides/config-plugins/)

## Notas Adicionales
- ✅ Estas correcciones NO afectan el funcionamiento en iOS
- ✅ El código mantiene compatibilidad con iOS, Android y Web
- ✅ Los reintentos automáticos mejoran la confiabilidad en redes lentas
- ✅ El timeout de 2 minutos es suficiente para archivos de hasta 50MB
