import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * Prebuild integration test for the EXPO_PUBLIC_RM_LOCALE_PROFILE switch.
 *
 * Expo evaluates the dynamic `app.config.js` BEFORE config-plugin resolution,
 * so the profile must be applied there (rewriting the expo-localization plugin
 * options); `expo-localization` then registers its native modifications with
 * the profile's locale set already in place. Source-level checks cannot prove
 * that ordering, so this test runs a REAL `expo prebuild --platform android
 * --no-install` per profile inside a throwaway fixture project and asserts the
 * generated Android artifacts:
 *
 *   internal-preview → six locales incl. b+ja in resourceConfigurations
 *   production       → three released locales only
 *
 * The fixture is fully isolated from the workspace:
 *   - every repository-local file the Expo config references (assets, local
 *     plugins, config manifests) is discovered and copied into the fixture;
 *   - `node_modules` is symlinked, never copied;
 *   - the workspace `android/` directory is fingerprinted (path, size, mtime,
 *     sha256 per file) before the suite and re-checked after every test and
 *     again at teardown, proving prebuild never touched it;
 *   - fixture directories are tracked in a registry and removed after each
 *     test and again in afterAll, so cleanup happens even when a test fails.
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceAndroidDir = path.join(projectRoot, 'android');

const expo = path.join(projectRoot, 'node_modules', '.bin', 'expo');

interface FileFingerprint {
  size: number;
  mtimeMs: number;
  sha256: string;
}

/** Path -> fingerprint for every file under a directory (recursively). */
function fingerprintDirectory(root: string): Map<string, FileFingerprint> {
  const files = new Map<string, FileFingerprint>();
  if (!fs.existsSync(root)) return files;
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const content = fs.readFileSync(entryPath);
      files.set(
        path.relative(root, entryPath),
        {
          size: content.length,
          mtimeMs: fs.statSync(entryPath).mtimeMs,
          sha256: createHash('sha256').update(new Uint8Array(content)).digest('hex'),
        },
      );
    }
  };
  walk(root);
  return files;
}

/** Pure diff of two directory fingerprints: human-readable change lines. */
function directoryDiff(
  before: Map<string, FileFingerprint>,
  after: Map<string, FileFingerprint>,
): string[] {
  const diff: string[] = [];
  for (const [rel, fp] of after) {
    const previous = before.get(rel);
    if (!previous) {
      diff.push(`ADDED ${rel}`);
    } else if (
      previous.size !== fp.size ||
      previous.mtimeMs !== fp.mtimeMs ||
      previous.sha256 !== fp.sha256
    ) {
      diff.push(`MODIFIED ${rel}`);
    }
  }
  for (const rel of before.keys()) {
    if (!after.has(rel)) diff.push(`REMOVED ${rel}`);
  }
  return diff;
}

let workspaceAndroidBefore: Map<string, FileFingerprint> | null = null;
let workspaceAndroidExistedBefore = false;

/** Throws (via expect) if the workspace android/ directory changed at all. */
function expectWorkspaceAndroidUntouched(context: string): void {
  expect(workspaceAndroidBefore, `${context}: sentinel snapshot missing`).not.toBeNull();
  const before = workspaceAndroidBefore as Map<string, FileFingerprint>;
  const after = fingerprintDirectory(workspaceAndroidDir);
  const diff = directoryDiff(before, after);
  expect(diff, `${context}: workspace android/ must be untouched by prebuild tests`).toEqual([]);
  expect(fs.existsSync(workspaceAndroidDir), `${context}: workspace android/ must still exist`).toBe(
    workspaceAndroidExistedBefore,
  );
}

/** Collects every string value in a config tree that looks like './...'. */
function collectRepoRelativeReferences(value: unknown, out: Set<string>): void {
  if (typeof value === 'string') {
    if (value.startsWith('./') && value.length > 2) out.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectRepoRelativeReferences(item, out);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) collectRepoRelativeReferences(item, out);
  }
}

/**
 * Expo/Node resolve a config-plugin reference such as
 * "./plugins/with-ios-scene-lifecycle" by trying these variants in order, so
 * the fixture must mirror the same resolution.
 */
const CONFIG_REFERENCE_VARIANTS = ['', '.js', '.ts', '.json', '/index.js', '/index.ts'];

