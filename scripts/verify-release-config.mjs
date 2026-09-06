import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requireFromProject = createRequire(resolve(projectRoot, 'package.json'));
const expo = resolve(projectRoot, 'node_modules', '.bin', 'expo');
const packageConfig = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'));
const easConfig = JSON.parse(readFileSync(resolve(projectRoot, 'eas.json'), 'utf8'));
const releaseVersion = '1.2.0';

/**
 * Review remediation: release verification must inspect RESOLVED configuration
 * and ACTUAL module resolution, not source substrings.
 *
 * - `resolvedPublicConfig(profile)` runs `expo config --json --type public`
 *   with the profile env var set, i.e. it evaluates the real config chain
 *   (app.json + app.config.js + plugins) exactly as a build would.
 * - The Metro resolver redirect (draft-catalog preview graph) is exercised
 *   behaviorally through metro.config.js's resolveRequest, not by grepping its
 *   source.
 */

function resolvedPublicConfig(localeProfile) {
  const stdout = execFileSync(
    expo,
    ['config', '--json', '--type', 'public'],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        EXPO_NO_TELEMETRY: '1',
        EXPO_PUBLIC_RM_LOCALE_PROFILE: localeProfile,
      },
      encoding: 'utf8',
      timeout: 180_000,
    },
  );
  return JSON.parse(stdout);
}

function localizationPluginOptions(config) {
  const plugin = config.plugins?.find(
    (entry) => Array.isArray(entry) && entry[0] === 'expo-localization',
  );
  assert.ok(plugin, 'The expo-localization plugin must stay configured in the resolved config.');
  return plugin[1] ?? {};
}

function buildPropertiesOptions(config) {
  const plugin = config.plugins?.find(
    (entry) => Array.isArray(entry) && entry[0] === 'expo-build-properties',
  );
  assert.ok(plugin, 'The expo-build-properties plugin must stay configured.');
  return plugin[1] ?? {};
}

// Locale release boundary (review remediation #1/#5): the RESOLVED production
// config must declare ONLY released locales — draft catalog-complete locales
// (es-419, pt-BR, ja stay releaseEnabled: false) may never leak into
// production native artifacts. Internal-preview builds declare drafts through
// the profile switch in app.config.js, verified below against the resolved
// internal-preview output as well.
const localeManifest = JSON.parse(
  readFileSync(resolve(projectRoot, 'config', 'locale-manifest.json'), 'utf8'),
);
const releasedNativeLocales = localeManifest.nativeLocalesByProfile.production;
const previewNativeLocales = localeManifest.nativeLocalesByProfile['internal-preview'];
const draftNativeLocales = previewNativeLocales.filter(
  (locale) => !releasedNativeLocales.includes(locale),
);

const productionConfig = resolvedPublicConfig('production');
const previewConfig = resolvedPublicConfig('internal-preview');

assert.equal(productionConfig.version, releaseVersion, 'The Expo release version must remain explicit.');
assert.equal(packageConfig.version, releaseVersion, 'Package and Expo release versions must match.');
assert.equal(previewConfig.version, releaseVersion, 'The preview profile must not change the release version.');
assert.equal(productionConfig.ios.bundleIdentifier, 'dev.isw.rivermindpoker');
assert.equal(productionConfig.ios.appleTeamId, 'F9XW9FCX92');
assert.match(productionConfig.ios.buildNumber, /^\d+$/u);
assert.equal(productionConfig.ios.supportsTablet, true, 'The iOS build must support both iPhone and iPad.');
assert.equal(productionConfig.android.package, 'dev.isw.rivermindpoker');
assert.equal(productionConfig.android.versionCode, 2, 'Keep an explicit Android starting version.');

for (const platform of ['ios', 'android']) {
  const declared = localizationPluginOptions(productionConfig).supportedLocales?.[platform] ?? [];
  assert.deepEqual(
    declared,
    releasedNativeLocales,
    `Resolved production ${platform} supported locales must list exactly the released locales.`,
  );
  for (const draft of draftNativeLocales) {
    assert.ok(
      !declared.includes(draft),
      `Resolved production ${platform} supported locales must not advertise draft locale ${draft} while releaseEnabled is false.`,
    );
  }
  const previewDeclared = localizationPluginOptions(previewConfig).supportedLocales?.[platform] ?? [];
  assert.deepEqual(
    previewDeclared,
    previewNativeLocales,
    `Resolved internal-preview ${platform} supported locales must list the six draft-inclusive locales.`,
  );
}
assert.deepEqual(
  productionConfig.ios.infoPlist?.CFBundleLocalizations,
  releasedNativeLocales,
  'Resolved production CFBundleLocalizations must list exactly the released locales.',
);

assert.equal(
  productionConfig.extra?.localeProfile,
  'production',
  'Resolved production config must record the production locale profile.',
);
assert.equal(
  previewConfig.extra?.localeProfile,
  'internal-preview',
  'Resolved internal-preview config must record the internal-preview locale profile.',
);

