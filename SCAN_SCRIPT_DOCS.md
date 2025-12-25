# Escaneo de Guiones - Documentación

## Funcionalidad Implementada

### 1. OCR con OpenAI Vision API

La función `process-ocr` ahora utiliza **OpenAI GPT-4o Vision** para extraer texto de imágenes escaneadas de guiones.

**Características:**
- ✅ Procesamiento de múltiples páginas
- ✅ Extracción de texto de alta precisión
- ✅ Mantiene formato original (nombres, diálogos, acotaciones)
- ✅ Soporte para español
- ✅ Manejo de errores robusto

**Archivo:** `/supabase/functions/process-ocr/index.ts`

### 2. Flujo Completo

```
1. Usuario captura fotos del guión
   ↓
2. Imágenes se suben a Supabase Storage
   ↓
3. Se llama a process-ocr con las URLs
   ↓
4. OpenAI Vision extrae el texto
   ↓
5. Se crea el script en la BD
   ↓
6. Se llama a parse-pdf con el texto extraído
   ↓
7. OpenAI parsea escenas y diálogos
   ↓
8. Usuario es redirigido a configuración de personajes
```

### 3. Configuración Requerida

**Variable de Entorno:**
```bash
OPENAI_API_KEY=sk-...
```

Debe estar configurada en Supabase Dashboard:
- Settings → Edge Functions → Secrets
- Añadir: `OPENAI_API_KEY`

### 4. Modelo Utilizado

- **OCR:** `gpt-4o` con Vision
- **Parsing:** `gpt-4o-mini` (ya configurado en parse-pdf)

### 5. Costos Aproximados

**OpenAI Vision (gpt-4o):**
- ~$0.01 por imagen (detail: high)
- Guión de 10 páginas: ~$0.10

**Parsing (gpt-4o-mini):**
- ~$0.001 por guión promedio

### 6. Limitaciones

- Máximo 4096 tokens por respuesta de OCR
- Calidad depende de la imagen (recomendado: buena iluminación, sin sombras)
- Funciona mejor con guiones impresos que manuscritos

### 7. Mejoras Futuras Sugeridas

1. **Compresión de imágenes** antes de subir (reducir costos de storage)
2. **Vista previa del texto extraído** antes de procesar
3. **Edición manual** del texto OCR antes del parsing
4. **Batch processing** para guiones muy largos
5. **Caché de OCR** para evitar reprocesar la misma imagen

## Testing

Para probar:
1. Abrir app → Escanear Guión
2. Permitir acceso a cámara
3. Capturar 1-3 páginas de un guión
4. Ingresar título
5. Presionar "Procesar Guión"
6. Esperar ~10-30 segundos (depende del número de páginas)
7. Verificar que se redirige a configuración de personajes

## Troubleshooting

**Error: "Error al procesar las imágenes"**
- Verificar que OPENAI_API_KEY esté configurada
- Revisar logs en Supabase Dashboard → Edge Functions → process-ocr

**Error: "Error al procesar el texto"**
- Verificar que parse-pdf esté desplegada
- Revisar logs de parse-pdf

**Texto extraído incorrecto:**
- Mejorar calidad de las fotos (buena luz, enfoque)
- Capturar páginas individuales (no múltiples páginas en una foto)
