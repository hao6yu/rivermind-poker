const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

function preserveTableOnScreenChanges(androidManifest) {
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(androidManifest);
  const changes = new Set(
    (activity.$['android:configChanges'] ?? '').split('|').filter(Boolean),
  );
  // Fold/unfold and fixed-orientation letterboxing can change the smallest
  // width as well as orientation. Let React Native resize the existing tree:
  // recreating MainActivity remounts the app and discards the open table.
  for (const change of ['screenSize', 'smallestScreenSize', 'orientation', 'screenLayout']) {
    changes.add(change);
  }
  activity.$['android:configChanges'] = [...changes].join('|');
  return androidManifest;
}

module.exports = function withAndroidScreenContinuity(config) {
  return withAndroidManifest(config, (config) => {
    config.modResults = preserveTableOnScreenChanges(config.modResults);
    return config;
  });
};
module.exports.preserveTableOnScreenChanges = preserveTableOnScreenChanges;
