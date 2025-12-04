# Configuración Final de Google OAuth

## ✅ Código Implementado

Ya he implementado todo el código necesario para Google OAuth:

1. ✅ Dependencias instaladas (`expo-auth-session`, `expo-crypto`, `expo-web-browser`)
2. ✅ Botón de "Continuar con Google" en la pantalla de auth
3. ✅ Función `signInWithGoogle()` que maneja el flujo OAuth
4. ✅ Callback handler en `app/auth/callback.tsx`
5. ✅ Deep linking configurado con scheme `scriptcue://`

## 🔧 Configuración Pendiente en Supabase

Para que funcione, necesitas completar estos pasos en Supabase:

### 1. Obtener la URL de Callback de Supabase

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. Ve a **Settings** → **API**
3. Copia la **URL** de tu proyecto (algo como `https://xxxxx.supabase.co`)
4. Tu callback URL será: `https://xxxxx.supabase.co/auth/v1/callback`

### 2. Configurar en Google Cloud Console

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Selecciona tu proyecto (o crea uno nuevo)
3. Ve a **APIs & Services** → **Credentials**
4. Si ya creaste las credenciales OAuth 2.0, edítalas. Si no:
   - Click en **Create Credentials** → **OAuth 2.0 Client ID**
   - Tipo: **Web application**
   - Nombre: `Script Cue`

5. En **Authorized redirect URIs**, añade:
   ```
   https://xxxxx.supabase.co/auth/v1/callback
   ```
   (Reemplaza `xxxxx` con tu project ID de Supabase)

6. Guarda y copia:
   - **Client ID**
   - **Client Secret**

### 3. Configurar en Supabase Dashboard

1. Ve a tu proyecto en Supabase
2. Ve a **Authentication** → **Providers**
3. Busca **Google** y habilítalo
4. Pega:
   - **Client ID** (de Google Cloud Console)
   - **Client Secret** (de Google Cloud Console)
5. **Guarda los cambios**

### 4. Configurar Redirect URL en Supabase (Importante)

1. En **Authentication** → **URL Configuration**
2. En **Redirect URLs**, añade:
   ```
   scriptcue://auth/callback
   ```
3. Guarda los cambios

## 🧪 Probar en Desarrollo

### Opción 1: Expo Go (Más Fácil)

1. Asegúrate de que Expo Go esté actualizado
2. Ejecuta:
   ```bash
   npx expo start
   ```
3. Escanea el QR con Expo Go
4. Prueba el botón "Continuar con Google"

### Opción 2: Development Build (Recomendado para Producción)

Si Expo Go no funciona bien con OAuth, crea un development build:

```bash
# Para iOS
eas build --profile development --platform ios

# Para Android
eas build --profile development --platform android
```

## 📱 Configuración Adicional para Producción

### Para iOS

1. En Google Cloud Console, crea un **iOS OAuth Client**:
   - Tipo: **iOS**
   - Bundle ID: `com.alexdiaz.scriptcue`
   
2. Añade el **iOS URL Scheme** en `app.json`:
   ```json
   "ios": {
     "bundleIdentifier": "com.alexdiaz.scriptcue",
     "associatedDomains": [
       "applinks:xxxxx.supabase.co"
     ]
   }
   ```

### Para Android

1. Obtén el SHA-1 fingerprint:
   ```bash
   # Para desarrollo
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
   
   # Para producción (después de crear el keystore)
   keytool -list -v -keystore path/to/your/keystore.jks -alias your-alias
   ```

2. En Google Cloud Console:
   - Crea un **Android OAuth Client**
   - Package name: `com.alexdiaz.scriptcue`
   - SHA-1: El que obtuviste del comando anterior

## 🔍 Verificar que Funciona

1. **Recarga la app** (o reinicia Expo)
2. Ve a la pantalla de **Login**
3. Deberías ver el botón **"Continuar con Google"**
4. Al hacer click:
   - Se abrirá un navegador
   - Te pedirá que selecciones tu cuenta de Google
   - Después de autorizar, volverás a la app
   - Deberías estar logueado automáticamente

## ⚠️ Troubleshooting

### "Error: Invalid redirect URI"
- Verifica que la URL de callback en Google Cloud Console sea exactamente: `https://xxxxx.supabase.co/auth/v1/callback`
- Verifica que hayas añadido `scriptcue://auth/callback` en Supabase → URL Configuration

### "Error: Access blocked"
- Asegúrate de haber configurado el **OAuth Consent Screen** en Google Cloud Console
- Para desarrollo, añade tu email como "Test user"

### El navegador se abre pero no vuelve a la app
- Verifica que el scheme en `app.json` sea `scriptcue`
- Verifica que la URL de callback en Supabase incluya `scriptcue://auth/callback`

### "Error: User not found" después de login
- El trigger de la base de datos debería crear el perfil automáticamente
- Verifica en Supabase → Table Editor → profiles que se creó el perfil
- Si no, ejecuta manualmente:
  ```sql
  INSERT INTO public.profiles (id, username, full_name)
  SELECT id, raw_user_meta_data->>'email', raw_user_meta_data->>'full_name'
  FROM auth.users
  WHERE id = 'USER_ID_AQUI';
  ```

## 📚 Recursos

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Google OAuth Setup](https://developers.google.com/identity/protocols/oauth2)
- [Expo Auth Session](https://docs.expo.dev/versions/latest/sdk/auth-session/)

## ✅ Checklist Final

Antes de probar, verifica que hayas completado:

- [ ] Creado credenciales OAuth en Google Cloud Console
- [ ] Configurado redirect URI en Google Cloud Console
- [ ] Habilitado Google provider en Supabase
- [ ] Pegado Client ID y Secret en Supabase
- [ ] Añadido `scriptcue://auth/callback` en Supabase URL Configuration
- [ ] Recargado la app

¡Listo! Si sigues estos pasos, Google OAuth debería funcionar perfectamente. 🚀