function resolveRepoReference(reference: string): string | null {
  const base = path.resolve(projectRoot, reference);
  for (const suffix of CONFIG_REFERENCE_VARIANTS) {
    const candidate = base + suffix;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function copyIntoFixture(reference: string): void {
  const source = resolveRepoReference(reference);
  if (!source) {
    throw new Error(
      `Fixture incomplete: "${reference}" is referenced by app.json/app.config.js but does not resolve to any file in the repository`,
    );
  }
  if (source !== projectRoot && !source.startsWith(projectRoot + path.sep)) {
    throw new Error(`Config reference escapes the repository root: ${reference}`);
  }
  const relative = path.relative(projectRoot, source);
  const destination = path.join(fixtureDir(), relative);
  if (fs.statSync(source).isDirectory()) {
    fs.cpSync(source, destination, { recursive: true });
    return;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

const tempProjectDirs: string[] = [];
let currentFixture: string | null = null;

function fixtureDir(): string {
  expect(currentFixture, 'fixture project must be created before copying inputs').not.toBeNull();
  return currentFixture as string;
}

function createFixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-prebuild-'));
  tempProjectDirs.push(dir);
  currentFixture = dir;

  for (const entry of ['package.json', 'app.json', 'app.config.js']) {
    fs.copyFileSync(path.join(projectRoot, entry), path.join(dir, entry));
  }

  // Discover every repository-local file the Expo config references (icons,
  // splash, local config plugins, manifest requires) and copy it in. A missing
  // referenced file fails the fixture build immediately with the offending
  // path — exactly the failure mode this isolation once had.
  const references = new Set<string>();
  collectRepoRelativeReferences(
    JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8')),
    references,
  );
  const appConfigSource = fs.readFileSync(path.join(projectRoot, 'app.config.js'), 'utf8');
  for (const match of appConfigSource.matchAll(/['"](\.\.?\/[^'"]+)['"]/gu)) {
    const reference = match[1] ?? '';
    if (reference.startsWith('../')) {
      throw new Error(`app.config.js reference escapes the repository root: ${reference}`);
    }
    references.add(reference);
  }
  for (const reference of references) copyIntoFixture(reference);

  // Local config-plugin and manifest directories are copied wholesale: their
  // internal file layout is not visible in app.json.
  for (const name of ['config', 'plugins']) {
    const sourceDir = path.join(projectRoot, name);
    if (fs.existsSync(sourceDir)) {
      fs.cpSync(sourceDir, path.join(fixtureDir(), name), { recursive: true });
    }
  }

  // Link (never copy) node_modules so Expo can resolve its dependencies.
  fs.symlinkSync(path.join(projectRoot, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  return dir;
}

function removeTrackedTempProjects(): void {
  while (tempProjectDirs.length > 0) {
    const dir = tempProjectDirs.pop();
    if (!dir) continue;
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
  currentFixture = null;
}

function prebuild(profile: string): string {
  const dir = createFixture();
  execFileSync(expo, ['prebuild', '--platform', 'android', '--no-install'], {
    cwd: dir,
    env: {
      ...process.env,
      EXPO_NO_TELEMETRY: '1',
      EXPO_PUBLIC_RM_LOCALE_PROFILE: profile,
      // Per-fixture caches: parallel workers must not share cache state.
      XDG_CACHE_HOME: path.join(dir, '.test-cache'),
      HOME: process.env.EXPO_TEST_HOME ?? process.env.HOME,
    },
    stdio: 'pipe',
    timeout: 300_000,
  });
  expectWorkspaceAndroidUntouched(`after prebuild (${profile})`);
  return dir;
}

function localesConfigLocales(tempProject: string): string[] {
  const configPath = path.join(tempProject, 'android/app/src/main/res/xml/locales_config.xml');
  expect(fs.existsSync(configPath), 'locales_config.xml must exist after prebuild').toBe(true);
  return [...fs.readFileSync(configPath, 'utf8').matchAll(/android:name="([^"]+)"/gu)].map(
    (match) => match[1] ?? '',
  );
}

function gradleQualifiers(tempProject: string): string[] {
  const gradlePath = path.join(tempProject, 'android/app/build.gradle');
  const content = fs.readFileSync(gradlePath, 'utf8');
  return [...content.matchAll(/"(b\+[^"]+)"/gu)].map((match) => match[1] ?? '');
}

beforeAll(() => {
  workspaceAndroidExistedBefore = fs.existsSync(workspaceAndroidDir);
  workspaceAndroidBefore = fingerprintDirectory(workspaceAndroidDir);
});

afterEach(() => {
  // Runs even when a test failed: first prove isolation, then always clean up.
  expectWorkspaceAndroidUntouched('afterEach');
  removeTrackedTempProjects();
});

afterAll(() => {
  removeTrackedTempProjects();
  expectWorkspaceAndroidUntouched('afterAll');
});

describe('locale-profile prebuild integration', () => {
  it('sentinel detects added, modified, and removed files in a scratch directory', () => {
    // Proves the sentinel mechanism itself reacts to every mutation class,
    // using a throwaway directory — never the workspace android/.
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-sentinel-'));
    tempProjectDirs.push(scratch);
    const file = path.join(scratch, 'a.txt');
    fs.writeFileSync(file, 'one');
    const before = fingerprintDirectory(scratch);

    expect(directoryDiff(before, fingerprintDirectory(scratch))).toEqual([]);

    fs.writeFileSync(file, 'two');
    expect(directoryDiff(before, fingerprintDirectory(scratch))).toEqual([`MODIFIED a.txt`]);

    fs.writeFileSync(path.join(scratch, 'b.txt'), 'new');
    expect(directoryDiff(before, fingerprintDirectory(scratch)).sort()).toEqual([
      'ADDED b.txt',
      `MODIFIED a.txt`,
    ]);

    fs.rmSync(file);
    const afterRemoval = directoryDiff(before, fingerprintDirectory(scratch));
    expect(afterRemoval).toContain('REMOVED a.txt');
    expect(afterRemoval).toContain('ADDED b.txt');
  });

  it(
    'internal-preview prebuild generates the six draft-inclusive locales',
    { timeout: 600_000 },
    () => {
      const tempDir = prebuild('internal-preview');
      expect(localesConfigLocales(tempDir).sort()).toEqual(
        ['en', 'es-419', 'ja', 'pt-BR', 'zh-Hans', 'zh-Hant'].sort(),
      );
      expect(gradleQualifiers(tempDir)).toContain('b+ja');
      expect(gradleQualifiers(tempDir)).toContain('b+es+419');
      expect(gradleQualifiers(tempDir)).toContain('b+pt+BR');
    },
  );

  it('production prebuild generates only the released locales', { timeout: 600_000 }, () => {
    const tempDir = prebuild('production');
    expect(localesConfigLocales(tempDir).sort()).toEqual(['en', 'zh-Hans', 'zh-Hant'].sort());
    expect(gradleQualifiers(tempDir)).not.toContain('b+ja');
    expect(gradleQualifiers(tempDir)).not.toContain('b+es+419');
    expect(gradleQualifiers(tempDir)).not.toContain('b+pt+BR');
  });
});
