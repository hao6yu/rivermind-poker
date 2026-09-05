import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

// Every test here spawns the generator as a subprocess (plus git plumbing for
// the git fixtures); the default 5s budget flips under full-suite worker
// contention. Scoped to THIS file only.
vi.setConfig({ testTimeout: 120_000 });

/**
 * Inventory generator contract tests.
 *
 * Review remediation findings covered here:
 *  - #3 (tracked-artifact mutation): every generation runs against a throwaway
 *    repository fixture via `--root <dir>`; the real checkout's tracked
 *    inventory artifacts are never written, so there is nothing to restore and
 *    no crash window. Tests assert the tracked artifacts' bytes are unchanged
 *    (fail loudly) instead of silently restoring them. Each fixture is a
 *    unique mkdtemp directory registered for cleanup, so parallel workers can
 *    never observe intermediate tracked-file contents.
 *  - #7 (provenance): ambient runs record the git state (HEAD + tracked-dirty
 *    count) and per-file SHA-256 source hashes; the note claims a frozen tree
 *    only when the tree is demonstrably pinned and clean.
 *  - #8 (CLI assertions): unknown arguments — including
 *    `--force unexpected-positional` — must exit 2 with a diagnostic.
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generator = path.join(projectRoot, 'scripts', 'generate-localization-inventory.mjs');

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function run(args: ReadonlyArray<string>, fixtureRoot: string): RunResult {
  return runRaw(['--root', fixtureRoot, ...args], fixtureRoot);
}

/** Runs the generator with arguments passed through verbatim (no implicit --root). */
function runRaw(args: ReadonlyArray<string>, cwd: string): RunResult {
  try {
    const stdout = execFileSync(process.execPath, [generator, ...args], { encoding: 'utf8', cwd });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

// -- Temporary fixture lifecycle -------------------------------------------------

const tempFixtures: string[] = [];

/**
 * The exact repository files the generator reads (mirrors the generator's
 * INVENTORY_INPUT_FILES plus app.json). Copying only these keeps fixture
 * creation cheap: the full-suite run creates a fixture per test.
 */
const FIXTURE_INPUT_FILES = [
  'app.json',
  'src/domain/learning/content.ts',
  'src/domain/learning/phase7Content.ts',
  'src/domain/learning/phase7Scenarios.ts',
  'src/domain/learning/practicePacks.ts',
  'src/domain/learning/scenarios.ts',
  'src/domain/learning/types.ts',
  'src/domain/poker/types.ts',
  'src/localization/accountDeletionMessages.ts',
  'src/localization/aiCoachConsentMessages.ts',
  'src/localization/messages.ts',
  'src/localization/phase12Messages.ts',
  'src/localization/phase14Messages.ts',
  'src/localization/phase16Messages.ts',
  'src/localization/phase7Messages.ts',
  'src/localization/phase8Messages.ts',
  'src/localization/phase9Messages.ts',
].sort();

function createFixture(): string {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-inventory-'));
  tempFixtures.push(fixture);
  for (const relative of FIXTURE_INPUT_FILES) {
    const source = path.join(projectRoot, relative);
    const destination = path.join(fixture, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  return fixture;
}

/** A fixture that is also a git repository with one commit (clean tree). */
function createGitFixture(): { fixture: string; head: string } {
  const fixture = createFixture();
  const git = (args: ReadonlyArray<string>) =>
    execFileSync('git', ['-c', 'user.name=inventory-test', '-c', 'user.email=inventory-test@example.invalid', ...args], {
      cwd: fixture,
      encoding: 'utf8',
    });
  git(['init', '-q', '.']);
  git(['add', '-A']);
  git(['commit', '-qm', 'fixture base']);
  const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: fixture, encoding: 'utf8' }).trim();
  return { fixture, head };
}

function secondCommit(fixture: string): string {
  fs.writeFileSync(path.join(fixture, 'marker.txt'), 'second commit\n');
  execFileSync('git', ['-c', 'user.name=inventory-test', '-c', 'user.email=inventory-test@example.invalid', 'add', '-A'], { cwd: fixture });
  execFileSync('git', ['-c', 'user.name=inventory-test', '-c', 'user.email=inventory-test@example.invalid', 'commit', '-qm', 'second'], { cwd: fixture });
  return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: fixture, encoding: 'utf8' }).trim();
}

function removeTrackedTempFixtures(): void {
  while (tempFixtures.length > 0) {
    const fixture = tempFixtures.pop();
    if (!fixture) continue;
    fs.rmSync(fixture, { recursive: true, force: true, maxRetries: 3 });
  }
}

// -- Tracked-artifact sentinel ---------------------------------------------------

const trackedInventoryPaths = [
  path.join(projectRoot, 'docs', 'localization-inventory.json'),
  path.join(projectRoot, 'docs', 'localization-inventory-ja.json'),
];

const trackedInventoryBytes = trackedInventoryPaths.map((p) => fs.readFileSync(p, 'utf8'));

