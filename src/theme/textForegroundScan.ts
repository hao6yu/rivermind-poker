/**
 * The Slice 3.11A source invariant: every visible `Text` and vector icon in
 * the app must resolve an explicit, themed foreground. React Native falls back
 * to platform black/white when no color is applied, which is exactly how the
 * dark-mode Home defect shipped, so this scanner rejects:
 *
 *  - `<Text>` elements with no `style` prop at all;
 *  - `<Text>` elements whose style chain contains no resolved foreground —
 *    either an inline `palette.*`/`color` reference or at least one referenced
 *    file-local style entry that declares `color`;
 *  - vector-icon elements (`Ionicons` etc.) without a `color` prop.
 *
 * Text that *inherits* a reviewed themed foreground is allowed only through the
 * explicit `REVIEWED_THEMED_TEXT_BOUNDARIES` allowlist below, each entry
 * documenting why the inheritance is safe. New components must resolve their
 * own foreground rather than growing this list.
 */

export interface ScanViolation {
  file: string;
  line: number;
  kind: 'text-no-style' | 'text-no-color' | 'text-unresolved-style' | 'icon-no-color';
  detail: string;
}

export interface ScannedFile {
  path: string;
  content: string;
}

/**
 * Reviewed themed-text boundaries: components whose `Text` elements inherit a
 * themed foreground through a reviewed parent style or a caller-owned themed
 * style prop. Every entry is a deliberate exception with its justification.
 */
export const REVIEWED_THEMED_TEXT_BOUNDARIES: Readonly<Record<string, string>> = {
  // The nested emphasis Text inherits its color from the themed parent style
  // the caller passes (all call sites pass a themed bubble style).
  'src/components/ActionBubbleText.tsx':
    'Nested emphasis Text inherits the themed color of the reviewed parent bubble style.',
  // The root Text forwards caller-owned TextProps; every caller supplies a
  // themed style, and the red-suit segment resolves palette.cardRed inline.
  'src/components/SuitAwareText.tsx':
    'Root Text forwards caller-owned themed TextProps; suit segments resolve palette.cardRed.',
  // GuidedText forwards the caller-owned themed style while scaling fonts.
  'src/features/learn/LearningSetupModal.tsx':
    'GuidedText forwards the caller-owned themed style while scaling fonts.',
  'src/features/learn/SkillCalibrationModal.tsx':
    'GuidedText forwards the caller-owned themed style while scaling fonts.',
};

/** Files excluded from the scan. The scanner module itself documents JSX in
 * prose comments and is tooling, not UI; everything else must stay clean. */
const EXCLUDED_FILES = new Set<string>(['src/theme/textForegroundScan.ts']);

const ICON_COMPONENTS = /^(Ionicons|Feather|MaterialIcons|MaterialCommunityIcons|FontAwesome|AntDesign|Entypo)$/;

export function scanSourceForDefaultForeground(files: readonly ScannedFile[]): ScanViolation[] {
  const violations: ScanViolation[] = [];
  for (const file of files) {
    if (EXCLUDED_FILES.has(file.path) || file.path.endsWith('.test.ts') || file.path.endsWith('.test.tsx')) continue;
    violations.push(...scanFile(file.path, file.content));
  }
  return violations;
}

