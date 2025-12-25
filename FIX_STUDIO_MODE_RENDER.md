# 🔧 Fix: Modo Estudio - Servidor de Render

## ❌ Problema Identificado

El Modo Estudio no estaba enviando los archivos al servidor de Render porque:

1. **URL incorrecta**: Usaba `Constants.expoConfig?.extra?.mergeServerUrl` que no existía
2. **Fallback a localhost**: Caía a `http://localhost:3000` (no funciona en móvil)
3. **Variable de entorno no usada**: `EXPO_PUBLIC_RENDER_SERVER_URL` no se estaba leyendo

---

## ✅ Solución Aplicada

### **Cambio en `studio-v2.tsx`:**

**Antes:**
```tsx
const mergeServerUrl = Constants.expoConfig?.extra?.mergeServerUrl || 'http://localhost:3000';
```

**Ahora:**
```tsx
const mergeServerUrl = process.env.EXPO_PUBLIC_RENDER_SERVER_URL || 'https://script-cue-merge-server.onrender.com';
console.log('[Merge] Server URL:', mergeServerUrl);
```

---

## 📝 Pasos para Verificar

### **1. Verificar archivo `.env`**

Asegúrate de que tu archivo `.env` contenga:

```env
EXPO_PUBLIC_RENDER_SERVER_URL=https://script-cue-merge-server.onrender.com
```

**Ubicación:** `/Users/alexdiaz/Documents/RS/.env`

Si no existe, créalo copiando `.env.example`:
```bash
cp .env.example .env
```

### **2. Reiniciar el servidor de desarrollo**

```bash
# Detener el servidor actual (Ctrl+C)
# Luego reiniciar:
npx expo start --clear
```

### **3. Verificar en los logs**

Cuando grabes una sesión, deberías ver:

```
[Merge] Server URL: https://script-cue-merge-server.onrender.com
[Merge] Attempting server merge at: https://script-cue-merge-server.onrender.com
```

**NO** debería decir `http://localhost:3000`

---

## 🧪 Testing

### **Test 1: Verificar URL**
1. Abrir Modo Estudio
2. Grabar una sesión corta
3. Guardar
4. ✅ Ver en logs: `[Merge] Server URL: https://script-cue-merge-server.onrender.com`

### **Test 2: Verificar Mezcla**
1. Grabar sesión completa
2. Guardar
3. ✅ Ver en logs de Render: Petición recibida
4. ✅ Audio mezclado correctamente

### **Test 3: Reproducción**
1. Ir a "Grabaciones"
2. Seleccionar la sesión guardada
3. ✅ Reproducir audio sin errores

---

## 🔍 Diagnóstico de Problemas

### **Si sigue diciendo "Network request failed":**

1. **Verificar `.env`:**
   ```bash
   cat .env | grep RENDER
   ```
   Debe mostrar: `EXPO_PUBLIC_RENDER_SERVER_URL=https://...`

2. **Verificar que el servidor de Render esté activo:**
   ```bash
   curl https://script-cue-merge-server.onrender.com/health
   ```
   Debe responder: `{"status":"ok","timestamp":"..."}`

3. **Verificar logs en tiempo real:**
   - Abrir consola de desarrollo
   - Buscar: `[Merge] Server URL:`
   - Debe mostrar la URL de Render, NO localhost

### **Si dice "Audio no disponible":**

Esto significa que el fallback guardó el primer segmento, pero:
- El path puede estar incorrecto
- El archivo no se subió correctamente

**Solución:**
- Asegurar que la URL del servidor esté correcta
- El servidor mezclará los archivos y devolverá un path válido

---

## 📊 Flujo Correcto

```
1. Usuario graba → Segmentos subidos a Supabase ✅
2. Al guardar → Lee EXPO_PUBLIC_RENDER_SERVER_URL ✅
3. Envía a: https://script-cue-merge-server.onrender.com/merge ✅
4. Render mezcla los archivos ✅
5. Devuelve path del archivo mezclado ✅
6. Guarda en BD con path correcto ✅
7. Usuario puede reproducir ✅
```

---

## ⚠️ IMPORTANTE

**Debes reiniciar el servidor de desarrollo** para que los cambios en `.env` y el código surtan efecto:

```bash
# En la terminal donde corre Expo:
Ctrl+C

# Luego:
npx expo start --clear
```

---

## 🎯 Checklist

- [ ] Archivo `.env` existe y tiene `EXPO_PUBLIC_RENDER_SERVER_URL`
- [ ] Servidor de desarrollo reiniciado con `--clear`
- [ ] Logs muestran URL de Render (no localhost)
- [ ] Servidor de Render está activo (verificar con `/health`)
- [ ] Grabación de prueba funciona
- [ ] Audio se reproduce correctamente

---

🔧✨ **¡Ahora el Modo Estudio debería funcionar correctamente!**
