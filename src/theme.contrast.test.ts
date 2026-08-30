import { describe, expect, it } from 'vitest';

import { darkPalette, lightPalette, type ThemePalette } from './themePalette';

/**
 * The Slice 3.11A theme-token contrast corpus. Every pair listed here is a
 * foreground/background combination the app actually composes (verified by the
 * 3.11A usage audit). Ordinary text must clear 4.5:1; large text and
 * meaningful non-text controls must clear 3:1. A palette change that breaks
 * any pair fails this corpus, and a new foreground/background combination must
 * be added here before components may compose it.
 */

type PalettePair = [foreground: keyof ThemePalette, background: keyof ThemePalette, minRatio: number];

const WCAG_LARGE_TEXT_MIN = 3;
const WCAG_TEXT_MIN = 4.5;

/** Pairs shared by both palettes. The corpus intentionally names usage pairs,
 * not every algebraic combination: for example `aquaText` is only ever
 * composed on `aquaSoft`/`soft`/`surface`, never on an `aqua` fill. */
const corpus: PalettePair[] = [
  // Primary copy on every surface it is composed on.
  ['text', 'background', WCAG_TEXT_MIN],
  ['text', 'surface', WCAG_TEXT_MIN],
  ['text', 'surfaceRaised', WCAG_TEXT_MIN],
  ['text', 'soft', WCAG_TEXT_MIN],
  ['text', 'accentSoft', WCAG_TEXT_MIN],
  ['text', 'aquaSoft', WCAG_TEXT_MIN],
  // Secondary copy.
  ['muted', 'background', WCAG_TEXT_MIN],
  ['muted', 'surface', WCAG_TEXT_MIN],
  ['muted', 'soft', WCAG_TEXT_MIN],
  ['muted', 'accentSoft', WCAG_TEXT_MIN],
  ['muted', 'aquaSoft', WCAG_TEXT_MIN],
  // Accent text/icons (large/meaningful-control threshold).
  ['primary', 'background', WCAG_LARGE_TEXT_MIN],
  ['primary', 'surface', WCAG_LARGE_TEXT_MIN],
  ['primary', 'soft', WCAG_LARGE_TEXT_MIN],
  ['primary', 'accentSoft', WCAG_LARGE_TEXT_MIN],
  ['aqua', 'background', WCAG_LARGE_TEXT_MIN],
  ['aqua', 'surface', WCAG_LARGE_TEXT_MIN],
  ['amber', 'background', WCAG_LARGE_TEXT_MIN],
  ['amber', 'surface', WCAG_LARGE_TEXT_MIN],
  // Foreground pairs on colored fills.
  ['primaryText', 'primary', WCAG_TEXT_MIN],
  ['onAqua', 'aqua', WCAG_TEXT_MIN],
  ['amberText', 'amber', WCAG_TEXT_MIN],
  ['aquaText', 'aquaSoft', WCAG_TEXT_MIN],
  ['aquaText', 'soft', WCAG_TEXT_MIN],
  ['aquaText', 'surface', WCAG_TEXT_MIN],
  // Table surfaces.
  ['tableText', 'table', WCAG_TEXT_MIN],
  ['tableText', 'tableDeep', WCAG_TEXT_MIN],
  // Cards and status colors.
  ['cardText', 'card', WCAG_TEXT_MIN],
  ['cardRed', 'card', WCAG_LARGE_TEXT_MIN],
  ['cardRed', 'surface', WCAG_LARGE_TEXT_MIN],
  ['danger', 'background', WCAG_LARGE_TEXT_MIN],
  ['danger', 'surface', WCAG_LARGE_TEXT_MIN],
  ['danger', 'soft', WCAG_LARGE_TEXT_MIN],
];

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const channel = (v: number) => v.toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** WCAG 2.x relative luminance. */
function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (v: number) => {
    const srgb = v / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const l1 = Math.max(la, lb);
  const l2 = Math.min(la, lb);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('theme contrast corpus', () => {
  for (const [name, palette] of [['light', lightPalette], ['dark', darkPalette]] as const) {
    it(`satisfies every declared usage pair in the ${name} palette`, () => {
      for (const [fg, bg, min] of corpus) {
        const ratio = contrastRatio(palette[fg], palette[bg]);
        expect(ratio, `${String(fg)} on ${String(bg)} in ${name}: ${ratio.toFixed(2)} < ${min}`).toBeGreaterThanOrEqual(min);
      }
    });

    it(`keeps scrim usage honest in the ${name} palette`, () => {
      // Audit note (3.11A): `scrim` is composed only as a modal/overlay
      // backdrop — no text renders directly on it. Overlays that carry text
      // (action bubbles, moment lanes) compose `surfaceRaised`/`surface`
      // backgrounds with themed text, which the corpus above already covers.
      // If a future surface renders text directly on `scrim`, add that pair
      // here with its composited background instead of assuming it readable.
      expect(palette.scrim).toMatch(/^rgba\(/);
    });

    it(`only uses parseable hex or rgba colors in the ${name} palette`, () => {
      for (const [token, value] of Object.entries(palette)) {
        const parseable = /^#[0-9a-fA-F]{6}$/.test(value) || /^rgba\(\d+,\s*\d+,\s*\d+,\s*[\d.]+\)$/.test(value);
        expect(parseable, `${token} = ${value}`).toBe(true);
      }
    });
  }

  it('keeps the two palettes structurally parallel', () => {
    expect(Object.keys(lightPalette).sort()).toEqual(Object.keys(darkPalette).sort());
  });
});
