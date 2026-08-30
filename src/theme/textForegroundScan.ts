/**
 * The Slice 3.11A source invariant: every visible `Text` and vector icon in
 * the app must resolve an explicit foreground **from the semantic theme**.
 * React Native falls back to platform black/white when no color is applied,
 * which is exactly how the dark-mode Home defect shipped, and a hardcoded hex
 * evades the palette contract entirely, so this scanner rejects:
 *
 *  - `<Text>` elements with no `style` prop at all;
 *  - `<Text>` elements whose style chain resolves no foreground;
 *  - `<Text>` elements whose resolved foreground is a string/hex/rgba literal
 *    instead of a `palette.*` token (or a reviewed themed identifier such as
 *    the `{ color }` shorthand or a `color: themedVar` value);
 *  - vector-icon elements (`Ionicons` etc.) without a `color` prop.
 *
 * Known limitations, documented deliberately: string literals are not parsed,
 * so `<Text` inside a quoted string is invisible to the scan; custom text
 * components (anything not named `Text`) are not scanned; and the reviewed
 * `REVIEWED_THEMED_TEXT_BOUNDARIES` allowlist is file-level — each entry must
 * therefore keep every `Text` in its file inheriting a themed foreground.
 */

export interface ScanViolation {
  file: string;
  line: number;
  kind: 'text-no-style' | 'text-no-color' | 'text-literal-color' | 'text-unresolved-style' | 'icon-no-color';
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
  // Comments are blanked (length-preserving, so line numbers stay accurate)
  // before pattern matching: prose in a comment must never look like JSX.
  const source = stripComments(src);
  const styles = extractStyleEntries(source);
  const allowlisted = Object.prototype.hasOwnProperty.call(REVIEWED_THEMED_TEXT_BOUNDARIES, path);
  const lineAt = (index: number) => src.slice(0, index).split('\n').length;

  const elementRe = /<(Text|Ionicons|Feather|MaterialIcons|MaterialCommunityIcons|FontAwesome|AntDesign|Entypo)\b/g;
  let match: RegExpExecArray | null;
  while ((match = elementRe.exec(source)) !== null) {
    const tagEnd = openingTagEnd(source, match.index);
    if (tagEnd === -1) continue;
    const tag = source.slice(match.index, tagEnd);
    const line = lineAt(match.index);
    const component = match[1]!;

    if (component === 'Text') {
      if (allowlisted) continue;
      const styleExpr = extractAttribute(tag, 'style');
      if (styleExpr === null) {
        violations.push({ file: path, line, kind: 'text-no-style', detail: '<Text> without a style prop' });
        continue;
      }
      const inline = exprResolvesForeground(styleExpr);
      if (inline === 'themed') continue;
      if (inline === 'literal') {
        violations.push({
          file: path,
          line,
          kind: 'text-literal-color',
          detail: 'style expression resolves a literal color instead of a theme token',
        });
        continue;
      }
      const refs = [...styleExpr.matchAll(/(?:styles|s)\.(\w+)/g)].map((r) => r[1]!);
      const known = refs.filter((ref) => styles.has(ref));
      const resolved = known.map((ref) => entryForeground(styles.get(ref)!, styles));
      if (resolved.includes('themed')) continue;
      if (resolved.includes('literal')) {
        violations.push({
          file: path,
          line,
          kind: 'text-literal-color',
          detail: `style chain resolves a literal color: ${known.filter((ref) => entryForeground(styles.get(ref)!, styles) === 'literal').join(', ')}`,
        });
        continue;
      }
      if (refs.length === 0 || known.length === 0) {
        violations.push({
          file: path,
          line,
          kind: 'text-unresolved-style',
          detail: `style expression does not reference a local style: ${styleExpr.slice(0, 80)}`,
        });
        continue;
      }
      const missing = [...new Set(known.filter((ref) => entryForeground(styles.get(ref)!, styles) !== 'themed'))];
      violations.push({
        file: path,
        line,
        kind: 'text-no-color',
        detail: `style chain has no themed foreground: ${missing.join(', ')}`,
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

/** A color value containing a string/hex/rgba literal instead of a themed
 * token or identifier — the PreflopRangeExplorer regression class
 * (`color: scheme === 'dark' ? '#111' : '#fff'` included). */
const LITERAL_COLOR_VALUE = /['"`#]|rgba?\(/;

/** Extract each `color:` declaration's value text from a style expression. */
function colorValues(expr: string): string[] {
  return (expr.match(/(^|[^a-zA-Z_])color\s*:\s*[^,}]*/g) ?? [])
    .map((declaration) => declaration.replace(/(^|[^a-zA-Z_])color\s*:\s*/, ''));
}

/** True when any `color:` value in the expression is a literal. */
function hasLiteralColor(expr: string): boolean {
  return colorValues(expr).some((value) => LITERAL_COLOR_VALUE.test(value));
}

/**
 * True when the style expression resolves a themed foreground inline:
 * a `palette.*` token, the `{ color }` shorthand, or a `color:` value that
 * names an identifier (a themed variable) rather than a literal. A literal
 * value is reported as a themed-foreground violation, not silently accepted.
 */
function exprResolvesForeground(expr: string): 'themed' | 'literal' | 'none' {
  if (hasLiteralColor(expr)) return 'literal';
  if (colorValues(expr).length > 0) return 'themed';
  if (/palette\.\w+/.test(expr)) return 'themed';
  if (/\bcolor\b/.test(expr)) return 'themed';
  return 'none';
}

/**
 * True when a StyleSheet entry resolves a themed foreground: every `color:`
 * value names a token or identifier (including ternaries over identifiers).
 * A literal value fails the themed rule; entries that spread or alias another
 * entry (`...common`, `image: common`) resolve to that entry.
 */
function entryForeground(literal: string, entries: Map<string, string>): 'themed' | 'literal' | 'none' {
  const alias = singleIdentifierAlias(literal);
  if (alias) {
    const target = entries.get(alias);
    if (target && target !== literal) return entryForeground(target, entries);
    return 'none';
  }
  const values = colorValues(literal);
  if (values.some((value) => LITERAL_COLOR_VALUE.test(value))) return 'literal';
  return values.length > 0 ? 'themed' : 'none';
}

/** `common` or `{ ...common }` style entries alias one other entry. */
function singleIdentifierAlias(literal: string): string | null {
  const bare = /^\s*([A-Za-z_]\w*)\s*$/.exec(literal);
  if (bare) return bare[1] ?? null;
  const spread = /^\s*\{\s*\.\.\.([A-Za-z_]\w*)\s*,?\s*}\s*$/.exec(literal);
  if (spread) return spread[1] ?? null;
  return null;
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

/** Blank out comments while preserving every character position, so the
 * pattern scan never matches prose and line numbers stay accurate. */
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
