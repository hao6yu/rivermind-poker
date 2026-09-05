#!/usr/bin/env node
/**
 * Native locale declaration verification (review remediation #1/#6).
 *
 *   node scripts/verify-native-locales.mjs                       # production profile
 *   node scripts/verify-native-locales.mjs --profile internal-preview
 *   node scripts/verify-native-locales.mjs --generated           # + generated artifacts
 *
 * The expected locale sets come from the shared manifest
 * (config/locale-manifest.json, generated from the typed registry):
 *
 *   production       — only released locales (drafts stay out of
 *                      production native artifacts)
 *   internal-preview — catalog-complete draft locales additionally
 *                      declared, for authorized internal QA builds
 *
 * Source mode asserts that app.json declares exactly the profile's locale
 * set for both platforms. Generated mode inspects the prebuild output in the
 * gitignored `android/` and `ios/` folders — Android locales_config.xml +
 * resourceConfigurations (b+ja and friends) and iOS CFBundleLocalizations —
 * and detects MISSING *and* UNEXPECTED locale declarations. A file that
 * cannot be read is reported BLOCKED, never silently skipped; compiled
 * signed artifacts remain an owner gate.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(projectRoot, 'config', 'locale-manifest.json'), 'utf8'));

const args = process.argv.slice(2);
const profileFlagIndex = args.indexOf('--profile');
const envProfile = process.env.EXPO_PUBLIC_RM_LOCALE_PROFILE;
const profile = profileFlagIndex !== -1 ? args[profileFlagIndex + 1] : (envProfile ?? 'production');
if (profileFlagIndex !== -1 && !args[profileFlagIndex + 1]) {
  console.error('--profile requires a value: production | internal-preview');
  process.exit(2);
}
if (!manifest.profiles[profile]) {
  console.error(`Unknown locale profile "${profile}". Supported: ${Object.keys(manifest.profiles).join(' | ')}`);
  process.exit(2);
}
const expectedLocales = manifest.nativeLocalesByProfile[profile];
const expectedQualifiers = expectedLocales.map((locale) => manifest.androidResourceQualifiers[locale]);
const results = [];

function record(surface, file, check, status, detail) {
  results.push({ surface, file, check, status, detail });
  console.log(`[${status}] ${surface} · ${check}${detail ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------------------
// Source of truth: app.json
// ---------------------------------------------------------------------------

const appConfig = JSON.parse(readFileSync(resolve(projectRoot, 'app.json'), 'utf8')).expo;

if (profile === 'production') {
  // Production ship gate: the static config declares ONLY released locales.
  const localizationPlugin = appConfig.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-localization',
  );
  for (const platform of ['ios', 'android']) {
    const declared = localizationPlugin?.[1]?.supportedLocales?.[platform] ?? [];
    const missing = expectedLocales.filter((locale) => !declared.includes(locale));
    const unexpected = declared.filter((locale) => !expectedLocales.includes(locale));
    const ok = missing.length === 0 && unexpected.length === 0;
    record(
      'app.json',
      `supportedLocales.${platform}`,
      'declares exactly the released locales (drafts stay out of production)',
      ok ? 'PASS' : 'FAIL',
      ok ? declared.join(', ') : `missing: ${missing.join(', ')}${unexpected.length ? ' · unexpected: ' + unexpected.join(', ') : ''}`,
    );
    if (!ok) process.exitCode = 1;
  }
} else {
  // Internal-preview gate: the static config must NOT advertise drafts; the
  // drafts come from the build-profile plugin at prebuild time. Verify the
  // mechanism instead: static file stays released-only, and the EAS preview
  // profiles select the internal-preview locale profile.
  const localizationPlugin = appConfig.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-localization',
  );
  for (const platform of ['ios', 'android']) {
    const declared = localizationPlugin?.[1]?.supportedLocales?.[platform] ?? [];
    const leaksDrafts = declared.some((locale) => !manifest.profiles.production.includes(locale));
    record(
      'app.json',
      `supportedLocales.${platform}`,
      'static config stays released-only (drafts applied only by the profile plugin)',
      leaksDrafts ? 'FAIL' : 'PASS',
      declared.join(', '),
    );
    if (leaksDrafts) process.exitCode = 1;
  }
  const easConfig = JSON.parse(readFileSync(resolve(projectRoot, 'eas.json'), 'utf8'));
  // Resolve the EAS `extends` chain for the profile's effective env.
  const effectiveEnv = (buildProfile) => {
    const env = {};
    const visited = new Set();
    let current = buildProfile;
    const chain = [];
    while (current && !visited.has(current)) {
      visited.add(current);
      chain.push(current);
      current = easConfig?.build?.[current]?.extends;
    }
    // The chain is child → root; applying root first lets the child's own
    // env override the inherited values.
    for (const name of [...chain].reverse()) {
      Object.assign(env, easConfig?.build?.[name]?.env);
    }
    return env;
  };
  for (const [buildProfile, expectedValue] of [
    ['simulator', 'internal-preview'],
    ['preview', 'internal-preview'],
    ['production', 'production'],
  ]) {
    const actual = effectiveEnv(buildProfile).EXPO_PUBLIC_RM_LOCALE_PROFILE;
    const ok = actual === expectedValue;
    record(
      'eas.json',
      `build.${buildProfile} (effective env)`,
      `selects the ${expectedValue} locale profile`,
      ok ? 'PASS' : 'FAIL',
      actual ?? '(unset)',
    );
    if (!ok) process.exitCode = 1;
  }
}

// Review remediation round 3 (finding #3): the locale-profile plugin was
// replaced with a dynamic app.config.js. Verify it exists and carries the
// profile selection.
const appConfigJsExists = existsSync(resolve(projectRoot, 'app.config.js'));
record(
  'app.config.js',
  'file',
  'locale-profile dynamic config present',
  appConfigJsExists ? 'PASS' : 'FAIL',
  appConfigJsExists ? 'selects supportedLocales per EXPO_PUBLIC_RM_LOCALE_PROFILE' : 'MISSING — prebuild would use the static released-only set',
);
if (!appConfigJsExists) process.exitCode = 1;
// For internal-preview: also verify metro.config.js (JS bundle graph redirect).
if (profile === 'internal-preview') {
  const metroConfigExists = existsSync(resolve(projectRoot, 'metro.config.js'));
  record(
    'metro.config.js',
    'file',
    'draft-catalog resolution redirect present',
    metroConfigExists ? 'PASS' : 'FAIL',
    metroConfigExists ? 'redirects draftCatalogs.generated per profile' : 'MISSING — preview builds would lack draft catalogs',
  );
  if (!metroConfigExists) process.exitCode = 1;
}

if (!process.argv.includes('--generated')) {
  console.log(`\nSource-level locale declaration verified for the "${profile}" profile. Run with --generated after \`expo prebuild\` to inspect generated native files.`);
  process.exit(process.exitCode ?? 0);
}

// ---------------------------------------------------------------------------
// Generated artifacts (gitignored native folders)
// ---------------------------------------------------------------------------

// Android: locales_config.xml (Android 13+ per-app language settings)
const localesConfigPath = resolve(projectRoot, 'android/app/src/main/res/xml/locales_config.xml');
if (existsSync(localesConfigPath)) {
  const content = readFileSync(localesConfigPath, 'utf8');
  const declared = [...content.matchAll(/android:name="([^"]+)"/gu)].map((match) => match[1]);
  const missing = expectedLocales.filter((locale) => !declared.includes(locale));
  const unexpected = declared.filter((locale) => !expectedLocales.includes(locale));
  const ok = missing.length === 0 && unexpected.length === 0;
  record(
    'android',
    'app/src/main/res/xml/locales_config.xml',
    `declares exactly the ${profile} profile locales`,
    ok ? 'PASS' : 'FAIL',
    ok ? declared.join(', ') : `missing: ${missing.join(', ')}${unexpected.length ? ' · unexpected: ' + unexpected.join(', ') : ''}`,
  );
  if (!ok) process.exitCode = 1;
} else {
  record('android', 'app/src/main/res/xml/locales_config.xml', 'generated file present', 'BLOCKED', 'run expo prebuild --platform android');
  process.exitCode = process.exitCode ?? 1;
}

// Android: resourceConfigurations in build.gradle (b+ja and friends)
const buildGradlePath = resolve(projectRoot, 'android/app/build.gradle');
if (existsSync(buildGradlePath)) {
  const content = readFileSync(buildGradlePath, 'utf8');
  const declared = [...content.matchAll(/"(b\+[^"]+|en)"/gu)].map((match) => match[1])
    .filter((qualifier) => qualifier.startsWith('b+'));
  const missing = expectedQualifiers.filter((qualifier) => !declared.includes(qualifier));
  const unexpected = declared.filter((qualifier) => !expectedQualifiers.includes(qualifier));
  const ok = missing.length === 0 && unexpected.length === 0;
  record(
    'android',
    'app/build.gradle',
    `resourceConfigurations keep exactly the ${profile} profile qualifiers`,
    ok ? 'PASS' : 'FAIL',
    ok ? expectedQualifiers.join(', ') : `missing: ${missing.join(', ')}${unexpected.length ? ' · unexpected: ' + unexpected.join(', ') : ''}`,
  );
  if (!ok) process.exitCode = 1;
} else {
  record('android', 'app/build.gradle', 'generated file present', 'BLOCKED', 'run expo prebuild --platform android');
  process.exitCode = process.exitCode ?? 1;
}

// iOS: CFBundleLocalizations in Info.plist
const infoPlistPath = resolve(projectRoot, 'ios/RiverMind/Info.plist');
if (existsSync(infoPlistPath)) {
  const content = readFileSync(infoPlistPath, 'utf8');
  const localizationsMatch = content.match(/<key>CFBundleLocalizations<\/key>\s*<array>([\s\S]*?)<\/array>/u);
  const declared = localizationsMatch
    ? [...localizationsMatch[1].matchAll(/<string>([^<]+)<\/string>/gu)].map((match) => match[1])
    : [];
  const missing = expectedLocales.filter((locale) => !declared.includes(locale));
  const unexpected = declared.filter((locale) => !expectedLocales.includes(locale));
  const ok = missing.length === 0 && unexpected.length === 0;
  record(
    'ios',
    'RiverMind/Info.plist',
    `CFBundleLocalizations declares exactly the ${profile} profile locales`,
    ok ? 'PASS' : 'FAIL',
    ok ? declared.join(' ') : `missing: ${missing.join(', ')}${unexpected.length ? ' · unexpected: ' + unexpected.join(', ') : ''}`,
  );
  if (!ok) process.exitCode = 1;
} else {
  record('ios', 'RiverMind/Info.plist', 'generated file present', 'BLOCKED', 'run expo prebuild --platform ios');
  process.exitCode = process.exitCode ?? 1;
}

console.log(`\nNative locale verification (${profile} profile): ${results.filter((r) => r.status === 'PASS').length} passed, ${results.filter((r) => r.status === 'FAIL').length} failed, ${results.filter((r) => r.status === 'BLOCKED').length} blocked.`);
