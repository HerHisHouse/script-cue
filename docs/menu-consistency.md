# Consistencia del menú de tres puntos

Este documento resume la implementación y verificación de consistencia del menú de encabezado (tres puntos) en las pantallas:

- `Mis guiones` (`app/(tabs)/index.tsx`)
- `Mis proyectos` (`app/(tabs)/projects.tsx`)
- `Grabaciones` (`app/(tabs)/recordings.tsx`)

## Diseño y opciones

- Ícono: `MoreVertical` con tamaño 22 y color de texto del tema.
- Opciones y orden:
  1. `Búsqueda avanzada` (toggla barra de búsqueda)
  2. `Selección múltiple` (activa/desactiva modo selección y limpia selección)
  3. `Vista de cuadrícula` / `Vista de lista` (alternancia según estado actual)

## Comportamientos

- Click en `Búsqueda avanzada` muestra/oculta la barra de búsqueda bajo el encabezado.
- Click en `Selección múltiple` alterna el modo y resetea los elementos seleccionados.
- Click en `Vista de cuadrícula`/`Vista de lista` alterna `numColumns` de la `FlatList`.

## Permisos

- El menú es visible para usuarios autenticados y no autenticados; las acciones que dependen de datos (p.ej., carga de guiones) siguen las políticas RLS existentes por `user_id`.
- No se detectaron roles adicionales en el modelo; no se aplica gating por roles específicos.

## Diferencias menores

- `Mis guiones` utiliza una barra de búsqueda simplificada (campo de texto y botón de limpiar) para mantener paridad funcional. `Grabaciones` incorpora filtros adicionales por atributos del registro.
- Estilos se alinean con los tokens de tema (`colors.text`, `colors.border`, etc.). La altura de los contenedores puede variar levemente por la estructura de cada pantalla.

## Pruebas

- Se agregó `__tests__/menuConsistency.test.ts` para validar presencia del botón de menú y el orden inicial de las opciones.