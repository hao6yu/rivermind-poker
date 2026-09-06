import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import '../test/draftCatalogFixture';

/**
 * Draft-catalog bundle reachability (review remediation #11).
 *
 * The es-419/pt-BR/ja catalogs are ~1.1 MB of raw source combined and are
 * unusable in production (releaseEnabled: false, picker hides them, draft
 * preferences sanitize). They must be reachable ONLY through the lazy
 * draft-catalog loader, which fetches their chunks solely in authorized
 * internal-preview/development builds. A static import anywhere in the app
 * graph would put them back into every production bundle.
 */

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readSource(relative: string): string {
  return readFileSync(resolve(projectRoot, relative), 'utf8');
}

/** Static import specifiers for one source file. */
function staticImports(source: string): string[] {
  return [...source.matchAll(/(?:^|\n)\s*import\s[^'"]*from\s+'([^']+)'/g)].map((match) => match[1] ?? '');
}

const DRAFT_MODULE_PATTERNS = [/^\.\/es419/, /^\.\/ptbr/, /^\.\/ja(\/|$)/, /localization\/es419/, /localization\/ptbr/, /localization\/ja(\/|$)/];

describe('draft catalog bundle reachability (review remediation #11)', () => {
  it('keeps the registry free of static draft-catalog imports', () => {
    const source = readSource('src/localization/registry.ts');
    for (const specifier of staticImports(source)) {
      for (const pattern of DRAFT_MODULE_PATTERNS) {
        expect(specifier, `registry.ts statically imports draft module "${specifier}"`).not.toMatch(pattern);
      }
    }
  });

  it('keeps the learning-content and scenario maps free of static draft imports', () => {
    for (const file of ['src/localization/learningContent.ts', 'src/localization/scenarioContent.ts']) {
      const source = readSource(file);
      for (const specifier of staticImports(source)) {
        for (const pattern of DRAFT_MODULE_PATTERNS) {
          expect(specifier, `${file} statically imports draft module "${specifier}"`).not.toMatch(pattern);
        }
      }
    }
  });

  it('reaches the draft modules only through the lazy loader', () => {
    // The ONLY module allowed to import the draft chunks statically-ish is the
    // loader itself — via dynamic import() (separate Metro chunks fetched on
    // demand). The test-module re-export file is test-only.
    const loader = readSource('src/localization/draftCatalogs.ts');
    // The loader must not statically import the draft modules: its only reach
    // into them is the dynamic import() inside the loaders map.
    const staticDraftImports = staticImports(loader).filter((specifier) =>
      DRAFT_MODULE_PATTERNS.some((pattern) => pattern.test(specifier)));
    expect(staticDraftImports, 'draftCatalogs.ts must not statically import draft modules').toEqual([]);
  });

  it('loads draft chunks only under the profile gate or a draft selection', () => {
    // The provider is the only app-code caller: assert its load call sits
    // behind the internal-preview guard.
    const provider = readSource('src/localization/LocalizationProvider.tsx');
    expect(provider).toMatch(/if \(!previewDraftLocales \|\| !isDraftCatalogLanguage\(language\)/);
  });

  it('inspects the generated module for both profile states (round 3, finding #10)', () => {
    // The committed generated file must be the production graph (no draft
    // imports). The preview file must carry static draft imports (by design).
    const generated = readSource('src/localization/draftCatalogs.generated.ts');
    const preview = readSource('src/localization/draftCatalogs.preview.ts');
    const production = readSource('src/localization/draftCatalogs.production.ts');

    // Production graph: empty, no draft imports.
    expect(generated).toContain("from './draftCatalogs.production'");
    expect(generated).not.toMatch(/from '\.\/(es419|ptbr|ja|draftTestModules)/);
    expect(production).not.toMatch(/from '\.\/(es419|ptbr|ja|draftTestModules)/);
    expect(production).toContain('DRAFT_LOADERS');

    // Preview graph: static draft imports (by design for QA builds).
    expect(preview).toMatch(/from '\.\/draftTestModules'/);
    expect(preview).toMatch(/registerDraftLearningContent/);
    expect(preview).toMatch(/registerDraftScenarioLocalizer/);

    // The Metro resolver must redirect to the preview file.
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