function scanFile(path: string, src: string): ScanViolation[] {
  const violations: ScanViolation[] = [];
  const styles = extractStyleEntries(src);
  const allowlisted = Object.prototype.hasOwnProperty.call(REVIEWED_THEMED_TEXT_BOUNDARIES, path);
  const lineAt = (index: number) => src.slice(0, index).split('\n').length;

  const elementRe = /<(Text|Ionicons|Feather|MaterialIcons|MaterialCommunityIcons|FontAwesome|AntDesign|Entypo)\b/g;
  let match: RegExpExecArray | null;
  while ((match = elementRe.exec(src)) !== null) {
    const tagEnd = openingTagEnd(src, match.index);
    if (tagEnd === -1) continue;
    const tag = src.slice(match.index, tagEnd);
    const line = lineAt(match.index);
    const component = match[1]!;

    if (component === 'Text') {
      if (allowlisted) continue;
      const styleExpr = extractAttribute(tag, 'style');
      if (styleExpr === null) {
        violations.push({ file: path, line, kind: 'text-no-style', detail: '<Text> without a style prop' });
        continue;
      }
      if (exprResolvesForeground(styleExpr)) continue;
      const refs = [...styleExpr.matchAll(/(?:styles|s)\.(\w+)/g)].map((r) => r[1]!);
      const known = refs.filter((ref) => styles.has(ref));
      if (known.some((ref) => entryHasColor(styles.get(ref)!))) continue;
      if (refs.length === 0 || known.length === 0) {
        violations.push({
          file: path,
          line,
          kind: 'text-unresolved-style',
          detail: `style expression does not reference a local style: ${styleExpr.slice(0, 80)}`,
        });
        continue;
      }
      const missing = [...new Set(known.filter((ref) => !entryHasColor(styles.get(ref)!)))];
      violations.push({
        file: path,
        line,
        kind: 'text-no-color',
        detail: `style chain has no explicit foreground: ${missing.join(', ')}`,
      });
      continue;
    }

    // Vector icon components.
    if (!EXCLUDED_FILES.has(path) && extractAttribute(tag, 'color') === null) {
      violations.push({ file: path, line, kind: 'icon-no-color', detail: `<${component}> without a color prop` });
    }
  }
  return violations;
}

/** True when the style expression itself resolves a foreground inline. */
function exprResolvesForeground(expr: string): boolean {
  return /palette\.\w+/.test(expr) || /\bcolor\b/.test(expr);
}

/** Find the end of a JSX opening tag, honoring quotes and brace nesting. */
function openingTagEnd(src: string, start: number): number {
  let i = start;
  let quote: string | null = null;
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i += 2; continue; }
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === '`') {
      quote = c;
    } else if (c === '{') {
      depth += 1;
    } else if (c === '}') {
      depth -= 1;
    } else if (c === '>' && depth === 0) {
      return i;
    }
    i += 1;
  }
  return -1;
}

/** Extract one JSX attribute's brace expression, or null when absent. */
function extractAttribute(tag: string, attribute: string): string | null {
  const match = new RegExp(`\\b${attribute}\\s*=\\s*`).exec(tag);
  if (!match) return null;
  const braceStart = tag.indexOf('{', match.index);
  if (braceStart === -1) return tag.slice(match.index + match[0].length).trim();
  const expr = balancedBlock(tag, braceStart);
  return expr.slice(1, -1);
}

/** Extract the top-level entries of every `StyleSheet.create({...})` block. */
function extractStyleEntries(src: string): Map<string, string> {
  const entries = new Map<string, string>();
  const createRe = /StyleSheet\.create\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = createRe.exec(src)) !== null) {
    const openParen = src.indexOf('(', match.index);
    const block = balancedBlock(src, openParen);
    const keyRe = /(\w+)\s*:\s*\{/g;
    let keyMatch: RegExpExecArray | null;
    while ((keyMatch = keyRe.exec(block)) !== null) {
      const openBrace = block.indexOf('{', keyMatch.index);
      const literal = balancedBlock(block, openBrace);
      entries.set(keyMatch[1]!, literal);
      keyRe.lastIndex = openBrace + literal.length;
    }
  }
  return entries;
}

/** A style entry resolves a foreground when it declares `color:` directly or
 * spreads another entry that does (e.g. `...common`). */
function entryHasColor(literal: string): boolean {
  return /(^|[^a-zA-Z_])color\s*:/.test(literal);
}

/** Extract a balanced `{...}` or `(...)` block starting at the open char. */
function balancedBlock(src: string, openIdx: number): string {
  const open = src[openIdx];
  const close = open === '{' ? '}' : ')';
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