function expectTrackedInventoriesUntouched(context: string): void {
  trackedInventoryPaths.forEach((trackedPath, index) => {
    const current = fs.readFileSync(trackedPath, 'utf8');
    expect(
      current === trackedInventoryBytes[index],
      `${context}: tracked artifact ${path.relative(projectRoot, trackedPath)} must never be written by tests`,
    ).toBe(true);
  });
}

afterEach(() => {
  expectTrackedInventoriesUntouched('afterEach');
  removeTrackedTempFixtures();
});

afterAll(() => {
  removeTrackedTempFixtures();
  expectTrackedInventoriesUntouched('afterAll');
});

describe('inventory generator CLI', () => {
  it('rejects a missing --phase before writing', () => {
    const fixture = createFixture();
    const result = run([], fixture);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--phase is required');
    expect(fs.existsSync(path.join(fixture, 'docs', 'localization-inventory.json'))).toBe(false);
  });

  it('rejects unsupported phases with exit code 2', () => {
    const fixture = createFixture();
    for (const phase of ['20', '19.6', 'ja', 'two']) {
      const result = run(['--phase', phase], fixture);
      expect(result.status, `phase ${phase}`).toBe(2);
      expect(result.stderr, `phase ${phase}`).toContain('unsupported phase');
    }
  });

  it('rejects a valueless --phase with exit code 2', () => {
    const fixture = createFixture();
    const result = run(['--phase'], fixture);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--phase requires a value');
  });

  it('rejects unknown arguments with exit code 2 and a diagnostic (finding #8)', () => {
    const fixture = createFixture();
    const unknownCases: ReadonlyArray<ReadonlyArray<string>> = [
      ['--phase', '19', '--phaze', 'x'],
      // The flagged case: an unknown positional after a valid flag.
      ['--phase', '19', '--force', 'unexpected-positional'],
      ['--phase', '19.5', '--force', 'unexpected-positional'],
      // Duplicate flags are malformed too: first-one-wins must never hide it.
      ['--phase', '19', '--force', '--force'],
      ['--phase', '19', '--phase', '19.5'],
    ];
    for (const args of unknownCases) {
      const result = run(args, fixture);
      expect(result.status, `args ${args.join(' ')}`).toBe(2);
      expect(result.stderr, `args ${args.join(' ')}`).toMatch(/unknown argument|duplicate argument/);
      expect(result.stderr, `args ${args.join(' ')}`).toContain('Usage:');
    }
    // A bare positional is rejected as well; --phase validation runs first.
    const bare = run(['unexpected-positional'], fixture);
    expect(bare.status).toBe(2);
    expect(bare.stderr).toContain('--phase is required');
    expect(bare.stderr).toContain('Usage:');
  });

  it('rejects --root that is not an existing directory', () => {
    const fixture = createFixture();
    const result = runRaw(['--phase', '19', '--root', path.join(fixture, 'missing')], fixture);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--root must be an existing directory');
  });

  it('rejects an explicit commit that does not exist', () => {
    const { fixture } = createGitFixture();
    const result = run(['--phase', '19.5', '--commit', 'deadbeef0123'], fixture);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('does not exist');
  });

  it('rejects --commit when HEAD does not match', () => {
    const { fixture, head } = createGitFixture();
    secondCommit(fixture); // HEAD advances; `head` is now the non-HEAD ancestor
    const result = run(['--phase', '19.5', '--commit', head], fixture);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('does not match HEAD');
  });

  it('refuses to overwrite an explicitly frozen inventory without --force', () => {
    const { fixture } = createGitFixture();
    const outputPath = path.join(fixture, 'docs', 'localization-inventory-ja.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(
      outputPath,
      `${JSON.stringify({ sourceFreezeCommitSource: 'explicit', sourceFreezeCommit: '69de3a71' }, null, 2)}\n`,
    );
    const blocked = run(['--phase', '19.5'], fixture);
    expect(blocked.status).toBe(2);
    expect(blocked.stderr).toContain('Refusing to overwrite the frozen inventory');
    const forced = run(['--phase', '19.5', '--force'], fixture);
    expect(forced.status).toBe(0);
  });

  it('generates identical content in an isolated fixture and never touches tracked artifacts', () => {
    const { fixture, head } = createGitFixture();
    const result = run(['--phase', '19.5'], fixture);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('docs/localization-inventory-ja.json');

    const inventory = JSON.parse(fs.readFileSync(path.join(fixture, 'docs', 'localization-inventory-ja.json'), 'utf8'));
    // Content parity with the real checkout (the fixture is a faithful copy).
    expect(inventory.messages.totalUniqueKeys).toBeGreaterThan(0);
    expect(trackedInventoryBytes[1], 'tracked ja inventory must be captured').toBeDefined();
    expect(inventory.messages.totalUniqueKeys).toBe(
      JSON.parse(trackedInventoryBytes[1] as string).messages.totalUniqueKeys,
    );

    // Ambient-HEAD provenance (finding #7): HEAD recorded, clean tree declared.
    expect(inventory.sourceFreezeCommitSource).toBe('HEAD');
    expect(inventory.sourceFreezeCommit).toBe(head);
    expect(inventory.sourceFreezeGitState).toEqual({
      gitAvailable: true,
      headCommit: head,
      trackedDirtyFiles: 0,
      dirty: false,
      untrackedFilesExcluded: true,
    });
    expect(inventory.note).not.toMatch(/NOT a frozen merged-tree snapshot/);
  });

  it('records reproducible source-input hashes that detect any input change', () => {
    const { fixture } = createGitFixture();
    const outputPath = path.join(fixture, 'docs', 'localization-inventory-ja.json');
    const first = run(['--phase', '19.5'], fixture);
    expect(first.status).toBe(0);
    const inventory = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

    // The artifact's hashed input set must cover exactly the fixture contract
    // (adding or omitting a generator input breaks the fixture contract), and
    // the combined hash must chain exactly the documented way.
    expect(Object.keys(inventory.sourceInputs.files).sort()).toEqual([...FIXTURE_INPUT_FILES].sort());
    expect(inventory.sourceInputs.inputCount).toBe(FIXTURE_INPUT_FILES.length);
    const combined = createHash('sha256');
    for (const [relative, digest] of Object.entries(inventory.sourceInputs.files)) {
      const actual = createHash('sha256')
        .update(new Uint8Array(fs.readFileSync(path.join(fixture, relative))))
        .digest('hex');
      expect(actual, relative).toBe(digest);
      combined.update(`${relative}\n${digest}\n`);
    }
    expect(combined.digest('hex')).toBe(inventory.sourceInputs.combinedHash);

    // Re-running on an unchanged tree reproduces the artifact byte for byte
    // except the timestamp.
    const second = run(['--phase', '19.5', '--force'], fixture);
    expect(second.status).toBe(0);
    const regenerated = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    const { generatedAt: _firstTimestamp, ...firstRest } = inventory;
    const { generatedAt: _secondTimestamp, ...secondRest } = regenerated;
    expect(secondRest).toEqual(firstRest);

    // Changing one input file must change the combined hash.
    const messagesPath = path.join(fixture, 'src', 'localization', 'messages.ts');
    const original = fs.readFileSync(messagesPath, 'utf8');
    fs.writeFileSync(messagesPath, `${original}\n// provenance probe\n`);
    const third = run(['--phase', '19.5', '--force'], fixture);
    expect(third.status).toBe(0);
    const tampered = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(tampered.sourceInputs.combinedHash).not.toBe(inventory.sourceInputs.combinedHash);
    expect(
      tampered.sourceInputs.files['src/localization/messages.ts'],
    ).not.toBe(inventory.sourceInputs.files['src/localization/messages.ts']);
  });

  it('marks a dirty working tree as NOT a frozen merged-tree snapshot (finding #7)', () => {
    const { fixture, head } = createGitFixture();
    const appJsonPath = path.join(fixture, 'app.json');
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    appJson.expo.name = 'RiverMind (provenance probe)';
    fs.writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);

    const result = run(['--phase', '19.5'], fixture);
    expect(result.status).toBe(0);
    const inventory = JSON.parse(fs.readFileSync(path.join(fixture, 'docs', 'localization-inventory-ja.json'), 'utf8'));
    expect(inventory.sourceFreezeCommitSource).toBe('HEAD');
    expect(inventory.sourceFreezeCommit).toBe(head);
    expect(inventory.sourceFreezeGitState.dirty).toBe(true);
    expect(inventory.sourceFreezeGitState.trackedDirtyFiles).toBe(1);
    expect(inventory.note).toMatch(/working tree at HEAD/);
    expect(inventory.note).toMatch(/NOT a frozen merged-tree snapshot/);
    expect(inventory.note).not.toMatch(/frozen from the merged/);
  });

  it('rejects --commit on a dirty tracked tree', () => {
    const { fixture, head } = createGitFixture();
    fs.writeFileSync(path.join(fixture, 'app.json'), fs.readFileSync(path.join(fixture, 'app.json'), 'utf8').replace('"version": "1.2.0"', '"version": "1.2.0-probe"'));
    const result = run(['--phase', '19.5', '--commit', head], fixture);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('clean tracked tree');
  });

  it('never writes the Phase 19 inventory when generating the ja window', () => {
    const { fixture } = createGitFixture();
    const result = run(['--phase', '19.5'], fixture);
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(fixture, 'docs', 'localization-inventory.json'))).toBe(false);
    expect(fs.existsSync(path.join(fixture, 'docs', 'localization-inventory-ja.json'))).toBe(true);
  });

  it('generates the Phase 19 window into its own artifact', () => {
    const { fixture } = createGitFixture();
    const result = run(['--phase', '19'], fixture);
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(fixture, 'docs', 'localization-inventory.json'))).toBe(true);
    const inventory = JSON.parse(fs.readFileSync(path.join(fixture, 'docs', 'localization-inventory.json'), 'utf8'));
    expect(inventory.phase).toBe('19');
    expect(inventory.sourceFreezeCommitSource).toBe('HEAD');
  });
});
