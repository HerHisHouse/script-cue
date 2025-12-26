# Problema con Render Server (Plan Gratuito)

## Síntoma
Las grabaciones en Modo Estudio y Modo Casting fallan con error de red o timeout.

## Causa
El servidor de Render en plan gratuito se **duerme automáticamente** después de 15 minutos de inactividad. Cuando se duerme:
- La primera petición tarda 30-60 segundos en despertar el servidor
- Durante ese tiempo, las peticiones pueden fallar por timeout
- Las siguientes peticiones funcionan normalmente

## Soluciones

### Solución Temporal (Usuario)
1. Abre Modo Casting o Modo Estudio
2. Espera 1 minuto antes de grabar
3. El servidor se habrá despertado y las grabaciones funcionarán

### Solución Permanente (Requiere pago)
Actualizar a un plan de pago de Render ($7/mes) que mantiene el servidor siempre activo.

## Código Actual
La app ya incluye una función `wakeUpRenderServer()` que se llama al abrir Modo Casting para intentar despertar el servidor con anticipación.

## URL del Servidor
```
https://script-cue-merge-server.onrender.com
```

## Verificar Estado del Servidor
Puedes verificar si el servidor está activo visitando:
```
https://script-cue-merge-server.onrender.com/health
```

Si responde rápido (< 2 segundos), está despierto.
Si tarda > 30 segundos, estaba dormido y se está despertando.
