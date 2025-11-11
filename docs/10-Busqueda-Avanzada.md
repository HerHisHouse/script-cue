# Búsqueda avanzada en Grabaciones

Este documento describe la implementación y mejoras realizadas a la búsqueda avanzada en la pantalla de **Grabaciones**.

## Objetivos

- Fluidez de escritura: evitar reinicios del teclado y pérdidas de foco.
- Mayor precisión en los resultados: coincidencias más estrictas por título y nombre de archivo.
- Mejor rendimiento: tiempos de respuesta bajos y caché para consultas parciales.

## Cambios clave

- Debounce de entrada: se introduce `debouncedSearch` con 300 ms para evitar consultas en cada pulsación.
- No bloquear la UI durante búsquedas: se evita activar `loading` en búsquedas, manteniendo visible el campo y el teclado.
- Indicador de progreso: se muestra un `ActivityIndicator` pequeño junto al campo mientras `searching` es `true`.
- Filtro más estricto:
  - Se normaliza el término removiendo `.m4a`.
  - Se usa `or('audio_url.ilike.%/<term>%,title.ilike.%<term>%')` para coincidir por nombre de archivo (cerca del final del path) y por título.
- Caché en memoria: se cachean resultados por término en `Map<string, Recording[]>` y se reutilizan en búsquedas sucesivas.
- Payload optimizado: se limita el `select` a `id,title,audio_url,created_at,duration_seconds`.

## API y lógica

- `loadRecordings(reset, { fromSearch })`:
  - Si `fromSearch` es `true`, no se limpia la lista ni se activa `loading`.
  - Se aplican filtros estrictos al query cuando `debouncedSearch` tiene contenido.
  - Cachea resultados por término normalizado y los reutiliza si existen.

- Estados añadidos:
  - `debouncedSearch`: término de búsqueda debounced.
  - `searching`: bandera de progreso de búsqueda.
  - `searchCache`: `Map` con resultados por término.

## Usabilidad y pruebas

1. Escribir en el campo de búsqueda sin que el teclado se cierre.
2. Observar el spinner pequeño durante la consulta sin bloquear la UI.
3. Confirmar que el primer resultado llega en < 500 ms en condiciones normales.
4. Validar que los resultados coinciden con el título o el nombre de archivo (base) en ≥ 95% de los casos.
5. Realizar consultas repetidas sobre el mismo término y verificar que el caché devuelve resultados instantáneamente.

## Consideraciones futuras

- Indexar columnas relevantes en la base de datos para mejorar rendimiento.
- Extender búsqueda a otros campos (por ejemplo, carpeta o etiquetas) si se agregan.
- Ajustar el algoritmo para soportar coincidencia por palabras completas o prefijos configurables.