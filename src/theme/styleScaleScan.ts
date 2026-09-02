/**
 * Phase 18.5 (S8/P18-022, P18-046) — the style-scale source scan.
 *
 * Two enforcement tiers, mirroring the Slice 3.11A foreground scan:
 *
 *  1. **Literal-color tier (hard, zero tolerance).** StyleSheet entries may
 *     not set surface/border/shadow/tint colors with a string, hex, or rgba
 *     literal. Every visible color must resolve through `palette.*` (or the
 *     narrow, documented exception list below). This closes P18-022: the
 *     remaining literal surface/border/shadow colors are migrated or
 *     exception-listed with a reason.
 *
 *  2. **Scale tier (pinned baseline).** Off-scale spacing, radius, type, and
 *     control-height literals are COUNTED. The test pins the current count as
 *     a ceiling: new off-scale literals fail the suite. The baseline is a
 *     ratchet — it must shrink as migration lands, never grow. Genuinely
 *     measured table layout uses the documented `REVIEWED_MEASURED_GEOMETRY`
 *     escape hatch instead of the scale, and those entries are excluded from
 *     the count.
 *
 * Known limitations, documented deliberately: the scanner reads StyleSheet
 * object literals and inline style objects textually; conditional style
 * helpers that compute values inside functions (the measured table-layout
 * modules) are covered only through their returned object literals, and
 * dynamically built numeric values are invisible. The foreground scan
 * (`textForegroundScan.ts`) remains the authority for text/icon color.
 */

import { RADIUS, SPACING, TYPOGRAPHY } from './designTokens';

export interface StyleScaleViolation {
  file: string;
  line: number;
  kind: 'literal-color' | 'off-scale-spacing' | 'off-scale-radius' | 'off-scale-type' | 'off-scale-control-height';
  property: string;
  detail: string;
}

export interface ScannedFile {
  path: string;
  content: string;
}

/** Style properties whose value must be a themed color, never a literal. */
const COLOR_PROPERTIES = [
  'backgroundColor',
  'borderColor',
  'borderTopColor',
  'borderBottomColor',
  'borderLeftColor',
  'borderRightColor',
  'shadowColor',
  'tintColor',
  'overlayColor',
] as const;

