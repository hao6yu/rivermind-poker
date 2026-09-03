import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Optional: `pnpm release:check -- artifacts/android/<build>.apk`
// inspects the actual signed/locally built Android artifact (target API 36 +
// 16 KB alignment, P18-006) in the same gate run.
const artifactArgIndex = process.argv.indexOf('--android-artifact');
const androidArtifact = artifactArgIndex >= 0 ? process.argv[artifactArgIndex + 1] : undefined;

function run(label, command, args) {
  console.log(`\n[release] ${label}`);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: { ...process.env, CI: '1' },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const releaseRoot = mkdtempSync(join(tmpdir(), 'rivermind-release-'));
const iosExport = join(releaseRoot, 'ios');
const androidExport = join(releaseRoot, 'android');

try {
  run('Verify release configuration', 'pnpm', ['verify:release-config']);
  run('Check Expo dependency compatibility', 'pnpm', ['exec', 'expo', 'install', '--check']);
  run('Typecheck', 'pnpm', ['typecheck']);
  // Edge Function modules live outside the app tsconfig; the dedicated
  // project keeps their contract (including the coach language allowlist)
  // typechecked against the same strictness as the app.
  run('Typecheck Edge Functions', 'pnpm', ['typecheck:functions']);
  run('Unit and simulation tests', 'pnpm', ['test']);
  run('Supabase migration, RLS, archive, and cleanup tests', 'supabase', ['test', 'db']);
  run('Bundle and exercise critical Edge workers', 'pnpm', ['verify:multiplayer-edge']);
  run('Resolve public Expo configuration', 'pnpm', ['exec', 'expo', 'config', '--type', 'public']);
  run('Create iOS production export', 'pnpm', ['exec', 'expo', 'export', '--platform', 'ios', '--output-dir', iosExport]);
  run('Create Android production export', 'pnpm', ['exec', 'expo', 'export', '--platform', 'android', '--output-dir', androidExport]);
  run('Scan tracked source and mobile exports for secrets', 'pnpm', ['verify:mobile-secrets', iosExport, androidExport]);
  // P18-004: prove the compiled friend-table surface and v4 lane in what the
  // build actually ships — not just in the source configuration.
  run('Assert friend-table surface and v4 lane in the compiled bundle', 'node', ['scripts/verify-release-bundle.mjs', androidExport]);
  if (androidArtifact) {
    // P18-006: Play-facing artifact properties (target API 36, 16 KB pages),
    // asserted against the exact file a human or the store would receive.
    run('Inspect the actual Android artifact', 'node', ['scripts/verify-android-artifact.mjs', androidArtifact]);
  } else {
    console.log('\n[release] Android artifact inspection skipped: no --android-artifact given.');
    console.log('[release] Build one with scripts/build-android-local-release.sh (runs this gate itself),');
    console.log('[release] or pass --android-artifact <path.apk|.aab> to release:check.');
  }
  console.log('\nRiverMind release gate passed.');
} finally {
  rmSync(releaseRoot, { force: true, recursive: true });
}