assert.deepEqual(productionConfig.android.blockedPermissions, [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.RECORD_AUDIO',
]);
assert.ok(
  productionConfig.plugins.includes('./plugins/with-optional-android-hardware'),
  'The Android release must mark avatar-camera hardware optional.',
);
assert.equal(buildPropertiesOptions(productionConfig).android?.minSdkVersion, 24);
assert.equal(buildPropertiesOptions(productionConfig).ios?.deploymentTarget, '15.1');
const release = productionConfig.extra?.release;
assert.equal(release?.minimumIosVersion, '15.1');
assert.equal(release?.supportEmail, 'hyu@isw.dev');
assert.match(release?.supportUrl ?? '', /^https:\/\//u);
assert.match(release?.privacyUrl ?? '', /^https:\/\//u);
assert.match(release?.feedbackUrl ?? '', /^mailto:hyu@isw\.dev/u);

// The EAS profiles select the locale profile per build type through the
// EXPO_PUBLIC_* variable (the only shape Expo inlines into client code).
const effectiveLocaleProfileEnv = (buildProfile) => {
  const env = {};
  const visited = new Set();
  let current = buildProfile;
  const chain = [];
  while (current && !visited.has(current)) {
    visited.add(current);
    chain.push(current);
    current = easConfig.build?.[current]?.extends;
  }
  for (const name of [...chain].reverse()) Object.assign(env, easConfig.build?.[name]?.env);
  return env.EXPO_PUBLIC_RM_LOCALE_PROFILE;
};
assert.equal(
  effectiveLocaleProfileEnv('production'),
  'production',
  'Production builds must select the production locale profile via EXPO_PUBLIC_RM_LOCALE_PROFILE.',
);
assert.equal(
  effectiveLocaleProfileEnv('preview'),
  'internal-preview',
  'Internal preview builds must select the internal-preview locale profile via EXPO_PUBLIC_RM_LOCALE_PROFILE.',
);
assert.equal(
  effectiveLocaleProfileEnv('simulator'),
  'internal-preview',
  'Simulator builds must select the internal-preview locale profile via EXPO_PUBLIC_RM_LOCALE_PROFILE.',
);

// Actual Metro/module resolution: exercise the resolver from metro.config.js
// and observe which module it resolves './draftCatalogs.generated' to under
// each profile. No source-string matching.
const metroConfig = requireFromProject('./metro.config.js');
assert.equal(
  typeof metroConfig.resolver?.resolveRequest,
  'function',
  'metro.config.js must wire a custom resolver for the draft-catalog redirect.',
);
const draftResolver = metroConfig.resolver.resolveRequest;

function resolveDraftTarget(localeProfile, moduleName = './draftCatalogs.generated') {
  const previousProfile = process.env.EXPO_PUBLIC_RM_LOCALE_PROFILE;
  const resolutions = [];
  try {
    process.env.EXPO_PUBLIC_RM_LOCALE_PROFILE = localeProfile;
    const context = {
      // Metro injects the platform default resolver as context.resolveRequest
      // when a custom resolveRequest is configured; record the fall-through.
      resolveRequest: (innerContext, name, platform) => {
        resolutions.push(name);
        return `resolved:${name}`;
      },
    };
    const result = draftResolver(context, moduleName, 'android');
    return { result, resolutions };
  } finally {
    if (previousProfile === undefined) {
      delete process.env.EXPO_PUBLIC_RM_LOCALE_PROFILE;
    } else {
      process.env.EXPO_PUBLIC_RM_LOCALE_PROFILE = previousProfile;
    }
  }
}

assert.deepEqual(
  resolveDraftTarget('production'),
  { result: 'resolved:./draftCatalogs.generated', resolutions: ['./draftCatalogs.generated'] },
  'Under the production profile the draft-catalog import must resolve to the committed production graph.',
);
assert.deepEqual(
  resolveDraftTarget('internal-preview'),
  { result: 'resolved:./draftCatalogs.preview', resolutions: ['./draftCatalogs.preview'] },
  'Under the internal-preview profile the draft-catalog import must be redirected to the preview graph.',
);
assert.deepEqual(
  resolveDraftTarget('production', './messages'),
  { result: 'resolved:./messages', resolutions: ['./messages'] },
  'Non-draft module resolution must be untouched by the redirect.',
);
assert.deepEqual(
  resolveDraftTarget('internal-preview', './messages'),
  { result: 'resolved:./messages', resolutions: ['./messages'] },
  'Non-draft module resolution must be untouched by the redirect.',
);
assert.ok(
  existsSync(resolve(projectRoot, 'src/localization/draftCatalogs.preview.ts')) &&
    existsSync(resolve(projectRoot, 'src/localization/draftCatalogs.production.ts')),
  'Both immutable draft-catalog graph targets must exist.',
);

for (const serialized of [JSON.stringify(easConfig), JSON.stringify(productionConfig), JSON.stringify(previewConfig)]) {
  assert.doesNotMatch(serialized, /OPENAI_API_KEY|SERVICE_ROLE|SECRET_KEY/iu);
}

console.log(
  `Release configuration verified against resolved Expo config and live Metro resolution for RiverMind iOS and Android ${releaseVersion} (production locale profile: ${releasedNativeLocales.join(', ')}).`,
);
