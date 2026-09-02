import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  REVIEWED_LITERAL_COLOR_EXCEPTIONS,
  REVIEWED_MEASURED_GEOMETRY,
  scanSourceForStyleScale,
  type ScannedFile,
  type StyleScaleViolation,
} from './styleScaleScan';

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

export function currentStyleScaleViolations(): StyleScaleViolation[] {
  return scanSourceForStyleScale(collectSourceFiles(SRC_ROOT));
}

describe('style-scale source invariant', () => {
  it('rejects literal surface/border/shadow colors in a synthetic sample', () => {
    const violations = scanSourceForStyleScale([
      {
        path: 'src/sample-colors.tsx',
        content: [
          'import { StyleSheet } from "react-native";',
          'const styles = StyleSheet.create({',
          '  bad: { backgroundColor: "#FFF", borderColor: "rgba(0,0,0,0.2)" },',
          '  good: { backgroundColor: palette.surface, borderColor: palette.border },',
          '  ternary: { backgroundColor: scheme === "dark" ? palette.surface : palette.background },',
          '});',
        ].join('\n'),
      },
    ]);
    expect(violations).toHaveLength(2);
    expect(violations.every((violation) => violation.kind === 'literal-color')).toBe(true);
  });

  it('exempts measured-geometry files from the scale tier but never the color tier', () => {
    const violations = scanSourceForStyleScale([
      {
        path: 'src/features/table/multiwayTableLayout.ts',
        content: [
          'export const MEASURED = StyleSheet.create({',
          '  seat: { width: 71, paddingLeft: 5, backgroundColor: "#123456" },',
          '});',
        ].join('\n'),
      },
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.kind).toBe('literal-color');
  });

  it('honors the documented literal-color exception list', () => {
    const firstExceptionFile = Object.keys(REVIEWED_LITERAL_COLOR_EXCEPTIONS)[0];
    if (!firstExceptionFile) return; // the list is empty; the mechanism stays covered above
    const violations = scanSourceForStyleScale([
      {
        path: firstExceptionFile,
        content: 'export const S = StyleSheet.create({ a: { shadowColor: "#000" } });',
      },
    ]);
    expect(violations).toHaveLength(0);
  });

  /**
   * The hard tier: zero literal surface/border/shadow colors anywhere in the
   * app source (P18-022). New literals fail here; genuinely justified ones
   * must be added to `REVIEWED_LITERAL_COLOR_EXCEPTIONS` with a reason.
   */
  it('finds zero literal surface/border/shadow colors in the app source', () => {
    const violations = currentStyleScaleViolations()
      .filter((violation) => violation.kind === 'literal-color');
    expect(violations).toEqual([]);
  });

  /**
   * The scale-tier ratchet (P18-046). The recorded ceiling is the Phase 18.5
   * S8 entry count of off-scale spacing/radius/type/height literals in
   * normal (non-measured) style entries. New off-scale literals FAIL this
   * test. The ceiling must shrink as screens migrate onto the tokens — it is
   * never a target to grow into. See
   * docs/PHASE_18_5_EXECUTION_RECORD.md for the recorded breakdown.
   */
  it('does not grow the off-scale geometry/type ratchet', () => {
    const violations = currentStyleScaleViolations()
      .filter((violation) => violation.kind !== 'literal-color');
    // `RM_STYLE_SCALE_REPORT=1` prints the per-file/per-kind breakdown used
    // to re-record the ceiling (scripts/record-style-scale.mjs wraps this).
    if (process.env.RM_STYLE_SCALE_REPORT === '1') {
      const byKind: Record<string, number> = {};
      const byFile: Record<string, number> = {};
      for (const violation of violations) {
        byKind[violation.kind] = (byKind[violation.kind] ?? 0) + 1;
        byFile[violation.file] = (byFile[violation.file] ?? 0) + 1;
      }
      console.log('RM_STYLE_SCALE_REPORT byKind:', JSON.stringify(byKind));
      console.log('RM_STYLE_SCALE_REPORT perFile:');
      for (const [file, count] of Object.entries(byFile).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${count}\t${file}`);
      }
      console.log('RM_STYLE_SCALE_REPORT total:', violations.length);
    }
    expect(violations.length).toBeLessThanOrEqual(STYLE_SCALE_BASELINE);
  });
});

/**
 * The recorded S8-entry ratchet ceiling, with the breakdown that produced it
 * (`node`-run report via `pnpm vitest run` on
 * `scripts/record-style-scale.mjs`; breakdown recorded verbatim in
 * docs/PHASE_18_5_EXECUTION_RECORD.md):
 *
 *   S8 entry:  off-scale-spacing 667 / radius 275 / control-height 153 /
 *              type 123 — total 1218.
 *   S8 exit:   off-scale-spacing 656 / radius 273 / control-height 149 /
 *              type 123 — total 1201 (net −17; dead styles removed, the
 *              shared kit landed).

 *
 * Update BOTH the number and the breakdown comment together. The ceiling
 * only ever shrinks.
 */
const STYLE_SCALE_BASELINE = 1201;
