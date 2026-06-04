# 🔐 Credenciales del Keystore de Android - ScriptCue

## ⚠️ INFORMACIÓN CONFIDENCIAL - NO COMPARTIR

**Fecha de creación:** 6 de Febrero 2026
**Válido hasta:** 24 de Junio 2053 (27 años)

---

## 📋 Detalles del Keystore

### **Archivo:**
- **Ubicación:** `/Users/alexdiaz/Documents/RS/android/app/script-cue-release.keystore`
- **Tipo:** PKCS12
- **Tamaño de clave:** 2048 bits RSA

### **Credenciales:**
- **Alias:** `script-cue-key`
- **Contraseña del keystore:** `ScriptCue2026`
- **Contraseña de la clave:** `ScriptCue2026`

### **Propietario:**
```
CN=Alex Diaz
OU=Development
O=ScriptCue
L=Madrid
ST=Madrid
C=ES
```

### **Huellas Digitales:**
- **SHA1:** `04:FD:E1:B2:26:F8:6F:40:84:FE:9F:08:97:FC:40:0C:CF:2A:BD:92`
- **SHA256:** `90:30:9F:AD:F5:24:80:4F:AD:57:68:CC:13:FD:AB:C2:43:62:D3:67:E3:74:55:9F:2A:1B:B4:44:7A:5F:47:29`

---

## 💾 Backups

### **Ubicaciones de Backup Recomendadas:**

1. **Backup local:**
   - Copia el archivo `.keystore` a un disco externo
   - Guarda este documento con las credenciales

2. **Backup en la nube (cifrado):**
   - Google Drive (en carpeta privada)
   - iCloud Drive
   - 1Password / LastPass (para las credenciales)

3. **Backup del keystore antiguo:**
   - Ubicación: `/Users/alexdiaz/Documents/RS/android/app/script-cue-release.keystore.backup`
   - **NO USAR** - Solo para referencia

---

## 🔧 Uso del Keystore

### **Compilar APK de Release:**
```bash
cd /Users/alexdiaz/Documents/RS/android
./gradlew assembleRelease
```

### **Compilar AAB (Android App Bundle) para Play Store:**
```bash
cd /Users/alexdiaz/Documents/RS/android
./gradlew bundleRelease
```

### **Ubicación del APK generado:**
```
/Users/alexdiaz/Documents/RS/android/app/build/outputs/apk/release/app-release.apk
```

### **Ubicación del AAB generado:**
```
/Users/alexdiaz/Documents/RS/android/app/build/outputs/bundle/release/app-release.aab
```

---

## ⚠️ IMPORTANTE

### **Nunca pierdas este keystore:**
- ❌ Si pierdes el keystore, **NO podrás actualizar** la app en Google Play Store
- ❌ Tendrás que publicar una app completamente nueva con un paquete diferente
- ✅ Haz backups regulares en múltiples ubicaciones

### **Mantén las credenciales seguras:**
- ❌ No las subas a GitHub
- ❌ No las compartas por email
- ❌ No las guardes en texto plano sin cifrar
- ✅ Usa un gestor de contraseñas (1Password, LastPass, etc.)

---

## 📝 Verificar el Keystore

Para verificar que el keystore funciona correctamente:

```bash
keytool -list -v -keystore /Users/alexdiaz/Documents/RS/android/app/script-cue-release.keystore -storepass "ScriptCue2026"
```

---

## 🔄 Cambiar la Contraseña (Opcional)

Si quieres cambiar la contraseña en el futuro:

```bash
# Cambiar contraseña del keystore
keytool -storepasswd -keystore /Users/alexdiaz/Documents/RS/android/app/script-cue-release.keystore

# Cambiar contraseña de la clave
keytool -keypasswd -alias script-cue-key -keystore /Users/alexdiaz/Documents/RS/android/app/script-cue-release.keystore
```

Después, actualiza el archivo `android/keystore.properties` con las nuevas contraseñas.

---

## 📱 Publicar en Google Play Store

### **Pasos:**

1. **Compilar AAB:**
   ```bash
   cd android && ./gradlew bundleRelease
   ```

2. **Firmar el AAB** (ya está firmado automáticamente con el keystore)

3. **Subir a Google Play Console:**
   - Ve a https://play.google.com/console
   - Selecciona tu app
   - Production → Create new release
   - Sube el archivo `.aab`

4. **Completar información:**
   - Notas de la versión
   - Capturas de pantalla
   - Descripción

---

## 🆘 Recuperación de Emergencia

Si pierdes el keystore pero tienes un APK firmado antiguo:

1. **Extrae el certificado del APK:**
   ```bash
   unzip -p app-release.apk META-INF/*.RSA | keytool -printcert
   ```

2. **Compara las huellas digitales** con las de arriba

3. **Si coinciden**, puedes usar ese APK para extraer el certificado

**PERO:** Esto NO te dará la clave privada, solo el certificado público.

---

## 📞 Contacto

**Desarrollador:** Alex Díaz  
**Proyecto:** ScriptCue  
**Fecha:** 6 de Febrero 2026

---

**¡GUARDA ESTE DOCUMENTO EN UN LUGAR SEGURO!** 🔒
