const {
    withInfoPlist,
    withEntitlementsPlist,
    withAndroidManifest,
    createRunOncePlugin,
} = require('@expo/config-plugins');

/**
 * Plugin personalizado para react-native-track-player
 * Agrega las configuraciones necesarias para iOS y Android
 */
function withTrackPlayer(config) {
    // Configurar Info.plist para background audio en iOS
    config = withInfoPlist(config, (config) => {
        const plist = config.modResults;

        // Asegurar que UIBackgroundModes existe
        if (!plist.UIBackgroundModes) {
            plist.UIBackgroundModes = [];
        }

        // Agregar 'audio' si no existe
        if (!plist.UIBackgroundModes.includes('audio')) {
            plist.UIBackgroundModes.push('audio');
        }

        return config;
    });

    // Configurar AndroidManifest.xml para background audio en Android
    config = withAndroidManifest(config, (config) => {
        const androidManifest = config.modResults.manifest;

        // Agregar permisos necesarios
        if (!androidManifest['uses-permission']) {
            androidManifest['uses-permission'] = [];
        }

        const permissions = [
            'android.permission.FOREGROUND_SERVICE',
            'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
            'android.permission.WAKE_LOCK',
        ];

        permissions.forEach(permission => {
            const permissionExists = androidManifest['uses-permission'].some(
                p => p.$?.['android:name'] === permission
            );

            if (!permissionExists) {
                androidManifest['uses-permission'].push({
                    $: { 'android:name': permission },
                });
            }
        });

        return config;
    });

    return config;
}

module.exports = createRunOncePlugin(
    withTrackPlayer,
    'react-native-track-player',
    '3.0.0'
);
