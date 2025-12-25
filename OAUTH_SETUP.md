# Configuración de OAuth (Google y Apple) en Supabase

Este documento explica cómo configurar el inicio de sesión con Google y Apple en tu aplicación Script Cue.

## 📋 Requisitos Previos

- Cuenta de Supabase activa
- Cuenta de Google Cloud Platform (para Google OAuth)
- Cuenta de Apple Developer (para Sign in with Apple)

---

## 🔵 Configuración de Google OAuth

### 1. Crear Proyecto en Google Cloud Console

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Habilita la **Google+ API**

### 2. Configurar OAuth Consent Screen

1. Ve a **APIs & Services** → **OAuth consent screen**
2. Selecciona **External** (para usuarios públicos)
3. Completa la información:
   - **App name**: Script Cue
   - **User support email**: tu email
   - **Developer contact**: tu email
4. Añade los scopes necesarios:
   - `email`
   - `profile`
   - `openid`

### 3. Crear Credenciales OAuth 2.0

1. Ve a **APIs & Services** → **Credentials**
2. Click en **Create Credentials** → **OAuth 2.0 Client ID**
3. Selecciona **Web application**
4. Configura:
   - **Name**: Script Cue Web Client
   - **Authorized redirect URIs**: 
     - .
     - Para desarrollo local: `http://localhost:8081/auth/v1/callback`

5. Guarda el **Client ID** y **Client Secret**

### 4. Configurar en Supabase

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. Ve a **Authentication** → **Providers**
3. Habilita **Google**
4. Pega:
   - **Client ID** (de Google Cloud Console)
   - **Client Secret** (de Google Cloud Console)
5. Guarda los cambios

### 5. Configurar para iOS/Android (Expo)

Para apps nativas con Expo, necesitas configurar OAuth adicional:

1. **iOS**: Añade el **iOS URL Scheme** en Google Cloud Console
   - URL Scheme: `com.googleusercontent.apps.<REVERSED_CLIENT_ID>`
   
2. **Android**: Añade el **SHA-1 fingerprint** de tu app
   ```bash
   # Obtener SHA-1 para desarrollo
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
   ```

---

## 🍎 Configuración de Sign in with Apple

### 1. Configurar en Apple Developer

