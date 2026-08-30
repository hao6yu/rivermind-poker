import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  REVIEWED_THEMED_TEXT_BOUNDARIES,
  scanSourceForDefaultForeground,
  type ScannedFile,
} from './textForegroundScan';

const SRC_ROOT = join(__dirname, '..');

/** Every non-test source file, mirroring the app bundle. */
function collectSourceFiles(dir: string): ScannedFile[] {
  const out: ScannedFile[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === '__tests__') continue;
      out.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry)) continue;
    const content = readFileSync(fullPath, 'utf8');
    const relative = fullPath.slice(SRC_ROOT.length + 1).split('\\').join('/');
    out.push({ path: `src/${relative}`, content });
  }
  return out;
}

describe('no-default-foreground source invariant', () => {
  it('rejects unstyled Text and icons in a synthetic sample', () => {
    const violations = scanSourceForDefaultForeground([
      {
        path: 'src/sample.tsx',
        content: [
          'import { StyleSheet, Text } from "react-native";',
          'export function Sample() {',
          '  return (',
          '    <>',
          '      <Text>forgotten</Text>',
          '      <Text style={styles.plain}>no color here</Text>',
          '      <Ionicons name="alert-outline" size={16} />',
          '      <Text style={styles.good}>themed</Text>',
          '      <Text style={[styles.plain, { color: palette.muted }]}>inline</Text>',
          '    </>',
          '  );',
          '}',
          'const styles = StyleSheet.create({',
          '  plain: { fontSize: 14 },',
          '  good: { color: palette.text, fontSize: 14 },',
          '});',
        ].join('\n'),
      },
    ]);
    expect(violations).toHaveLength(3);
    expect(violations.map((v) => v.kind)).toEqual(['text-no-style', 'text-no-color', 'icon-no-color']);
  });

  it('accepts every reviewed themed-text boundary as documented', () => {
    for (const [path, reason] of Object.entries(REVIEWED_THEMED_TEXT_BOUNDARIES)) {
      expect(reason.length, path).toBeGreaterThan(20);
      expect(readFileSync(join(SRC_ROOT, path.slice('src/'.length)), 'utf8'), path).toBeTruthy();
    }
  });

  it('finds no default-foreground text or icons in the app source', () => {
    const violations = scanSourceForDefaultForeground(collectSourceFiles(SRC_ROOT));
    expect(
      violations.map((v) => `${v.file}:${v.line} ${v.kind} ${v.detail}`),
    ).toEqual([]);
  });
});
