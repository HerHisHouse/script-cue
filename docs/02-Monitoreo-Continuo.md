# Sistema de Monitoreo Continuo

Objetivo: detectar degradaciones y errores antes de impactar a usuarios.

Estrategia
- CI en push/PR y ejecución diaria programada (GitHub Actions).
- Chequeos estáticos para patrones de riesgo (importaciones, keys, APIs web).
- Export web opcional para detectar roturas de build.

Implementación técnica
- Workflow `.github/workflows/ci.yml` ejecuta `npm run ci` y `npm run build:web` (con tolerancia de fallo).
- Script `tools/static-checks.js` analiza archivos `app/` y `utils/`.

Alertas y reportes
- Notificaciones de fallos vía GitHub (checks fallidos en PRs).
- Reporte semanal de tendencias: tasa de fallos de CI, errores por regla.

Responsables
- DevOps: mantenimiento del pipeline y cron diario.
- RT: definición y actualización de reglas estáticas.

Métricas
- % de ejecuciones CI exitosas.
- Nº de errores por categoría (filesystem, keys, web APIs).
- Tiempo medio en arreglar un fallo de CI.

Cronograma
- Semana 1: activar CI y cron diario.
- Semana 2: tablero de métricas y primer informe.