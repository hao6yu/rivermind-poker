#!/usr/bin/env node
/**
 * Phase 19 L2/L9 — native locale declaration verification.
 *
 *   node scripts/verify-native-locales.mjs            # source-of-truth check
 *   node scripts/verify-native-locales.mjs --generated # inspect generated native artifacts
 *
 * Source mode asserts that app.json declares every Phase 19 locale for both
 * platforms (the expo-localization plugin is the generator).
 *
 * Generated mode inspects the prebuild output in the gitignored `android/` and
 * `ios/` folders: Android locales_config.xml + resourceConfigurations, and iOS
 * CFBundleLocalizations. A file that cannot be read is reported BLOCKED, never
 * silently skipped — compiled signed artifacts remain an owner gate
 * (scripts/verify-android-artifact.mjs on the exact candidate).
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedLocales = ['en', 'zh-Hans', 'zh-Hant', 'es-419', 'pt-BR'];
const results = [];

function record(surface, file, check, status, detail) {
  results.push({ surface, file, check, status, detail });
  console.log(`[${status}] ${surface} · ${check}${detail ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------------------
// Source of truth: app.json
// ---------------------------------------------------------------------------

const appConfig = JSON.parse(readFileSync(resolve(projectRoot, 'app.json'), 'utf8')).expo;
const localizationPlugin = appConfig.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-localization',
);
for (const platform of ['ios', 'android']) {
  const declared = localizationPlugin?.[1]?.supportedLocales?.[platform];
  const ok = Array.isArray(declared) && expectedLocales.every((locale) => declared.includes(locale));
  record(
    'app.json',
    `supportedLocales.${platform}`,
    'declares every Phase 19 locale',
    ok ? 'PASS' : 'FAIL',
    declared?.join(', '),
  );
  if (!ok) process.exitCode = 1;
}

if (!process.argv.includes('--generated')) {
  console.log('\nSource-level locale declaration verified. Run with --generated after `expo prebuild` to inspect generated native files.');
  process.exit(process.exitCode ?? 0);
}

// ---------------------------------------------------------------------------
// Generated artifacts (gitignored native folders)
// ---------------------------------------------------------------------------

// Android: locales_config.xml (Android 13+ per-app language settings)
const localesConfigPath = resolve(projectRoot, 'android/app/src/main/res/xml/locales_config.xml');
if (existsSync(localesConfigPath)) {
  const content = readFileSync(localesConfigPath, 'utf8');
  const missing = expectedLocales.filter((locale) => !content.includes(`android:name="${locale}"`));
  record(
    'android',
    'app/src/main/res/xml/locales_config.xml',
    'lists every Phase 19 locale',
    missing.length === 0 ? 'PASS' : 'FAIL',
    missing.length === 0 ? content.match(/android:name="[^"]+"/gu)?.join(', ') : `missing: ${missing.join(', ')}`,
  );
  if (missing.length > 0) process.exitCode = 1;
} else {
  record('android', 'app/src/main/res/xml/locales_config.xml', 'generated file present', 'BLOCKED', 'run expo prebuild --platform android');
  process.exitCode = process.exitCode ?? 1;
}

// Android: resourceConfigurations in build.gradle
const buildGradlePath = resolve(projectRoot, 'android/app/build.gradle');
if (existsSync(buildGradlePath)) {
  const content = readFileSync(buildGradlePath, 'utf8');
  const expectedQualifiers = ['b+en', 'b+zh+Hans', 'b+zh+Hant', 'b+es+419', 'b+pt+BR'];
  const missing = expectedQualifiers.filter((qualifier) => !content.includes(`"${qualifier}"`));
  record(
    'android',
    'app/build.gradle',
    'resourceConfigurations keep every Phase 19 locale',
    missing.length === 0 ? 'PASS' : 'FAIL',
    missing.length === 0 ? expectedQualifiers.join(', ') : `missing: ${missing.join(', ')}`,
  );
  if (missing.length > 0) process.exitCode = 1;
} else {
  record('android', 'app/build.gradle', 'generated file present', 'BLOCKED', 'run expo prebuild --platform android');
  process.exitCode = process.exitCode ?? 1;
}

// iOS: CFBundleLocalizations in Info.plist
const infoPlistPath = resolve(projectRoot, 'ios/RiverMind/Info.plist');
if (existsSync(infoPlistPath)) {
  const content = readFileSync(infoPlistPath, 'utf8');
  const localizationsMatch = content.match(/<key>CFBundleLocalizations<\/key>\s*<array>([\s\S]*?)<\/array>/u);
  const missing = localizationsMatch
    ? expectedLocales.filter((locale) => !localizationsMatch[1].includes(`<string>${locale}</string>`))
    : expectedLocales;
  record(
    'ios',
    'RiverMind/Info.plist',
    'CFBundleLocalizations lists every Phase 19 locale',
    missing.length === 0 ? 'PASS' : 'FAIL',
    missing.length === 0 ? localizationsMatch[1].match(/<string>[^<]+<\/string>/gu)?.join(' ') : `missing: ${missing.join(', ')}`,
  );
  if (missing.length > 0) process.exitCode = 1;
} else {
  record('ios', 'RiverMind/Info.plist', 'generated file present', 'BLOCKED', 'run expo prebuild --platform ios');
  process.exitCode = process.exitCode ?? 1;
}

console.log(`\nNative locale verification: ${results.filter((r) => r.status === 'PASS').length} passed, ${results.filter((r) => r.status === 'FAIL').length} failed, ${results.filter((r) => r.status === 'BLOCKED').length} blocked.`);
