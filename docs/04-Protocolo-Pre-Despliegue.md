# Protocolo de Verificación Previa a Implementaciones

Checklist obligatoria
- `npm run ci` exitoso (typecheck, lint, chequeos estáticos).
- Export web: `npm run build:web` sin errores.
- Revisión de cambios en funciones Edge (Deno): no aplicar type-check local, validar en entorno Supabase.
- Validación de guardas `isMounted` en flujos asíncronos modificados.
- Revisión de claves de lista: evitar `key={index}`.

Procedimiento
- Autor del cambio ejecuta checklist y adjunta resultados al PR.
- Revisor técnico valida riesgos y pruebas.
- DevOps verifica que el pipeline CI pasó y aprueba el merge.

Responsables
- Autor, RT, DevOps.

Métricas
- % de PRs con checklist completa.
- Fallos post-despliegue por PR.

Cronograma
- Semana 1: adopción del checklist en plantillas de PR.