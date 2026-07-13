# Actualización de Base de Datos: Vinculación de Guiones Copiados

## Problema Resuelto

Cuando se copiaba un guion a un proyecto, se creaba una nueva entrada en la base de datos pero se perdía toda la configuración:
- Personajes
- Líneas de diálogo
- Tarjetas de estudio
- Configuración de voces

## Solución Implementada

Se ha agregado un campo `original_script_id` a la tabla `scripts` que mantiene una referencia al guion original. Cuando un guion es una copia:

1. El campo `original_script_id` apunta al guion original
2. Al cargar el guion, se detecta automáticamente que es una copia
3. Se cargan los personajes y líneas del guion original
4. La configuración se mantiene intacta

## Pasos para Aplicar la Actualización

### 1. Ejecutar el Script SQL en Supabase

1. Abre el dashboard de Supabase: https://supabase.com/dashboard
2. Selecciona tu proyecto
3. Ve a **SQL Editor** en el menú lateral
4. Crea una nueva query
5. Copia y pega el contenido del archivo `database/add_original_script_id.sql`
6. Ejecuta el script (botón "Run" o Cmd/Ctrl + Enter)

### 2. Verificar la Actualización

Ejecuta esta query para verificar que la columna se creó correctamente:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'scripts' AND column_name = 'original_script_id';
```

Deberías ver:
- `column_name`: original_script_id
- `data_type`: uuid
- `is_nullable`: YES

### 3. Probar la Funcionalidad

1. Abre la app
2. Ve a la pestaña "Guiones"
3. Selecciona un guion que ya tenga personajes configurados
4. Usa "Enviar a..." para copiar el guion a un proyecto
5. Ve a la pestaña "Proyectos"
6. Abre la carpeta donde copiaste el guion
7. Abre el guion copiado
8. Verifica que:
   - La pantalla de resumen muestra los personajes correctamente
   - Al entrar al modo estudio, aparecen las tarjetas de diálogo
   - La configuración de voces se mantiene

## Cambios en el Código

### Archivos Modificados:

1. **types/database.ts**
   - Agregado campo `original_script_id?: string | null` a la interfaz `Script`

2. **app/(tabs)/index.tsx**
   - Modificada función `performSendScript` para guardar `original_script_id` al copiar

3. **utils/loadDialogueLines.ts**
   - Modificada para detectar si un guion es una copia
   - Carga las líneas del guion original si `original_script_id` existe

4. **app/scripts/[id]/index.tsx**
   - Modificada función `loadData` para cargar personajes del guion original si es una copia

## Notas Importantes

- **Guiones copiados antes de esta actualización**: No tendrán `original_script_id` y seguirán mostrándose vacíos. Deberás copiarlos nuevamente.
- **Eliminación de guiones originales**: Si se elimina un guion original, el campo `original_script_id` se pondrá en NULL automáticamente (ON DELETE SET NULL), pero las copias seguirán existiendo sin vinculación.
- **Rendimiento**: Se ha creado un índice en `original_script_id` para optimizar las consultas.

## Compatibilidad

Esta actualización es **retrocompatible**:
- Los guiones existentes (sin `original_script_id`) seguirán funcionando normalmente
- Solo los nuevos guiones copiados tendrán la vinculación
- No se requieren migraciones de datos existentes
