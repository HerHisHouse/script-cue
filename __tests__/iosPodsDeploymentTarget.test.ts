// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applyPodsDeploymentTarget, MIN_IOS_DEPLOYMENT_TARGET } = require('../plugins/withIosPodsDeploymentTarget');

// Final del Podfile que genera `expo prebuild` (SDK 54).
const TEMPLATE = `target 'ScriptCue' do
  use_expo_modules!

  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => ccache_enabled?(podfile_properties),
    )
  end
end
`;

describe('plugin withIosPodsDeploymentTarget', () => {
  it('sube a 15.1 los pods por debajo, dentro del post_install', () => {
    const out: string = applyPodsDeploymentTarget(TEMPLATE);
    expect(MIN_IOS_DEPLOYMENT_TARGET).toBe('15.1');
    const postInstall = out.indexOf('post_install do |installer|');
    const block = out.indexOf("build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'");
    expect(block).toBeGreaterThan(postInstall);
    expect(out).toContain('deployment_target.to_f < 15.1');
    expect(out).toContain('react_native_post_install(');
  });

  it('es idempotente: ejecutar prebuild varias veces no duplica el bloque', () => {
    const once: string = applyPodsDeploymentTarget(TEMPLATE);
    const twice: string = applyPodsDeploymentTarget(once);
    expect(twice).toBe(once);
    expect(twice.match(/@generated begin ios-pods-deployment-target/g)).toHaveLength(1);
  });

  it('falla de forma explícita si cambia la plantilla del Podfile', () => {
    expect(() => applyPodsDeploymentTarget("target 'ScriptCue' do\nend\n")).toThrow(/post_install/);
  });
});
