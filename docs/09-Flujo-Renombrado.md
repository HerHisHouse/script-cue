# Flujo de Renombrado de Grabaciones

Este documento describe el flujo funcional y técnico para renombrar archivos de audio en la pantalla **Grabaciones**.

## Resumen

- El usuario abre el **menú de tres puntos** en una tarjeta (lista o cuadrícula) y selecciona **Renombrar**.
- Se muestra un **modal** con el nombre actual precargado. El usuario introduce el nuevo nombre.
- El sistema valida el nombre y, si es válido, renombra el archivo en **Supabase Storage** y actualiza `audio_url` y `title` en la tabla `recordings`.
- La lista se **refresca** y se muestra una notificación de éxito o error.

## Validaciones de nombre

- Longitud máxima: 80 caracteres.
- Caracteres permitidos: letras, números, espacio, guion, guion bajo y punto.
- No se permiten `"/"` ni `"\\"`.
- Si no se especifica extensión, se **conserva** la del archivo original; fallback `m4a`.

## Detalles técnicos

- Utilidad principal: `utils/rename.ts`.
  - `validateAndNormalizeFilename(input, fallbackExt)`: normaliza y valida el nombre.
  - `buildNewPath(oldPath, finalFilename)`: genera el nuevo `audio_url` manteniendo el directorio.
  - `performRename(supabase, recording, inputName)`: realiza la operación completa (duplicados, mover, actualizar DB, rollback best-effort).
- UI:
  - `app/(tabs)/recordings.tsx` → `handleRename` abre el modal y precarga el nombre; `saveRename` llama a `performRename`.
  - Menú contextual con `zIndex` elevado y botones en lista/cuadrícula.

## Políticas de Storage necesarias

Para que el renombrado funcione en Web/iOS/Android, el bucket `recordings` debe permitir **mover** objetos del usuario autenticado. Se incluyen migraciones en `supabase/migrations/20251105000000_add_recordings_bucket_policy.sql` que:

- Crean el bucket `recordings` si no existe.
- Añaden políticas `SELECT`, `INSERT`, `UPDATE` y `DELETE` en `storage.objects` restringidas a archivos bajo el prefijo `auth.uid()/...`.

## Pruebas

- Unitarias: `utils/__tests__/rename.test.ts` (validación y construcción de rutas).
- Integración simulada: `utils/__tests__/rename.integration.test.ts` (flujo completo con mock de Supabase).

## Consideraciones de UX y accesibilidad

- El botón de menú en cuadrícula tiene `position: 'absolute'` y `elevation` (Android) para evitar solapes.
- Las tarjetas usan `overflow: 'visible'` para que el menú no se recorte.
- Se pueden añadir `accessibilityLabel` y `KeyboardAvoidingView` si se requiere comportamiento adicional en iOS.