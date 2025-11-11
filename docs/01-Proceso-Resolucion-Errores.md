# Proceso de Resolución de Errores

Objetivo: documentar cómo identificar, reproducir, corregir y verificar errores con trazabilidad.

Alcance: todo el código del monorepo (app, utils, supabase/functions).

Flujo estándar
- Detección: por CI (lint, typecheck, chequeos estáticos) o reporte manual.
- Triage en 24h: clasificar criticidad (bloqueante, alta, media, baja).
- Reproducción: pasos claros, entorno, versiones, logs adjuntos.
- Corrección: aplicar patch mínimo viable con pruebas locales.
- Verificación: ejecutar `npm run ci` y pruebas afectadas.
- Cierre: PR con descripción, impacto y riesgos.
- Postmortem (si bloqueante): causa raíz, acciones permanentes.

Asignación de responsables
- Responsable Técnico (RT): priorización y decisiones de diseño.
- QA: verificación y pruebas de regresión.
- DevOps: salud de CI y workflows.
- Autor del cambio: implementación y documentación.

Métricas
- MTTR (tiempo medio de resolución).
- Nº de incidencias bloqueantes por mes.
- % de errores detectados por CI vs. producción.

Retroalimentación
- Plantillas de issue/PR con secciones de impacto y riesgos.
- Revisión semanal de incidencias y aprendizaje.

Cronograma
- Semana 1: adopción del proceso y plantillas.
- Semana 2: primera revisión semanal y ajuste fino.