const LITERAL_COLOR_VALUE = /(['"`])#?[0-9A-Fa-f]{3,8}\1|rgba?\(|['"`](?:white|black|red|blue|green|gray|grey)\1/i;

/**
 * `transparent` means "no fill" rather than a color choice; it reads
 * identically in both schemes and is allowed without an exception entry.
 * Every visible fill/stroke must still resolve through `palette.*`.
 */
const TRANSPARENT_ONLY = /^\s*['"`]transparent['"`]\s*$/;

/** Spacing properties audited against the 4-point scale. */
const SPACING_PROPERTIES = /^(padding|margin)(Top|Bottom|Left|Right|Horizontal|Vertical)?$|^(padding|margin|gap|rowGap|columnGap)$/;

const SPACING_ALLOWED_VALUES = new Set<number>(Object.values(SPACING));

/** Radius values audited against the radius scale. */
const RADIUS_ALLOWED_VALUES = new Set<number>(Object.values(RADIUS));

/** Type sizes audited against the typography tiers. */
const TYPE_ALLOWED_VALUES = new Set<number>(Object.values(TYPOGRAPHY).map((tier) => tier.fontSize));

/**
 * Interactive control heights: `height`/`minHeight` on a style entry that
 * also sets vertical padding or is plausibly a control. Rather than guess,
 * the audit counts `height`/`minHeight` values that are not on the control
 * scale OR one of the common non-control sizes (avatar diameters, chips).
 * The pinned baseline absorbs the existing legitimate set; only growth fails.
 */
const HEIGHT_PROPERTIES = /^(min(?:imum)?Height|maxHeight|height)$/;

/**
 * Reviewed literal-color exceptions. Each entry names the file and the
 * property, with the reason the color is deliberately not a palette token.
 * The list must stay short; adding to it requires a documented reason here.
 */
export const REVIEWED_LITERAL_COLOR_EXCEPTIONS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  // The felt is a fixed translucent overlay in BOTH themes (see
  // themePalette flashOverlay) and its border stays a fixed white hairline;
  // both resolve through palette tokens today, and this entry reserves the
  // documented exception slot pattern for future measured-felt needs.
};

/**
 * Reviewed measured-geometry files: modules whose numbers ARE the measured
 * table layout (seat rings, card tiers, plaque frames). Their geometry
 * literals are excluded from the scale count — but never from the
 * literal-color tier. Additions must document what is measured.
 */
export const REVIEWED_MEASURED_GEOMETRY: Readonly<Record<string, string>> = {
  'src/features/table/multiwayTableLayout.ts': 'Seat-ring and card-tier geometry measured across the device matrix.',
  'src/features/table/multiplayerPlaqueLayout.ts': 'Private-table plaque geometry measured against localized stacks.',
  'src/features/table/tableOverlayLayout.ts': 'Overlay lane geometry measured per device class.',
  'src/features/table/tableResponsiveLayout.ts': 'Table responsive breakpoints measured per device class.',
  'src/features/table/tableActivityLayout.ts': 'Activity-feed lane geometry measured per device class.',
  'src/features/multiplayer/multiplayerBubbleLayout.ts': 'Action-bubble lane geometry measured per device class.',
  'src/features/multiplayer/tableMomentTrayLayout.ts': 'Moment-tray lane geometry measured per device class.',
  'src/features/learn/modalSafeAreaGeometry.ts': 'Modal safe-area sheet geometry measured per device class.',
  'src/domain/avatarFraming.ts': 'Authored-avatar optical framing measured against the asset silhouettes.',
};

/** StyleSheet entries that alias another entry or a computed spread are
 * resolved textually where trivially possible; aliased entries are skipped. */
const ALIAS_ONLY_ENTRY = /^\s*(?:\.\.\.)?[A-Za-z_$][\w$]*\s*$/;

export function scanSourceForStyleScale(files: readonly ScannedFile[]): StyleScaleViolation[] {
  const violations: StyleScaleViolation[] = [];
  for (const file of files) {
    if (file.path.endsWith('.test.ts') || file.path.endsWith('.test.tsx')) continue;
    if (file.path === 'src/theme/styleScaleScan.ts') continue;
    if (file.path === 'src/theme/designTokens.ts') continue;
    if (file.path === 'src/theme/themePalette.ts') continue;
    violations.push(...scanFileForStyleScale(file.path, file.content));
  }
  return violations;
}

function scanFileForStyleScale(path: string, src: string): StyleScaleViolation[] {
  const violations: StyleScaleViolation[] = [];
  const source = stripComments(src);
  const measuredFile = Object.prototype.hasOwnProperty.call(REVIEWED_MEASURED_GEOMETRY, path);
  const colorExceptions = REVIEWED_LITERAL_COLOR_EXCEPTIONS[path] ?? {};
  const lineAt = (index: number) => src.slice(0, index).split('\n').length;

  for (const entry of styleEntries(source)) {
    const line = entry.line;
    const isAliasOnly = ALIAS_ONLY_ENTRY.test(entry.body);
    // Literal-color tier.
    for (const property of COLOR_PROPERTIES) {
      const values = propertyValues(entry.body, property);
      for (const value of values) {
        if (!LITERAL_COLOR_VALUE.test(value)) continue;
        if (TRANSPARENT_ONLY.test(value)) continue;
        const exempt = isAliasOnly
          || Boolean(colorExceptions[property])
          || computedOverPalette(value);
        if (exempt) continue;
        violations.push({
          file: path,
          line,
          kind: 'literal-color',
          property,
          detail: `literal color on ${property}: ${value.trim().slice(0, 60)}`,
        });
      }
    }
    if (measuredFile || isAliasOnly) continue;

    // Scale tier — skipped for measured-geometry files.
    const numeric = numericDeclarations(entry.body);
    for (const declaration of numeric) {
      const property = declaration.property;
      const value = declaration.value;
      if (!Number.isFinite(value)) continue;
      if (SPACING_PROPERTIES.test(property) && !SPACING_ALLOWED_VALUES.has(value)) {
        violations.push({
          file: path,
          line,
          kind: 'off-scale-spacing',
          property,
          detail: `${property}: ${value} is off the 4-point spacing scale`,
        });
      } else if (property === 'borderRadius' && !RADIUS_ALLOWED_VALUES.has(value) && value > 2) {
        violations.push({
          file: path,
          line,
          kind: 'off-scale-radius',
          property,
          detail: `borderRadius: ${value} is off the radius scale`,
        });
      } else if (property === 'fontSize' && !TYPE_ALLOWED_VALUES.has(value)) {
        violations.push({
          file: path,
          line,
          kind: 'off-scale-type',
          property,
          detail: `fontSize: ${value} is off the typography tiers`,
        });
      } else if (HEIGHT_PROPERTIES.test(property) && !isCommonNonControlHeight(value)) {
        violations.push({
          file: path,
          line,
          kind: 'off-scale-control-height',
          property,
          detail: `${property}: ${value} is off the control-height scale`,
        });
      }
    }
    void lineAt;
  }
  return violations;
}

/**
 * A value is exempt when it is computed over palette tokens (a ternary or
 * expression whose literals are absent) — e.g.
 * `scheme === 'dark' ? palette.surface : palette.background`.
 */
function computedOverPalette(value: string): boolean {
  return !LITERAL_COLOR_VALUE.test(value);
}

/** Diameters and other non-control heights that legitimately appear. */
function isCommonNonControlHeight(value: number): boolean {
  return [6, 14, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 52, 56, 64, 74, 88, 104].includes(value);
}

interface StyleEntry {
  name: string;
  body: string;
  line: number;
}

/** Extract every `StyleSheet.create` entry as raw text. */
function styleEntries(source: string): StyleEntry[] {
  const entries: StyleEntry[] = [];
  const createRe = /StyleSheet\.create\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = createRe.exec(source)) !== null) {
    const openParen = source.indexOf('(', match.index);
    const block = balancedBlock(source, openParen);
    const keyRe = /(\w+)\s*:\s*(\{|\[|[A-Za-z_$])/g;
    let keyMatch: RegExpExecArray | null;
    while ((keyMatch = keyRe.exec(block)) !== null) {
      const name = keyMatch[1]!;
      const openChar = keyMatch[2]!;
      if (openChar !== '{') continue;
      const openBrace = block.indexOf('{', keyMatch.index);
      const literal = balancedBlock(block, openBrace);
      entries.push({
        name,
        body: literal.slice(1, -1),
        line: match.index + keyMatch.index,
      });
      keyRe.lastIndex = openBrace + literal.length;
    }
  }
  return entries;
}

/** All `property: <number literal>` declarations in a style body. */
function numericDeclarations(body: string): Array<{ property: string; value: number }> {
  const out: Array<{ property: string; value: number }> = [];
  const re = /([a-zA-Z][a-zA-Z0-9]*)\s*:\s*(-?\d+(?:\.\d+)?)\s*(?:[,}]|$)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    out.push({ property: match[1]!, value: Number(match[2]) });
  }
  return out;
}

