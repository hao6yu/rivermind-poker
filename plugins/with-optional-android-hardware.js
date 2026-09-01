const { withAndroidManifest } = require('expo/config-plugins');

const CAMERA_FEATURE = 'android.hardware.camera';

/**
 * Android and Google Play infer a required camera feature from the CAMERA
 * permission unless the manifest explicitly marks the hardware as optional.
 * RiverMind can capture an avatar when a camera exists, but the rest of the
 * app must remain installable on devices without one.
 */
function markFeatureOptional(androidManifest, featureName) {
  const manifest = androidManifest.manifest;
  const features = manifest['uses-feature'] ?? [];
  const existing = features.find(
    (feature) => feature.$?.['android:name'] === featureName,
  );

  if (existing) {
    existing.$ = {
      ...existing.$,
      'android:required': 'false',
    };
  } else {
    features.push({
      $: {
        'android:name': featureName,
        'android:required': 'false',
      },
    });
  }

  manifest['uses-feature'] = features;
  return androidManifest;
}

function withOptionalAndroidHardware(config) {
  return withAndroidManifest(config, (config) => {
    config.modResults = markFeatureOptional(
      config.modResults,
      CAMERA_FEATURE,
    );
    return config;
  });
}

module.exports = withOptionalAndroidHardware;
module.exports.CAMERA_FEATURE = CAMERA_FEATURE;
module.exports.markFeatureOptional = markFeatureOptional;
