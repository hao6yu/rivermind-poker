import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { deriveManifestFromRegistrySource } from '../scripts/generate-locale-manifest.mjs';
import { CATALOG_COMPLETE_LOCALES, SHIPPED_LOCALES } from '../src/localization/core';

/**
 * Locale release boundary (review remediation #1/#6): the committed manifest
 * (config/locale-manifest.json) is the shared derivation of the typed
 * registry. It drives the Expo locale-profile plugin and both release
 * verifiers, so it must never drift from the registry:
 *
 *   node scripts/generate-locale-manifest.mjs          # regenerate
 *   node scripts/generate-locale-manifest.mjs --check  # verify only
 */

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(projectRoot, 'config', 'locale-manifest.json');

describe('locale manifest', () => {
  it('matches the registry exactly', () => {
    const registrySource = readFileSync(resolve(projectRoot, 'src', 'localization', 'registry.ts'), 'utf8');
    const derived = deriveManifestFromRegistrySource(registrySource);
    const committed = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(committed).toEqual(derived);
  });

  it('keeps the production profile at the released locales only', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.profiles.production).toEqual([...SHIPPED_LOCALES]);
    // Draft catalog-complete locales stay out of production native artifacts.
    for (const locale of manifest.profiles['internal-preview']) {
      if (!manifest.profiles.production.includes(locale)) {
        expect(CATALOG_COMPLETE_LOCALES, `${locale} must be catalog-complete to appear in internal-preview`).toContain(locale);
        expect(SHIPPED_LOCALES, `${locale} must not be released`).not.toContain(locale);
      }
    }
  });

  it('derives Android resource qualifiers in the expo b+ convention', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.androidResourceQualifiers.ja).toBe('b+ja');
    expect(manifest.androidResourceQualifiers['zh-Hans']).toBe('b+zh+Hans');
    expect(manifest.androidResourceQualifiers['es-419']).toBe('b+es+419');
    expect(manifest.androidResourceQualifiers.en).toBe('b+en');
  });
});
