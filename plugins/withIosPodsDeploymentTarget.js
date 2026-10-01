const { withPodfile } = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

/**
 * Plugin de Expo: sube a iOS 15.1 el IPHONEOS_DEPLOYMENT_TARGET de todos los targets de Pods.
 *
 * Algunos pods de terceros (RNCAsyncStorage, RNSVG, ReachabilitySwift…) traen sub-targets de
 * "resource bundle" con un deployment target propio antiguo (12.0-13.4) que react_native_post_install
 * no corrige. Los Xcode que solo admiten 15.0+ fallan con "The iOS deployment target
 * 'IPHONEOS_DEPLOYMENT_TARGET' is set to 12.4, but the range of supported deployment target versions
 * is 15.0 to …", aunque la app ya esté en 15.1.
 *
 * ios/ no está en git (se regenera con `expo prebuild` y en cada build de EAS), por eso el arreglo
 * vive aquí y no en el Podfile a mano. Solo sube los que están por debajo; nunca baja ninguno.
 */
const MIN_IOS_DEPLOYMENT_TARGET = '15.1';
const TAG = 'ios-pods-deployment-target';

const POST_INSTALL_BLOCK = `    # Pods con deployment target por debajo de ${MIN_IOS_DEPLOYMENT_TARGET} (plugins/withIosPodsDeploymentTarget.js)
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        deployment_target = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if deployment_target && deployment_target.to_f < ${MIN_IOS_DEPLOYMENT_TARGET}
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_IOS_DEPLOYMENT_TARGET}'
        end
      end
    end`;

function applyPodsDeploymentTarget(podfile) {
  return mergeContents({
    src: podfile,
    newSrc: POST_INSTALL_BLOCK,
    tag: TAG,
    anchor: /post_install do \|installer\|/,
    offset: 1,
    comment: '#',
  }).contents;
}

const withIosPodsDeploymentTarget = (config) =>
  withPodfile(config, (cfg) => {
    cfg.modResults.contents = applyPodsDeploymentTarget(cfg.modResults.contents);
    return cfg;
  });

module.exports = withIosPodsDeploymentTarget;
module.exports.applyPodsDeploymentTarget = applyPodsDeploymentTarget;
module.exports.MIN_IOS_DEPLOYMENT_TARGET = MIN_IOS_DEPLOYMENT_TARGET;
