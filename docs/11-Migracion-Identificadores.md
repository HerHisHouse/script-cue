# Migración de Identificadores de Aplicación (Android/iOS)

Este documento describe la migración completa y limpia de los identificadores únicos de la app a `Script Cue`, asegurando coexistencia temporal y compatibilidad con el dev client.

## Nuevos Identificadores
- iOS `bundleIdentifier` base: `com.alexdiaz.scriptcue`
- Android `applicationId` base: `com.alexdiaz.scriptcue`

## Coexistencia por Entornos
Se introduce `APP_ID_SUFFIX` para permitir builds paralelos sin conflictos:
- Desarrollo: `APP_ID_SUFFIX=.dev` → `com.alexdiaz.scriptcue.dev`
- Preview: `APP_ID_SUFFIX=.preview` → `com.alexdiaz.scriptcue.preview`
- Producción: `APP_ID_SUFFIX=""` → `com.alexdiaz.scriptcue`

### Implementación
- `app.config.js`: genera dinámicamente `ios.bundleIdentifier` y `android.package` según `APP_ID_SUFFIX`.
- `eas.json`: perfiles con `env.APP_ID_SUFFIX` para development/preview/production.
- iOS Xcode (`pbxproj`):
  - Debug → `PRODUCT_BUNDLE_IDENTIFIER = com.alexdiaz.scriptcue.dev`
  - Release → `PRODUCT_BUNDLE_IDENTIFIER = com.alexdiaz.scriptcue`

## Dev Client y URL Schemes
- Se mantienen los esquemas existentes para evitar roturas del dev client.
- `Info.plist` incluye ambos:
  - `exp+bolt-expo-nativewind` (antiguo)
  - `exp+script-cue` (nuevo)
  - `com.alexx223.boltexponativewind` (antiguo)
  - `com.alexdiaz.scriptcue` (nuevo)

## Archivos Modificados
- `app.json`: actualiza `ios.bundleIdentifier` y `android.package` al ID base nuevo.
- `app.config.js`: configuración dinámica por entorno.
- `eas.json`: perfiles con `APP_ID_SUFFIX`.
- `ios/boltexponativewind.xcodeproj/project.pbxproj`: actualiza `PRODUCT_BUNDLE_IDENTIFIER` para Debug/Release.
- `ios/boltexponativewind/Info.plist`: añade nuevos URL schemes y mantiene los antiguos.

## Pruebas y Verificación
1. Web (Expo): arrancar `npm run dev -- --web --port 8086` y comprobar UI.
2. iOS Dev Client:
   - Abrir el proyecto en Xcode, esquema Debug, compilar en dispositivo/simulador.
   - Validar que el dev client se abre y carga la app (sin cambios manuales en esquemas).
3. EAS Build:
   - `eas build --profile development --platform ios` y `--platform android` (IDs con `.dev`).
   - `eas build --profile production --platform ios|android` (IDs sin sufijo).

## Consideraciones
- Provisioning iOS: asegúrate de tener certificados y perfiles de provisioning para ambos IDs (dev y prod).
- Play Console / App Store: al ser IDs distintos, cada sufijo crea una app diferente (útil para pruebas internas).
- Módulos Expo: mantener ambos URL schemes permite transición sin necesidad de reinstalar dev clients existentes.

## Rollback
Si fuera necesario revertir, modifica `APP_ID_SUFFIX` a su estado anterior y restablece `PRODUCT_BUNDLE_IDENTIFIER` en pbxproj.

