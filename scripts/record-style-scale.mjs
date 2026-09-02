#!/usr/bin/env node
/**
 * Phase 18.5 S8 (P18-046/P18-022) — print the current style-scale counts.
 *
 * Wrapper around the report mode of src/theme/styleScaleScan.test.ts:
 *
 *   RM_STYLE_SCALE_REPORT=1 pnpm vitest run src/theme/styleScaleScan.test.ts
 *
 * Use the printed per-kind/per-file breakdown to re-record the ratchet
 * ceiling in that test file (the ceiling only ever shrinks) and to update the
 * execution-record counts.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync('pnpm', ['vitest', 'run', 'src/theme/styleScaleScan.test.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, RM_STYLE_SCALE_REPORT: '1' },
});
process.exit(result.status ?? 1);