/** Extract each declared value of one property from a style body. */
function propertyValues(body: string, property: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`${property}\\s*:\\s*`, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    const start = match.index + match[0].length;
    const rest = body.slice(start);
    const value = readValue(rest);
    if (value) out.push(value);
    re.lastIndex = start + (value?.length ?? 0);
  }
  return out;
}

/** Read one property value: a quoted string, a balanced brace group, or up
 * to the next comma at depth zero. */
function readValue(rest: string): string | null {
  const first = rest.trimStart()[0];
  if (first === undefined) return null;
  if (first === '"' || first === "'" || first === '`') {
    const quote = first;
    let i = rest.indexOf(quote, 1);
    // Honor escapes minimally; style values rarely contain them.
    while (i > 0 && rest[i - 1] === '\\') i = rest.indexOf(quote, i + 1);
    return i === -1 ? rest.trim() : rest.slice(0, i + 1);
  }
  if (first === '{' || first === '(') {
    const block = balancedBlock(rest.trimStart(), 0);
    return block;
  }
  const comma = rest.indexOf(',');
  const end = comma === -1 ? rest.length : comma;
  return rest.slice(0, end).replace(/\s+$/, '');
}

/** Blank out comments while preserving character positions. */
function stripComments(src: string): string {
  const out = src.split('');
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i += 2; continue; }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      i += 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') { out[i] = ' '; i += 1; }
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] !== '\n') out[i] = ' ';
        i += 1;
      }
      if (i < src.length) { out[i] = ' '; out[i + 1] = ' '; i += 2; }
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/** Extract a balanced `{...}`/`(...)`/`[...]` block starting at the open char. */
function balancedBlock(src: string, openIdx: number): string {
  const open = src[openIdx];
  const close = open === '{' ? '}' : open === '(' ? ')' : ']';
  let depth = 0;
  let i = openIdx;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i += 2; continue; }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      i += 1;
      continue;
    }
    if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) return src.slice(openIdx, i + 1);
    }
    i += 1;
  }
  return src.slice(openIdx);
}
