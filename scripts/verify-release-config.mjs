import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appConfig = JSON.parse(readFileSync(resolve(projectRoot, 'app.json'), 'utf8')).expo;
const packageConfig = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'));
const easConfig = JSON.parse(readFileSync(resolve(projectRoot, 'eas.json'), 'utf8'));
const release = appConfig.extra?.release;
const buildProperties = appConfig.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
);

const releaseVersion = '1.1.0';
assert.equal(appConfig.version, releaseVersion, 'The Expo release version must remain explicit.');
assert.equal(packageConfig.version, releaseVersion, 'Package and Expo release versions must match.');
assert.equal(appConfig.ios.bundleIdentifier, 'dev.isw.rivermindpoker');
assert.equal(appConfig.ios.appleTeamId, 'F9XW9FCX92');
assert.match(appConfig.ios.buildNumber, /^\d+$/u);
assert.equal(appConfig.ios.supportsTablet, true, 'The iOS build must support both iPhone and iPad.');
assert.equal(appConfig.android.package, 'dev.isw.rivermindpoker');
assert.equal(appConfig.android.versionCode, 1, 'Keep an explicit Android starting version.');
assert.deepEqual(appConfig.android.blockedPermissions, [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.SYSTEM_ALERT_WINDOW',
]);
assert.equal(buildProperties?.[1]?.android?.minSdkVersion, 24);
assert.equal(buildProperties?.[1]?.ios?.deploymentTarget, '15.1');
assert.equal(release?.minimumIosVersion, '15.1');
assert.equal(release?.supportEmail, 'hyu@isw.dev');
assert.match(release?.supportUrl ?? '', /^https:\/\//u);
assert.match(release?.privacyUrl ?? '', /^https:\/\//u);
assert.match(release?.feedbackUrl ?? '', /^mailto:hyu@isw\.dev/u);

assert.equal(easConfig.cli.appVersionSource, 'remote');
assert.equal(easConfig.cli.requireCommit, true);
assert.equal(easConfig.build.base.node, '22.19.0');
assert.equal(easConfig.build.simulator.ios.simulator, true);
assert.equal(easConfig.build.preview.distribution, 'internal');
assert.equal(easConfig.build.preview.android.buildType, 'apk');
assert.equal(easConfig.build.production.android.autoIncrement, 'versionCode');
assert.equal(easConfig.build.production.ios.autoIncrement, 'buildNumber');
assert.equal(
  easConfig.build.production.ios.image,
  'macos-tahoe-26.5-xcode-26.6',
  'Production iOS builds must use the App Store-approved Expo image, not the SDK 54 auto image.',
);
assert.equal(easConfig.submit.production.ios.ascAppId, '6797011715');

const serializedEasConfig = JSON.stringify(easConfig);
assert.doesNotMatch(serializedEasConfig, /OPENAI_API_KEY|SERVICE_ROLE|SECRET_KEY/iu);

console.log(`Release configuration verified for RiverMind iOS and Android ${releaseVersion}.`);
