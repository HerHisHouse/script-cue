# 🔍 Verificar y Corregir Permisos de Supabase Storage

## Problema Actual
Error: "Error de subida después de 3 intentos. Network request failed"
- ✅ Llega al 40% (antes solo 4%)
- ❌ Se corta la conexión a mitad de subida

## Posibles Causas

### 1. Timeout de Supabase (SOLUCIONADO)
- ✅ Aumentado de 2 minutos → **5 minutos**
- Archivo modificado: `utils/supabase.ts`

### 2. Permisos RLS en Storage (VERIFICAR)

## 📋 Pasos para Verificar Permisos

### Paso 1: Acceder a Supabase Dashboard
1. Ir a: https://app.supabase.com
2. Iniciar sesión
3. Seleccionar tu proyecto

### Paso 2: Verificar Bucket 'scripts'
1. En el menú lateral → **Storage**
2. Buscar el bucket llamado **"scripts"**
3. Si NO existe:
   - Click en "New bucket"
   - Nombre: `scripts`
   - Public: **NO** (dejar desmarcado)
   - Click "Create bucket"

### Paso 3: Verificar Políticas (RLS)
1. Click en el bucket **"scripts"**
2. Click en la pestaña **"Policies"**
3. Deberías ver 4 políticas:
   - ✅ Users can upload their own scripts (INSERT)
   - ✅ Users can read their own scripts (SELECT)
   - ✅ Users can update their own scripts (UPDATE)
   - ✅ Users can delete their own scripts (DELETE)

### Paso 4: Si NO hay políticas o están mal configuradas

#### Opción A: Usar SQL Editor (Recomendado)
1. En el menú lateral → **SQL Editor**
2. Click en "New query"
3. Copiar y pegar el contenido de: `supabase/storage-policies.sql`
4. Click en "Run" (▶️)
5. Verificar que dice "Success"

#### Opción B: Crear manualmente
1. En Storage → Bucket "scripts" → Policies
2. Click "New policy"
3. Para cada política:

**Política 1: Upload (INSERT)**
```sql
Policy name: Users can upload their own scripts
Allowed operation: INSERT
Target roles: authenticated
USING expression: (dejar vacío)
WITH CHECK expression:
bucket_id = 'scripts' AND (storage.foldername(name))[1] = auth.uid()::text
```

**Política 2: Read (SELECT)**
```sql
Policy name: Users can read their own scripts
Allowed operation: SELECT
Target roles: authenticated
USING expression:
bucket_id = 'scripts' AND (storage.foldername(name))[1] = auth.uid()::text
WITH CHECK expression: (dejar vacío)
```

**Política 3: Update (UPDATE)**
```sql
Policy name: Users can update their own scripts
Allowed operation: UPDATE
Target roles: authenticated
USING expression:
bucket_id = 'scripts' AND (storage.foldername(name))[1] = auth.uid()::text
WITH CHECK expression:
bucket_id = 'scripts' AND (storage.foldername(name))[1] = auth.uid()::text
```

**Política 4: Delete (DELETE)**
```sql
Policy name: Users can delete their own scripts
Allowed operation: DELETE
Target roles: authenticated
USING expression:
bucket_id = 'scripts' AND (storage.foldername(name))[1] = auth.uid()::text
WITH CHECK expression: (dejar vacío)
```

### Paso 5: Verificar Configuración del Bucket
1. Storage → Bucket "scripts" → Settings
2. Verificar:
   - ✅ **Public**: NO (debe estar desmarcado)
   - ✅ **File size limit**: 52428800 (50MB) o mayor
   - ✅ **Allowed MIME types**: `application/pdf` o `*/*`

## 🧪 Probar Después de Configurar

1. **Recargar la app** en Android (agitar → Reload)
2. **Intentar importar un guión** pequeño primero (< 2MB)
3. Si funciona, probar con uno más grande

## 📊 Diagnóstico Adicional

### Si sigue fallando después de configurar permisos:

#### 1. Verificar tamaño del archivo
```bash
# En tu computadora, verificar tamaño del PDF
ls -lh /ruta/al/archivo.pdf
```

Si es > 10MB, puede tardar mucho en conexiones lentas.

#### 2. Verificar logs de Supabase
1. Supabase Dashboard → Logs → Storage
2. Filtrar por errores recientes
3. Buscar mensajes relacionados con tu usuario

#### 3. Verificar autenticación
En la app, verificar que estás autenticado:
- Ir a "Ajustes"
- Verificar que aparece tu email
- Si no, cerrar sesión y volver a iniciar

## 🔧 Soluciones Alternativas

### Si el archivo es muy grande (>5MB):

#### Opción 1: Comprimir el PDF
```bash
# En Mac/Linux
gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook \
   -dNOPAUSE -dQUIET -dBATCH \
   -sOutputFile=output-compressed.pdf input.pdf
```

#### Opción 2: Aumentar límite en Supabase
1. Storage → Bucket "scripts" → Settings
2. File size limit: Aumentar a 104857600 (100MB)

## ✅ Checklist de Verificación

- [ ] Bucket "scripts" existe
- [ ] Bucket es PRIVADO (no público)
- [ ] 4 políticas RLS configuradas correctamente
- [ ] File size limit es suficiente (≥50MB)
- [ ] Usuario está autenticado en la app
- [ ] Timeout aumentado a 5 minutos (código actualizado)
- [ ] App recargada después de cambios

## 🆘 Si Nada Funciona

Proporciona esta información:
1. ✅ Tamaño del archivo PDF (en MB)
2. ✅ Screenshot de Storage → Bucket "scripts" → Policies
3. ✅ Screenshot de los logs de error en Supabase
4. ✅ Tipo de conexión (WiFi/Datos móviles)
5. ✅ Velocidad de conexión aproximada

---

**Próximo paso**: Ejecuta el SQL en `supabase/storage-policies.sql` y recarga la app.
