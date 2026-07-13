# ⚡ Guía Rápida - Verificación de Correcciones

## 🎯 Objetivo
Verificar que las correcciones del error "Network request failed" funcionan correctamente en Android.

---

## 📝 Checklist Pre-Build

Antes de reconstruir el APK, verifica que estos archivos tienen los cambios:

### ✅ 1. `utils/supabase.ts`
```bash
grep -A 5 "X-Client-Info" utils/supabase.ts
```
**Debe mostrar**: `'X-Client-Info': 'supabase-js-react-native'`

### ✅ 2. `app/import-script.tsx`
```bash
grep "fileBlob" app/import-script.tsx | head -1
```
**Debe mostrar**: `let fileBlob: Blob;`

### ✅ 3. `app.json`
```bash
grep -A 2 "INTERNET" app.json
```
**Debe mostrar**: `"INTERNET"` y `"ACCESS_NETWORK_STATE"`

### ✅ 4. Plugin existe
```bash
ls -la plugins/withAndroidNetworkConfig.js
```
**Debe mostrar**: El archivo existe

---

## 🚀 Reconstruir APK

### Opción A: Script Automático (Recomendado)
```bash
./rebuild-android.sh
```

### Opción B: Comando Manual
```bash
eas build --platform android --profile preview
```

**Tiempo estimado**: 10-15 minutos

---

## 📱 Instalación en Dispositivo

1. **Descargar APK** desde el link que proporciona EAS
2. **Transferir a Android** (USB, email, Drive, etc.)
3. **Instalar** (puede requerir "Permitir instalación de fuentes desconocidas")
4. **Abrir la app**

---

## 🧪 Prueba de Funcionamiento

### Test 1: Importación Básica
1. Abrir app → Tab "Mis guiones"
2. Pulsar botón "+" (arriba a la derecha)
3. Seleccionar "Importar Guion"
4. Seleccionar un PDF de tu dispositivo
5. Configurar personajes
6. Pulsar "Importar guion"

**✅ Resultado esperado**:
- Barra de progreso visible
- Mensaje: "Importando el guion..."
- Progreso aumenta gradualmente
- Redirección a pantalla del guion
- **NO** aparece "Network request failed"

**❌ Si falla**:
- Continuar con Test 2 (Logs)

---

### Test 2: Verificar Logs (Avanzado)

#### Conectar dispositivo por USB
```bash
# Verificar que el dispositivo está conectado
adb devices

# Ver logs en tiempo real
adb logcat | grep -i "upload\|supabase\|network"
```

#### Intentar importar guion de nuevo

**✅ Logs esperados**:
```
[Upload] Using FileSystem for Android...
[Upload] File size: 2.45 MB
[Upload] Uploading to Supabase Storage...
[Upload] Attempt 1/3
[Upload] Upload successful!
```

**❌ Logs de error** (si falla):
```
[Upload] Attempt 1/3
[Upload] Attempt 1 failed: [mensaje de error]
[Upload] Attempt 2/3
[Upload] Attempt 2 failed: [mensaje de error]
[Upload] Attempt 3/3
```

Si ves esto, copia el mensaje de error completo.

---

### Test 3: Verificar Conectividad

Si los tests anteriores fallan:

1. **Abrir navegador** en el dispositivo Android
2. **Visitar**: `https://www.google.com`
3. **Verificar** que carga correctamente

Si el navegador no funciona:
- ❌ Problema de conectividad del dispositivo
- ✅ Conectar a WiFi o datos móviles

Si el navegador funciona pero la app no:
- 📧 Reportar el error con los logs del Test 2

---

## 🔍 Diagnóstico de Problemas

### Problema: "Network request failed" persiste

#### Verificación 1: Variables de entorno
```bash
cat .env | grep SUPABASE
```

**Debe mostrar**:
```
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

Si están vacías o incorrectas, actualízalas.

#### Verificación 2: Bucket de Supabase
1. Ir a [Supabase Dashboard](https://app.supabase.com)
2. Seleccionar tu proyecto
3. Storage → Buckets
4. Verificar que existe bucket `scripts`
5. Verificar políticas de acceso (RLS)

#### Verificación 3: Permisos de la app
En el dispositivo Android:
1. Configuración → Apps → Script Cue
2. Permisos
3. Verificar que tiene:
   - ✅ Almacenamiento
   - ✅ Archivos y multimedia

---

### Problema: Build falla

#### Error: "EAS CLI not found"
```bash
npm install -g eas-cli
```

#### Error: "Not logged in"
```bash
eas login
```

#### Error: "Project not configured"
```bash
eas build:configure
```

---

## 📊 Tabla de Verificación Rápida

| Paso | Acción | Estado |
|------|--------|--------|
| 1 | Verificar cambios en código | ⬜ |
| 2 | Reconstruir APK | ⬜ |
| 3 | Instalar en dispositivo | ⬜ |
| 4 | Test 1: Importación básica | ⬜ |
| 5 | Test 2: Verificar logs (opcional) | ⬜ |
| 6 | Test 3: Verificar conectividad (si falla) | ⬜ |

---

## ✅ Confirmación Final

Si el Test 1 pasa exitosamente:
- ✅ **El problema está resuelto**
- 🎉 Puedes usar la app normalmente
- 📝 Marca este issue como cerrado

---

## 🆘 Si Nada Funciona

1. **Recopilar información**:
   - Logs completos del Test 2
   - Versión de Android del dispositivo
   - Tamaño del archivo PDF que intentas subir
   - Velocidad de conexión a Internet

2. **Verificar casos especiales**:
   - ¿El PDF es muy grande? (>50MB)
   - ¿La conexión es muy lenta? (<1 Mbps)
   - ¿Hay un firewall o VPN activo?

3. **Consultar documentación técnica**:
   - Ver `ANDROID_NETWORK_FIX.md` para detalles técnicos
   - Ver `CAMBIOS_ANDROID.md` para resumen de cambios

---

## 📞 Contacto

Si necesitas ayuda adicional, proporciona:
- ✅ Logs del Test 2
- ✅ Versión de Android
- ✅ Tamaño del archivo
- ✅ Tipo de conexión (WiFi/Datos móviles)
