const { withMainApplication, withMainActivity, withAppDelegate } = require('@expo/config-plugins');

/**
 * Plugin de Expo: limita el tamaño de letra del sistema que respeta la app (~115%).
 *
 * Si el usuario tiene la letra del móvil por encima del tope (en Samsung es habitual tenerla al 130%
 * o más), la app la trata como el tope; por debajo no se toca nada. Evita que el diseño se rompa con
 * letras enormes sin quitar del todo la accesibilidad. Con React 19 ya no existe
 * Text.defaultProps para poner maxFontSizeMultiplier global, por eso se hace en nativo.
 *
 * Android: React Native lee la escala de dos sitios, así que se limita en ambos:
 * - Resources de la Application: DisplayMetricsHolder (conversión sp→px de todo <Text>) y
 *   PixelRatio.getFontScale() en JS.
 * - Contexto de la Activity: la escala que Fabric pasa a cada superficie.
 *
 * iOS: Fabric calcula el multiplicador con RCTFontSizeMultiplier(), que lee
 * UIApplication.preferredContentSizeCategory; se intercambia ese getter por uno que no pasa de
 * .extraLarge (multiplicador 1.118 en React Native, el escalón más cercano al 115% sin superarlo).
 */
const MAX_FONT_SCALE = 1.15;
const IOS_MAX_CONTENT_SIZE_CATEGORY = '.extraLarge';
const MARKER = '// @generated font-scale-clamp';

const ANDROID_HELPERS = `
${MARKER}: tope de tamaño de letra del sistema (plugins/withMaxFontScale.js)
internal const val MAX_FONT_SCALE = ${MAX_FONT_SCALE.toFixed(2)}f

@Suppress("DEPRECATION")
internal fun clampFontScale(resources: android.content.res.Resources) {
  val current = resources.configuration
  if (current.fontScale <= MAX_FONT_SCALE) return
  val clamped = Configuration(current).apply { fontScale = MAX_FONT_SCALE }
  resources.updateConfiguration(clamped, resources.displayMetrics)
}

internal fun fontScaleClampedContext(base: android.content.Context): android.content.Context {
  val current = base.resources.configuration
  if (current.fontScale <= MAX_FONT_SCALE) return base
  return base.createConfigurationContext(Configuration(current).apply { fontScale = MAX_FONT_SCALE })
}
`;

const IOS_HELPERS = `
${MARKER}: tope de tamaño de letra del sistema (plugins/withMaxFontScale.js)
extension UIApplication {
  static let fontScaleClampMaxCategory: UIContentSizeCategory = ${IOS_MAX_CONTENT_SIZE_CATEGORY}

  static func installFontScaleClamp() {
    guard
      let original = class_getInstanceMethod(UIApplication.self, #selector(getter: UIApplication.preferredContentSizeCategory)),
      let clamped = class_getInstanceMethod(UIApplication.self, #selector(getter: UIApplication.fontScaleClampedCategory))
    else { return }
    method_exchangeImplementations(original, clamped)
  }

  // Tras el intercambio, llamar a fontScaleClampedCategory ejecuta el getter original del sistema
  // (dynamic fuerza el envío por el runtime de ObjC, sin él Swift se llamaría a sí mismo).
  @objc dynamic var fontScaleClampedCategory: UIContentSizeCategory {
    let system = self.fontScaleClampedCategory
    return system > UIApplication.fontScaleClampMaxCategory ? UIApplication.fontScaleClampMaxCategory : system
  }
}
`;

function withMaxFontScaleMainApplication(config) {
  return withMainApplication(config, (config) => {
    let src = config.modResults.contents;
    if (config.modResults.language !== 'kt') {
      throw new Error('withMaxFontScale: se esperaba MainApplication en Kotlin');
    }
    if (src.includes(MARKER)) return config;

    if (!src.includes('import android.content.res.Configuration')) {
      src = src.replace(/^(package .+\n)/m, '$1\nimport android.content.res.Configuration\n');
    }
    src = src.replace(/\nclass MainApplication/, `${ANDROID_HELPERS}\nclass MainApplication`);
    // Antes de cargar React Native, para que DisplayMetricsHolder ya lea la escala limitada.
    src = src.replace(
      /(override fun onCreate\(\) \{\n\s*super\.onCreate\(\)\n)/,
      `$1    clampFontScale(resources) ${MARKER}\n`,
    );
    src = src.replace(
      /(override fun onConfigurationChanged\(newConfig: Configuration\) \{\n\s*super\.onConfigurationChanged\(newConfig\)\n)/,
      `$1    clampFontScale(resources) ${MARKER}\n`,
    );

    const hooks = src.split(`clampFontScale(resources) ${MARKER}`).length - 1;
    if (hooks !== 2) {
      throw new Error('withMaxFontScale: no se encontró onCreate/onConfigurationChanged en MainApplication.kt');
    }
    config.modResults.contents = src;
    return config;
  });
}

function withMaxFontScaleMainActivity(config) {
  return withMainActivity(config, (config) => {
    const src = config.modResults.contents;
    if (config.modResults.language !== 'kt') {
      throw new Error('withMaxFontScale: se esperaba MainActivity en Kotlin');
    }
    if (src.includes(MARKER)) return config;

    const override = `
  ${MARKER}
  override fun attachBaseContext(newBase: android.content.Context) {
    super.attachBaseContext(fontScaleClampedContext(newBase))
  }
`;
    const next = src.replace(/(class MainActivity : ReactActivity\(\) \{\n)/, `$1${override}`);
    if (next === src) {
      throw new Error('withMaxFontScale: no se encontró la clase MainActivity');
    }
    config.modResults.contents = next;
    return config;
  });
}

function withMaxFontScaleAppDelegate(config) {
  return withAppDelegate(config, (config) => {
    let src = config.modResults.contents;
    if (config.modResults.language !== 'swift') {
      throw new Error('withMaxFontScale: se esperaba AppDelegate en Swift');
    }
    if (src.includes(MARKER)) return config;

    if (!/^import UIKit$/m.test(src)) {
      src = src.replace(/^(import Expo\n)/m, '$1import UIKit\n');
    }
    src = src.replace(/\n@UIApplicationMain/, `${IOS_HELPERS}\n@UIApplicationMain`);
    // Antes de arrancar React Native, para que la primera superficie ya mida con el tope.
    src = src.replace(
      /(didFinishLaunchingWithOptions launchOptions: [^\n]*\n\s*\) -> Bool \{\n)/,
      `$1    UIApplication.installFontScaleClamp() ${MARKER}\n`,
    );

    if (!src.includes(`UIApplication.installFontScaleClamp() ${MARKER}`) || !src.includes('extension UIApplication')) {
      throw new Error('withMaxFontScale: no se encontró didFinishLaunchingWithOptions en AppDelegate.swift');
    }
    config.modResults.contents = src;
    return config;
  });
}

module.exports = function withMaxFontScale(config) {
  config = withMaxFontScaleMainApplication(config);
  config = withMaxFontScaleMainActivity(config);
  config = withMaxFontScaleAppDelegate(config);
  return config;
};
