import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
  run('Unit and simulation tests', 'pnpm', ['test']);
  run('Supabase migration, RLS, archive, and cleanup tests', 'supabase', ['test', 'db']);
  run('Bundle and exercise critical Edge workers', 'pnpm', ['verify:multiplayer-edge']);
  run('Resolve public Expo configuration', 'pnpm', ['exec', 'expo', 'config', '--type', 'public']);
  run('Create iOS production export', 'pnpm', ['exec', 'expo', 'export', '--platform', 'ios', '--output-dir', iosExport]);
  run('Create Android production export', 'pnpm', ['exec', 'expo', 'export', '--platform', 'android', '--output-dir', androidExport]);
  run('Scan tracked source and mobile exports for secrets', 'pnpm', ['verify:mobile-secrets', iosExport, androidExport]);
  console.log('\nRiverMind release gate passed.');
} finally {
  rmSync(releaseRoot, { force: true, recursive: true });
}
