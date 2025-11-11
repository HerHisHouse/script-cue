Pruebas de usabilidad: Selección múltiple y acciones

Objetivos
- Validar icono de “Selección múltiple” (círculo “O”) en “Mis proyectos” y “Grabaciones”.
- Confirmar consistencia visual (posición, tamaño, color) en todas las vistas y modos (lista/cuadrícula).
- Verificar acciones: Eliminar con confirmación, Mover (Enviar a…) y Compartir con caducidad configurable.

Checklist visual
- El icono de “Selección múltiple” es un círculo vacío y mantiene tamaño ~18px.
- Ubicación: dentro del menú de encabezado, junto a otros ítems.
- Colores adaptan al tema: `colors.text` en reposo, estado activo mantiene texto.
- En barra de selección: acciones visibles (Enviar, Compartir, Eliminar, Cancelar).

Flujos a validar
1) Activar selección múltiple
   - Abrir menú del encabezado y tocar “Selección múltiple”.
   - Tocar varios elementos; el contador incrementa correctamente.
   - Long-press también inicia selección y marca elemento.

2) Eliminar múltiples
   - Con selección activa, tocar “Eliminar”.
   - Aparece confirmación con recuento; aceptar elimina sin errores.
   - Lista se actualiza; no quedan ids seleccionados.

3) Mover múltiples (Enviar a…)
   - En “Grabaciones”, tocar “Enviar a…”.
   - Seleccionar proyecto y carpeta destino; elementos se mueven.
   - Verificar que ya no aparecen en origen.

4) Compartir múltiples
   - Tocar “Compartir”.
   - Seleccionar caducidad (15m, 1h, 24h, 7d) o introducir minutos.
   - Al confirmar, se genera mensaje con enlaces firmados; sistema de compartir se abre.

Compatibilidad
- Validar en Web (Expo), iOS y Android en diferentes resoluciones.
- Revisar accesibilidad: tamaños táctiles mínimos (44x44), contraste suficiente.

Notas
- Errores se informan con `Alert`; revisar consola para `logger.error`.