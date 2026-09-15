import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import '../test/draftCatalogFixture';

/**
 * Locale catalog reachability (review remediation #11, updated 2026-09-15).
 *
 * The es-419/pt-BR/ja catalogs were RELEASE-ENABLED by owner decision (see
 * docs/PHASE_19_EXECUTION_RECORD.md), so they are now static imports in the
 * registry and the learning/scenario content maps — exactly like en/zh — and
 * ship in every production bundle. The lazy draft-catalog machinery
 * (draftCatalogs.ts + the Metro profile redirect) stays in place for FUTURE
 * draft locales; with no draft locales remaining, both loader graphs are
 * empty and the test-only re-export file stays out of the app graph.
 */

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readSource(relative: string): string {
  return readFileSync(resolve(projectRoot, relative), 'utf8');
}

/** Static import specifiers for one source file. */
function staticImports(source: string): string[] {
  return [...source.matchAll(/(?:^|\n)\s*import\s[^'"]*from\s+'([^']+)'/g)].map((match) => match[1] ?? '');
}

const RELEASED_MODULE_PATTERN = /^\.\/(es419|ptbr|ja)$/;

describe('locale catalog bundle reachability (2026-09-15 release contract)', () => {
  it('statically imports the released catalogs in the registry', () => {
    const source = readSource('src/localization/registry.ts');
    const released = staticImports(source).filter((specifier) => RELEASED_MODULE_PATTERN.test(specifier));
    expect(released).toEqual(['./ja', './ptbr', './es419']);
    // The registry must never reach the test-only re-export file.
    expect(source).not.toContain('draftTestModules');
  });

  it('statically imports the released learning-content and scenario maps', () => {
    for (const file of ['src/localization/learningContent.ts', 'src/localization/scenarioContent.ts']) {
      const source = readSource(file);
      const released = staticImports(source).filter((specifier) => RELEASED_MODULE_PATTERN.test(specifier));
      expect(released, `${file} must statically import all three released catalogs`).toHaveLength(3);
      expect(source, `${file} imports the test-only draft module file`).not.toContain('draftTestModules');
    }
  });

  it('keeps the draft-catalog loader free of static draft imports', () => {
    // The loader's only reach into draft chunks is the dynamic import() inside
    // the loaders map — the pattern future draft locales will follow.
    const loader = readSource('src/localization/draftCatalogs.ts');
    const staticDraftImports = staticImports(loader).filter((specifier) =>
      /^\.\/(es419|ptbr|ja)(\/|$)/.test(specifier) || /localization\/(es419|ptbr|ja)(\/|$)/.test(specifier));
    expect(staticDraftImports, 'draftCatalogs.ts must not statically import locale modules').toEqual([]);
  });

  it('loads draft chunks only under the profile gate or a draft selection', () => {
    // The provider is the only app-code caller: assert its load call sits
    // behind the internal-preview guard (the path future drafts will use).
    const provider = readSource('src/localization/LocalizationProvider.tsx');
    expect(provider).toMatch(/if \(!previewDraftLocales \|\| !isDraftCatalogLanguage\(language\)/);
  });

  it('keeps both loader graphs empty while no draft locale exists', () => {
    // es-419/pt-BR/ja are released, so no draft locales remain: the generated
    // file re-exports the production graph, and both graphs are empty maps.
    const generated = readSource('src/localization/draftCatalogs.generated.ts');
    const preview = readSource('src/localization/draftCatalogs.preview.ts');
    const production = readSource('src/localization/draftCatalogs.production.ts');

    expect(generated).toContain("from './draftCatalogs.production'");
    expect(production).toContain('DRAFT_LOADERS');
    expect(production).not.toMatch(/from '\.\/(es419|ptbr|ja|draftTestModules)/);
    expect(preview).toContain('DRAFT_LOADERS');
    expect(preview).not.toMatch(/from '\.\/(es419|ptbr|ja|draftTestModules)/);

    // The Metro resolver must keep redirecting for future drafts.
    const metroConfig = readSource('metro.config.js');
    expect(metroConfig).toContain('draftCatalogs.preview');
    expect(metroConfig).toContain('EXPO_PUBLIC_RM_LOCALE_PROFILE');
  });

  it('keeps the vitest-only registration out of the app import graph', () => {
    // draftTestModules is re-exported ONLY by the test setup file.
    const appFiles = [
      'src/localization/registry.ts',
      'src/localization/LocalizationProvider.tsx',
      'src/localization/draftCatalogs.ts',
      'src/localization/learningContent.ts',
      'src/localization/scenarioContent.ts',
    ];
    for (const file of appFiles) {
      const source = readSource(file);
      expect(source, `${file} imports the test-only draft module file`).not.toContain('draftTestModules');
    }
  });
});
