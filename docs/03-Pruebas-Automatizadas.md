# Pruebas Automatizadas para Problemas Similares

Objetivo: prevenir recurrencias detectando patrones de errores conocidos.

Alcance actual
- Chequeos estáticos sin dependencias: importaciones de FileSystem, keys con index, uso de FileSystem en web, atob en app, expo-sharing sin guardas.

Ejecución
- Local: `npm run static-checks`.
- CI: incluido en `npm run ci` para push/PR y ejecución diaria.

Ampliaciones propuestas
- Añadir reglas para `setState` sin guardas en efectos con tareas asíncronas.
- Detectar `fetch` de blobs sin `Content-Type`.
- Validar presencia de `ErrorBoundary` global en la app.

Responsables
- RT: definir nuevas reglas.
- QA: validar falsos positivos/negativos.

Métricas
- Cobertura de reglas (nº de archivos analizados / totales).
- Ratio de falsos positivos por regla (<10%).

Cronograma
- Semana 1: baseline de reglas actuales.
- Semana 3: primera ampliación de reglas y evaluación.