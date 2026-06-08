const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Plugin de Expo para configurar Android con soporte completo de red
 * Esto es necesario para que Supabase funcione correctamente en Android
 */
module.exports = function withAndroidNetworkConfig(config) {
    return withAndroidManifest(config, async (config) => {
        const androidManifest = config.modResults;

        // Asegurar que existe el elemento manifest
        if (!androidManifest.manifest) {
            androidManifest.manifest = {};
        }

        // Agregar permisos de red si no existen
        if (!androidManifest.manifest['uses-permission']) {
            androidManifest.manifest['uses-permission'] = [];
        }

        const permissions = androidManifest.manifest['uses-permission'];

        // Permisos necesarios para red
        const requiredPermissions = [
            'android.permission.INTERNET',
            'android.permission.ACCESS_NETWORK_STATE',
        ];

        requiredPermissions.forEach((permission) => {
            const exists = permissions.some(
                (p) => p.$?.['android:name'] === permission
            );
            if (!exists) {
                permissions.push({
                    $: { 'android:name': permission },
                });
            }
        });

        // Configurar usesCleartextTraffic para desarrollo (permite HTTP en desarrollo)
        if (!androidManifest.manifest.application) {
            androidManifest.manifest.application = [{}];
        }

        const application = androidManifest.manifest.application[0];
        if (!application.$) {
            application.$ = {};
        }

        // Permitir tráfico de texto claro para que Expo Dev Client conecte con localhost (HTTP)
        application.$['android:usesCleartextTraffic'] = 'true';

        // Configurar networkSecurityConfig para mejor compatibilidad
        application.$['android:networkSecurityConfig'] = '@xml/network_security_config';

        return config;
    });
};
