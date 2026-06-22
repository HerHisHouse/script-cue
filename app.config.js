// Dynamic Expo config to support identifier coexistence across environments.
// Uses APP_ID_SUFFIX to switch between dev/preview/prod IDs without breaking the dev client.

const BASE_BUNDLE_ID = "com.alexdiaz.scriptcue";
const BASE_PACKAGE_ID = "com.alexdiaz.scriptcue";

function withSuffix(base, suffix) {
  if (!suffix) return base;
  const normalized = suffix.startsWith(".") ? suffix : `.${suffix}`;
  return `${base}${normalized}`;
}

export default ({ config }) => {
  const suffix = process.env.APP_ID_SUFFIX || ""; // e.g., ".dev", ".preview", "" for production
  const bundleIdentifier = withSuffix(BASE_BUNDLE_ID, suffix);
  const packageId = withSuffix(BASE_PACKAGE_ID, suffix);

  return {
    // IMPORTANT: return top-level keys (no nested `expo` here)
    ...config,
    name: "ScriptCue",
    slug: "script-cue",
    scheme: "myapp",
    plugins: [
      ...(config.plugins || []),
    ],
    ios: {
      ...(config.ios || {}),
      bundleIdentifier,
    },
    android: {
      ...(config.android || {}),
      package: packageId,
    },
    extra: {
      ...(config.extra || {}),
      appIdBase: {
        ios: BASE_BUNDLE_ID,
        android: BASE_PACKAGE_ID,
      },
      appIdEffective: {
        ios: bundleIdentifier,
        android: packageId,
      },
      appIdSuffix: suffix,
      // Preserve `extra.eas` if present; EAS CLI puede rellenar `projectId` en app.json
      eas: {
        ...(config.extra?.eas || {}),
      },
    },
  };
};

