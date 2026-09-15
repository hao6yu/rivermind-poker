const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const MARKER = '# rivermind: raise third-party pod deployment targets';
const MINIMUM_TARGET = '15.1';

/**
 * Xcode 26/27 refuse to build pods whose IPHONEOS_DEPLOYMENT_TARGET predates
 * the SDK's supported range ("15.0 to 27.0.x"): react-native-svg ships a
 * 12.4 target and SDWebImage a 9.0 target, so `pod install` output fails at
 * build-planning time even though the app minimum (expo-build-properties) is
 * iOS 15.1. Expo regenerates ios/Podfile on every prebuild, so the raise has
 * to live in a config plugin rather than a hand edit.
 */
function raisePodDeploymentTargets(podfile) {
  if (podfile.includes(MARKER)) return podfile;

  const anchor = podfile.indexOf('post_install do |installer|');
  if (anchor === -1) return podfile;

  const blockEnd = podfile.indexOf('\n  end\n', anchor);
  if (blockEnd === -1) return podfile;

  const hook = [
    '',
    `    ${MARKER} (Xcode 26/27 reject pre-15.0 targets; the app minimum is`,
    '    # iOS 15.1 via expo-build-properties).',
    '    installer.pods_project.targets.each do |target|',
    "      target.build_configurations.each do |config|",
    "        if config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < 15.0",
    `          config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MINIMUM_TARGET}'`,
    '        end',
    '      end',
    '    end',
  ].join('\n');

  return podfile.slice(0, blockEnd) + hook + podfile.slice(blockEnd);
}

function withIosPodDeploymentTargets(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      if (fs.existsSync(podfilePath)) {
        fs.writeFileSync(podfilePath, raisePodDeploymentTargets(
          fs.readFileSync(podfilePath, 'utf8'),
        ));
      }
      return config;
    },
  ]);
}

module.exports = withIosPodDeploymentTargets;
module.exports.raisePodDeploymentTargets = raisePodDeploymentTargets;
module.exports.MARKER = MARKER;
module.exports.MINIMUM_TARGET = MINIMUM_TARGET;
