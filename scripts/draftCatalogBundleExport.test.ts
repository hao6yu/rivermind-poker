import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

/**
 * Draft-catalog bundle exclusion, proven against COMPILED output
 * (review remediation finding #6).
 *
 * Source-level reachability tests (draftReachability.test.ts) prove the import
 * graph is clean, but only a real export proves what a build SHIPS. This test
 * runs two isolated `expo export --platform android` builds into throwaway
 * output directories and inspects the compiled Hermes bundles for sentinel
 * strings:
 *
 *   - production profile: draft-catalog sentinels (es-419 / pt-BR / ja text
 *     that exists ONLY in the draft modules) must be ABSENT, while an
 *     always-shipped English control string must be present (guards against a
 *     vacuous scan of an empty/failed bundle);
 *   - internal-preview profile: the same sentinels must be PRESENT, proving
 *     the Metro redirect really pulls the preview graph in.
 *
 * Hermes stores ASCII string literals verbatim in the bytecode string table
 * and non-ASCII strings as UTF-16, so every sentinel is searched in both
 * UTF-8 and UTF-16LE byte encodings.
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expo = path.join(projectRoot, 'node_modules', '.bin', 'expo');

/** Text that exists ONLY in the es-419 draft scenario catalog. */
const ES_419_SENTINEL = 'Valor polarizado en el river';
/** Text that exists ONLY in the pt-BR draft scenario catalog. */
const PT_BR_SENTINEL = 'Valor polarizado no river';
/** Text that exists ONLY in the ja draft scenario catalog. */
const JA_SENTINEL = 'リバーのポラライズドバリュー';
/** Always-shipped English copy — the positive control for both bundles. */
const ENGLISH_CONTROL = 'Go back';

const DRAFT_SENTINELS = [ES_419_SENTINEL, PT_BR_SENTINEL, JA_SENTINEL];

const tempExportDirs: string[] = [];

function createExportDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-bundle-export-'));
  tempExportDirs.push(dir);
  return dir;
}

function removeTrackedTempDirs(): void {
  while (tempExportDirs.length > 0) {
    const dir = tempExportDirs.pop();
    if (!dir) continue;
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
}

afterEach(() => {
  removeTrackedTempDirs();
});

afterAll(() => {
  removeTrackedTempDirs();
});

function runExport(localeProfile: string): string {
  const outputDir = createExportDir();
  execFileSync(
    expo,
    ['export', '--platform', 'android', '--output-dir', outputDir],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        EXPO_NO_TELEMETRY: '1',
        EXPO_PUBLIC_RM_LOCALE_PROFILE: localeProfile,
      },
      stdio: 'pipe',
      timeout: 600_000,
    },
  );
  return outputDir;
}

/** Concatenated bytes of every file in the export (JS, bytecode, assets). */
function exportBytes(outputDir: string): Buffer[] {
  const buffers: Buffer[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (entry.isFile()) {
        buffers.push(fs.readFileSync(entryPath));
      }
    }
  };
  walk(outputDir);
  return buffers;
}

function bundleContains(outputDir: string, sentinel: string): boolean {
  const utf8 = Buffer.from(sentinel, 'utf8');
  const utf16le = Buffer.from(sentinel, 'utf16le');
  return exportBytes(outputDir).some(
    (buffer) => buffer.includes(utf8) || buffer.includes(utf16le),
  );
}

function assertHermesBundleExists(outputDir: string): void {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(entryPath);
      else if (entry.isFile()) files.push(entryPath);
    }
  };
  walk(outputDir);
  expect(
    files.some((file) => file.endsWith('.hbc')),
    'the export must contain a compiled Hermes bundle',
  ).toBe(true);
}

describe('draft-catalog bundle exclusion (compiled exports)', () => {
  it(
    'production export ships no draft-catalog text',
    { timeout: 600_000 },
    () => {
      const outputDir = runExport('production');
      assertHermesBundleExists(outputDir);
      expect(bundleContains(outputDir, ENGLISH_CONTROL)).toBe(true);
      for (const sentinel of DRAFT_SENTINELS) {
        expect(
          bundleContains(outputDir, sentinel),
          `production bundle must not contain draft sentinel ${JSON.stringify(sentinel)}`,
        ).toBe(false);
      }
    },
  );

  it(
    'internal-preview export ships the draft catalogs',
    { timeout: 600_000 },
    () => {
      const outputDir = runExport('internal-preview');
      assertHermesBundleExists(outputDir);
      expect(bundleContains(outputDir, ENGLISH_CONTROL)).toBe(true);
      for (const sentinel of DRAFT_SENTINELS) {
        expect(
          bundleContains(outputDir, sentinel),
          `internal-preview bundle must contain draft sentinel ${JSON.stringify(sentinel)}`,
        ).toBe(true);
      }
    },
  );
});
