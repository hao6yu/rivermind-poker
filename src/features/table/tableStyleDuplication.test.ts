import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * S8/P18-048 — the duplication guard for the three live-table surfaces.
 *
 * Byte-identical style definitions across the heads-up table, the local
 * multiway table, and the private table belong in `tableStyleKit.ts`. When a
 * screen needs one of those definitions it spreads the kit builder; a new
 * identical literal in two files fails this test. Screen-specific styles are
 * expected and welcome — only cross-file duplicates are violations.
 */

const TABLE_FILES = [
  'src/features/table/PokerTableScreen.tsx',
  'src/features/table/MultiwayPokerTableScreen.tsx',
  'src/features/multiplayer/MultiplayerFlowModal.tsx',
];

const ROOT = join(__dirname, '..', '..', '..');

interface StyleEntry {
  name: string;
  body: string;
}

function styleEntriesOf(src: string): StyleEntry[] {
  const entries: StyleEntry[] = [];
  const createRe = /StyleSheet\.create\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = createRe.exec(src)) !== null) {
    const open = src.indexOf('{', match.index);
    let depth = 0;
    let i = open;
    while (i < src.length) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
      i += 1;
    }
    const block = src.slice(open, i + 1);
    const keyRe = /(\w+)\s*:\s*\{/g;
    let keyMatch: RegExpExecArray | null;
    while ((keyMatch = keyRe.exec(block)) !== null) {
      const ob = block.indexOf('{', keyMatch.index);
      let d = 0;
      let j = ob;
      while (j < block.length) {
        if (block[j] === '{') d += 1;
        else if (block[j] === '}') {
          d -= 1;
          if (d === 0) break;
        }
        j += 1;
      }
      entries.push({ name: keyMatch[1]!, body: block.slice(ob, j + 1) });
      keyRe.lastIndex = j;
    }
    createRe.lastIndex = i;
  }
  return entries;
}

const normalize = (body: string): string => body.replace(/\s+/g, ' ').trim();

describe('table style duplication guard (S8/P18-048)', () => {
  it('has zero identical style definitions across the three table surfaces', () => {
    const perFile = TABLE_FILES.map((file) => ({
      file,
      entries: styleEntriesOf(readFileSync(join(ROOT, file), 'utf8')),
    }));
    const duplicates: string[] = [];
    for (let a = 0; a < perFile.length; a += 1) {
      for (let b = a + 1; b < perFile.length; b += 1) {
        const left = perFile[a]!;
        const right = perFile[b]!;
        for (const entry of left.entries) {
          const twin = right.entries.find(
            (candidate) => candidate.name === entry.name && normalize(candidate.body) === normalize(entry.body),
          );
          if (twin) {
            duplicates.push(`${left.file} ≡ ${right.file} :: ${entry.name}`);
          }
        }
      }
    }
    expect(duplicates).toEqual([]);
  });

  it('keeps the shared kit the single source for the extracted groups', () => {
    // The kit must still export every group the screens spread in; a screen
    // drifting back to literal copies is caught by the zero-duplicate test,
    // and this pins the module boundary itself.
    const kit = readFileSync(join(ROOT, 'src/features/table/tableStyleKit.ts'), 'utf8');
    for (const exported of [
      'sharedSeatActionBubbleTones',
      'sharedLocalTableCoachStyles',
      'sharedProfileIdentityStyles',
    ]) {
      expect(kit).toContain(`export function ${exported}`);
    }
    for (const file of TABLE_FILES) {
      const src = readFileSync(join(ROOT, file), 'utf8');
      expect(src).toContain('tableStyleKit');
    }
  });
});
