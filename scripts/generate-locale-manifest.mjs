#!/usr/bin/env node
/**
 * Shared locale manifest generator (review remediation #1/#6).
 *
 * Derives the native-locale manifest from the typed registry
 * (src/localization/registry.ts) — the single source of truth — and writes
 * config/locale-manifest.json. Every consumer (the Expo config plugin, the
 * release-config and native-locale verifiers, and the drift test) reads this
 * one file instead of maintaining independent hard-coded arrays.
 *
 *   node scripts/generate-locale-manifest.mjs          # regenerate
 *
 * The manifest is committed; `src/localization/localeManifest.test.ts` fails
 * when it drifts from the registry. `--check` verifies without writing
 * (nonzero exit on drift).
 *
 * Profiles:
 *   production       — registry entries with releaseEnabled: true
 *   internal-preview — registry entries with catalogComplete: true (the
 *                      draft locales an authorized internal QA build may
 *                      declare; still gated by releaseEnabled in the app)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(projectRoot, 'config', 'locale-manifest.json');
const registryPath = path.join(projectRoot, 'src', 'localization', 'registry.ts');

/** Parses the LOCALES map out of registry.ts without executing the module. */
export function deriveManifestFromRegistrySource(registrySource) {
  const mapStart = registrySource.indexOf('export const LOCALES: Record<AppLanguage, LocaleDefinition> = {');
  if (mapStart === -1) throw new Error('LOCALES map not found in registry.ts');
  const bodyStart = registrySource.indexOf('{', mapStart);
  let depth = 0;
  let mapEnd = -1;
  for (let index = bodyStart; index < registrySource.length; index += 1) {
    const char = registrySource[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) { mapEnd = index; break; }
    }
  }
  if (mapEnd === -1) throw new Error('Unterminated LOCALES map in registry.ts');
  const mapBody = registrySource.slice(bodyStart + 1, mapEnd);

  // Split the map body into top-level `id: { ... }` entries with depth tracking.
  const entries = [];
  let entryStart = -1;
  let entryDepth = 0;
  let id = '';
  for (let index = 0; index < mapBody.length; index += 1) {
    const char = mapBody[index];
    if (entryStart === -1) {
      const idMatch = /^\s*(?:'([^']+)'|([A-Za-z][A-Za-z-]*)): \{/.exec(mapBody.slice(index));
      if (idMatch) {
        id = idMatch[1] ?? idMatch[2];
        entryStart = index;
        // The entry's own opening brace was consumed by the id match.
        entryDepth = 1;
        index += idMatch[0].length - 1;
      }
      continue;
    }
    if (char === '{') entryDepth += 1;
    else if (char === '}') {
      entryDepth -= 1;
      if (entryDepth === 0) {
        entries.push({ id, body: mapBody.slice(entryStart, index + 1) });
        entryStart = -1;
      }
    }
  }
  if (entries.length === 0) throw new Error('No locale entries parsed from registry.ts — parser drift.');

  const locales = {};
  for (const { id: localeId, body } of entries) {
    const flag = (name) => body.match(new RegExp(`${name}: (true|false)`))?.[1] === 'true';
    const nativeMatch = body.match(/nativeLocales: \[([^\]]*)\]/);
    if (!nativeMatch) continue;
    const nativeLocales = [...nativeMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    if (nativeLocales.length === 0) throw new Error(`Locale ${localeId} has no nativeLocales.`);
    locales[localeId] = {
      catalogComplete: flag('catalogComplete'),
      releaseEnabled: flag('releaseEnabled'),
      nativeLocales,
    };
  }
  const ids = Object.keys(locales);
  if (ids.length < 2) throw new Error('Too few locale entries parsed from registry.ts — parser drift.');

  // Android resource qualifiers follow the expo-localization plugin's
  // convention: every locale is a BCP-47 bundle, "b+" + subtags joined with
  // "+" (b+en, b+zh+Hans, b+es+419, b+ja …).
  const androidQualifier = (locale) => `b+${locale.split('-').join('+')}`;

  const releasedLocales = ids.filter((id) => locales[id].releaseEnabled);
  const catalogCompleteLocales = ids.filter((id) => locales[id].catalogComplete);
  const releasedNativeLocales = [...new Set(releasedLocales.flatMap((id) => locales[id].nativeLocales))];
  const catalogCompleteNativeLocales = [...new Set(catalogCompleteLocales.flatMap((id) => locales[id].nativeLocales))];
  const allNative = [...new Set([...releasedNativeLocales, ...catalogCompleteNativeLocales])];
  const androidResourceQualifiers = Object.fromEntries(allNative.map((locale) => [locale, androidQualifier(locale)]));

  return {
    generatedFrom: 'src/localization/registry.ts',
    profiles: {
      production: releasedLocales,
      'internal-preview': catalogCompleteLocales,
    },
    nativeLocalesByProfile: {
      production: releasedNativeLocales,
      'internal-preview': catalogCompleteNativeLocales,
    },
    androidResourceQualifiers,
  };
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  if (args.some((arg) => arg !== '--check')) {
    console.error('Usage: node scripts/generate-locale-manifest.mjs [--check]');
    process.exit(2);
  }
  const registrySource = fs.readFileSync(registryPath, 'utf8');
  const manifest = deriveManifestFromRegistrySource(registrySource);
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

  if (checkOnly) {
    const current = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8') : '';
    if (current !== serialized) {
      console.error('locale-manifest.json has drifted from src/localization/registry.ts.');
      console.error('Regenerate with: node scripts/generate-locale-manifest.mjs');
      process.exit(1);
    }
    console.log('locale-manifest.json matches the registry.');
    return;
  }

  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, serialized);
  console.log(`Wrote ${path.relative(projectRoot, manifestPath)}`);
  console.log(`  production locales:       ${manifest.profiles.production.join(', ')}`);
  console.log(`  internal-preview locales: ${manifest.profiles['internal-preview'].join(', ')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
