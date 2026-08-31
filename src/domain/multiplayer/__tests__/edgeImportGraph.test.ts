import { describe, expect, it } from 'vitest';

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * H01 regression (Slice 3.11 hardening): the Supabase Edge worker resolves
 * the whole relative import graph of `supabase/functions/multiplayer-room/
 * index.ts` under Deno, which rejects extensionless relative specifiers.
 * Every relative import reachable from that entry point must therefore carry
 * an explicit `.ts`/`.js`/`.tsx` extension (or be a documented bare/HTTP
 * specifier handled by deno.json).
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const edgeEntries = [
  join(repoRoot, 'supabase/functions/multiplayer-room/index.ts'),
  join(repoRoot, 'supabase/functions/multiplayer-room-preview/index.ts'),
];

const ALLOWED_BARE_PREFIXES = ['@supabase/', 'jsr:', 'npm:', 'node:', 'https://'];

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  if (ALLOWED_BARE_PREFIXES.some((prefix) => specifier.startsWith(prefix))) return null;
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null;
  const base = specifier.startsWith('/')
    ? join(repoRoot, specifier.slice(1))
    : join(dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return base; // missing file: report it so the test fails loudly
}

function collectRelativeImports(entryFile: string, visited: Set<string>): string[] {
  if (visited.has(entryFile) || !existsSync(entryFile)) return [];
  visited.add(entryFile);
  const violations: string[] = [];
  const source = readFileSync(entryFile, 'utf8');
  const specifierPattern = /(?:from\s+|import\s*\(\s*|import\s+)['"](\.[^'"]+|@?[^'"]*?)['"]/g;
  for (const match of source.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:type\s+)?import[\s\S]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const specifier = match[1] ?? match[2];
    if (!specifier) continue;
    if (ALLOWED_BARE_PREFIXES.some((prefix) => specifier.startsWith(prefix))) continue;
    if (!specifier.startsWith('.')) continue;
    if (!/\.(ts|tsx|js|jsx|json)$/.test(specifier)) {
      violations.push(`${entryFile}: extensionless relative import '${specifier}'`);
    }
    const target = resolveSpecifier(entryFile, specifier);
    if (target) violations.push(...collectRelativeImports(target, visited));
  }
  return violations;
}

describe('Edge worker import graph (H01 regression)', () => {
  it('resolves every relative import reached by either multiplayer worker with an explicit extension', () => {
    for (const edgeEntry of edgeEntries) expect(existsSync(edgeEntry)).toBe(true);
    const violations = edgeEntries.flatMap((edgeEntry) =>
      collectRelativeImports(edgeEntry, new Set())
    );
    expect(violations, violations.join('\n')).toEqual([]);
  });
});
