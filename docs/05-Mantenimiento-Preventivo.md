# Plan de Mantenimiento Preventivo

Objetivo: reducir probabilidad de fallos por deriva técnica o cambios en dependencias.

Tareas periódicas
- Revisión mensual de dependencias críticas (expo, react-native, supabase-js).
- Auditoría de patrones: `FileSystem` en web, listas con keys, guardas `isMounted`.
- Limpieza de código y actualización de documentación.

Calendario
- Semana 2 de cada mes: auditoría y actualización.
- Trimestral: revisión mayor de dependencias y compatibilidad.

Responsables
- RT: decisiones de actualización.
- DevOps: compatibilidad de CI.
- Equipo: refactors menores.

Métricas
- Nº de tareas preventivas ejecutadas / planificadas.
- Incidencias en el mes siguiente a mantenimiento.

Retroalimentación
- Informe mensual con hallazgos y acciones.