1. Ve a [Apple Developer Portal](https://developer.apple.com/account/)
2. Ve a **Certificates, Identifiers & Profiles**
3. Selecciona **Identifiers** → **App IDs**
4. Selecciona tu App ID (o crea uno nuevo)
5. Habilita **Sign in with Apple**
6. Configura:
   - **Enable as primary App ID**
   - Guarda los cambios

### 2. Crear Service ID

1. En **Identifiers**, click en **+** para crear nuevo
2. Selecciona **Services IDs**
3. Configura:
   - **Description**: Script Cue Sign in with Apple
   - **Identifier**: `com.tudominio.scriptcue.signin`
4. Habilita **Sign in with Apple**
5. Click en **Configure**:
   - **Primary App ID**: Selecciona tu App ID
   - **Domains and Subdomains**: `<tu-proyecto>.supabase.co`
   - **Return URLs**: `https://<tu-proyecto>.supabase.co/auth/v1/callback`

### 3. Crear Key para Sign in with Apple

1. Ve a **Keys** en Apple Developer
2. Click en **+** para crear nueva key
3. Configura:
   - **Key Name**: Script Cue Apple Sign In Key
   - Habilita **Sign in with Apple**
   - Click en **Configure** y selecciona tu Primary App ID
4. **Descarga la key** (.p8 file) - solo puedes hacerlo una vez
5. Guarda el **Key ID** y **Team ID**

### 4. Configurar en Supabase

1. Ve a **Authentication** → **Providers** en Supabase
2. Habilita **Apple**
3. Configura:
   - **Services ID**: El identifier que creaste (ej: `com.tudominio.scriptcue.signin`)
   - **Key ID**: De la key que creaste
   - **Team ID**: Tu Apple Team ID (lo encuentras en tu cuenta de developer)
   - **Private Key**: Pega el contenido del archivo .p8 que descargaste
4. Guarda los cambios

---

## 💻 Implementación en el Código

### 1. Instalar Dependencias

```bash
npx expo install expo-auth-session expo-crypto
```

### 2. Actualizar `app/auth.tsx`

Añade botones de OAuth:

```typescript
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';

// Configurar WebBrowser para OAuth
WebBrowser.maybeCompleteAuthSession();

// En el componente AuthScreen:
async function signInWithGoogle() {
  try {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: AuthSession.makeRedirectUri({
          scheme: 'scriptcue',
          path: 'auth/callback',
        }),
      },
    });

    if (error) throw error;
  } catch (error: any) {
    Alert.alert('Error', error.message);
  } finally {
    setLoading(false);
  }
}

async function signInWithApple() {
  try {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: AuthSession.makeRedirectUri({
          scheme: 'scriptcue',
          path: 'auth/callback',
        }),
      },
    });

    if (error) throw error;
  } catch (error: any) {
    Alert.alert('Error', error.message);
  } finally {
    setLoading(false);
  }
}
```

### 3. Añadir Botones en el UI

```tsx
{/* Después del botón de submit */}

<View style={styles.divider}>
  <View style={styles.dividerLine} />
  <Text style={styles.dividerText}>O continúa con</Text>
  <View style={styles.dividerLine} />
</View>

<View style={styles.socialButtons}>
  <TouchableOpacity
    style={[styles.socialButton, { backgroundColor: colors.surface }]}
    onPress={signInWithGoogle}
  >
    {/* Icono de Google */}
    <Text>Google</Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={[styles.socialButton, { backgroundColor: colors.surface }]}
    onPress={signInWithApple}
  >
    {/* Icono de Apple */}
    <Text>Apple</Text>
  </TouchableOpacity>
</View>
```

### 4. Configurar Deep Linking en `app.json`

```json
{
  "expo": {
    "scheme": "scriptcue",
    "ios": {
      "bundleIdentifier": "com.tudominio.scriptcue",
      "associatedDomains": [
        "applinks:<tu-proyecto>.supabase.co"
      ]
    },
    "android": {
      "package": "com.tudominio.scriptcue",
      "intentFilters": [
        {
          "action": "VIEW",
          "data": [
            {
              "scheme": "scriptcue"
            }
          ],
          "category": [
            "BROWSABLE",
            "DEFAULT"
          ]
        }
      ]
    }
  }
}
```

### 5. Manejar el Callback

Crea `app/auth/callback.tsx`:

```typescript
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '@/utils/supabase';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    // Supabase maneja automáticamente el callback
    // Solo necesitamos redirigir al usuario
    router.replace('/(tabs)');
  }, []);

  return null;
}
```

---

## 🧪 Testing

### Desarrollo Local
1. Ejecuta `npx expo start`
2. Prueba el flujo de OAuth en el simulador/emulador
3. Verifica que el callback funcione correctamente

### Producción
1. Construye la app con EAS Build
2. Prueba en dispositivos reales
3. Verifica que los deep links funcionen

---

## ⚠️ Consideraciones Importantes

1. **Verificación de Email**: Con OAuth, el email ya está verificado por Google/Apple
2. **Perfiles**: El trigger de la base de datos creará automáticamente el perfil
3. **Username**: Para usuarios de OAuth, puedes generar un username automático o pedirlo después del primer login
4. **Privacy Policy**: Google y Apple requieren que tengas una política de privacidad publicada

---

## 📚 Recursos Adicionales

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth/social-login)
- [Google OAuth Setup](https://developers.google.com/identity/protocols/oauth2)
- [Apple Sign In Setup](https://developer.apple.com/sign-in-with-apple/)
- [Expo Auth Session](https://docs.expo.dev/versions/latest/sdk/auth-session/)
