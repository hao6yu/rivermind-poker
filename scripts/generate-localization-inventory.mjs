#!/usr/bin/env node
/**
 * Phase 19 L1 — machine-readable localization inventory.
 *
 * Extracts every translatable English source surface from the actual tree and
 * writes docs/localization-inventory.json. Run it any time the English source
 * surface changes; during the Phase 19 translation window the committed file is
 * the frozen inventory referenced by the execution record.
 *
 *   node scripts/generate-localization-inventory.mjs
 *
 * Surfaces covered:
 *   - typed message catalogs (inline base + every phase module);
 *   - learning content (lessons, trainers, cheat sheets) from domain/learning;
 *   - scenario template surface (factory count + copy fields);
 *   - AI-coach consent and account-deletion catalogs;
 *   - native/store declarations from app.json.
 *
 * Every count in the Phase 19 execution record is derived from this script's
 * output, never estimated.
 */

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

// ---------------------------------------------------------------------------
// CLI contract (review remediation #9) — validated BEFORE any filesystem work
// so a typo can never overwrite a frozen inventory or silently freeze the
// wrong commit.
//
//   node scripts/generate-localization-inventory.mjs --phase 19   [--commit <sha>]
//   node scripts/generate-localization-inventory.mjs --phase 19.5 [--commit <sha>]
//
//   --phase       required: "19" (es-419/pt-BR window) or "19.5" (ja window);
//                 anything else — including a missing value or a typo — exits
//                 with code 2 before touching the disk.
//   --commit      optional explicit source-freeze commit (short or full sha).
//                 When omitted, the CURRENT HEAD is used and the inventory
//                 records `sourceFreezeCommitSource: "HEAD"` so downstream
//                 readers can tell a pinned freeze from an ambient one.
//   --force       required to overwrite an existing FROZEN inventory that was
//                 generated with an explicit --commit (ambient-HEAD outputs
//                 are working artifacts and may be overwritten freely).
//   --root        optional repository root override (review remediation: tests
//                 generate against throwaway repository fixtures so tracked
//                 artifacts are never written or observed mid-write).
// ---------------------------------------------------------------------------

const SUPPORTED_PHASES = ['19', '19.5'];

// CLI parsing (round 2, finding #10): validated before any filesystem
// mutation. The tmpRoot setup below runs only after the CLI contract passes.
const cliArgs = process.argv.slice(2);
let cliRoot;
{
  const phaseFlagIdx = cliArgs.indexOf('--phase');
  const commitFlagIdx = cliArgs.indexOf('--commit');
  const rootFlagIdx = cliArgs.indexOf('--root');
  const phaseVal = phaseFlagIdx !== -1 ? cliArgs[phaseFlagIdx + 1] : undefined;
  const commitVal = commitFlagIdx !== -1 ? cliArgs[commitFlagIdx + 1] : undefined;
  const rootVal = rootFlagIdx !== -1 ? cliArgs[rootFlagIdx + 1] : undefined;
  const SUPPORTED = ['19', '19.5'];
  const fail = (msg) => {
    console.error(`CLI error: ${msg}`);
    console.error(`Usage: node scripts/generate-localization-inventory.mjs --phase <${SUPPORTED.join('|')}> [--commit <sha>] [--force] [--root <dir>]`);
    process.exit(2);
  };
  if (phaseFlagIdx === -1) fail('--phase is required.');
  if (phaseVal === undefined || phaseVal.startsWith('--')) fail('--phase requires a value.');
  if (!SUPPORTED.includes(phaseVal)) fail(`unsupported phase "${phaseVal}". Supported: ${SUPPORTED.join(', ')}.`);
  if (commitFlagIdx !== -1 && (commitVal === undefined || commitVal.startsWith('--'))) fail('--commit requires a commit sha value.');
  if (rootFlagIdx !== -1 && (rootVal === undefined || rootVal.startsWith('--'))) fail('--root requires a directory value.');
  // Arity-aware parser (round 3, finding #6): each flag declares whether it
  // consumes a value; unknown tokens are rejected regardless of position.
  const FLAG_ARITY = { '--phase': 1, '--commit': 1, '--force': 0, '--root': 1 };
  {
    let i = 0;
    const seen = new Set();
    while (i < cliArgs.length) {
      const arg = cliArgs[i];
      const arity = FLAG_ARITY[arg];
      if (arity === undefined) fail(`unknown argument: ${arg}`);
      if (seen.has(arg)) fail(`duplicate argument: ${arg}`);
      seen.add(arg);
      if (arity === 0) { i += 1; continue; }
      // Value-consuming flag: the next token is its value.
      const value = cliArgs[i + 1];
      if (value === undefined || FLAG_ARITY[value] !== undefined) {
        fail(`${arg} requires a value.`);
      }
      i += 2;
    }
  }
  if (rootVal !== undefined) {
    cliRoot = path.resolve(rootVal);
    if (!fs.existsSync(cliRoot) || !fs.statSync(cliRoot).isDirectory()) {
      fail(`--root must be an existing directory; got "${rootVal}".`);
    }
  }
}

// Review remediation (inventory tests must not mutate tracked artifacts): a
// temporary repository fixture can redirect every read and write of this
// script (src/, docs/, tmp/, app.json, git provenance) away from the real
// checkout by passing --root.
const projectRoot = cliRoot ?? path.resolve(new URL('..', import.meta.url).pathname);

const srcRoot = path.join(projectRoot, 'src');
const docsRoot = path.join(projectRoot, 'docs');
const tmpRoot = path.join(projectRoot, '.claude', 'tmp', 'localization-inventory');

fs.rmSync(tmpRoot, { recursive: true, force: true });
fs.mkdirSync(tmpRoot, { recursive: true });

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/** Feature owner for one message key, from its stable prefix. */
function featureOwner(key) {
  if (key.startsWith('language.')) return 'settings/language-picker';
  if (key.startsWith('character.') || key.startsWith('persona.')) return 'multiway-ai-identities';
  if (key.startsWith('activity.')) return 'learn-catalog';
  if (key.startsWith('multiplayer.')) return 'private-tables';
  if (key.startsWith('multiway.')) return 'multiway-tables';
  if (key.startsWith('championship.')) return 'championship';
  if (key.startsWith('coach.')) return 'ai-coach';
  if (key.startsWith('consent.')) return 'ai-consent';
  if (key.startsWith('beta.')) return 'beta-insights';
  if (key.startsWith('guided.')) return 'guided-setup';
  if (key.startsWith('history.') || key.startsWith('replay.')) return 'history-replay';
  if (key.startsWith('learn.') || key.startsWith('lesson.') || key.startsWith('quiz.')
    || key.startsWith('trainer.') || key.startsWith('mission.') || key.startsWith('sheet.')
    || key.startsWith('range.') || key.startsWith('concept.')) return 'learn';
  if (key.startsWith('summary.') || key.startsWith('session.')) return 'session-results';
  if (key.startsWith('scenario.')) return 'scenario-training';
  if (key.startsWith('table.') || key.startsWith('poker.') || key.startsWith('decision.')) return 'table';
  if (key.startsWith('settings.') || key.startsWith('profile.')) return 'settings-profile';
  if (key.startsWith('setup.')) return 'table-setup';
  if (key.startsWith('feedback.')) return 'feedback';
  if (key.startsWith('progress.')) return 'progress';
  if (key.startsWith('difficulty.') || key.startsWith('pace.')) return 'ai-difficulty';
  if (key.startsWith('home.') || key.startsWith('caption.')) return 'home';
  if (key.startsWith('play.')) return 'play-hub';
  if (key.startsWith('tournament.')) return 'sit-and-go';
  if (key.startsWith('onboarding.') || key.startsWith('welcome.')) return 'onboarding';
  if (key.startsWith('guide.')) return 'learn-reference-guide';
  if (key.startsWith('sizing.')) return 'table-setup';
  if (key.startsWith('alert.')) return 'table';
  if (key.startsWith('orientation.')) return 'table';
  if (key.startsWith('roster.')) return 'multiway-tables';
  if (key.startsWith('stats.') || key.startsWith('opponentRead.') || key.startsWith('opponentTendencies.')) return 'progress';
  if (key.startsWith('learning.')) return 'learn';
  if (key.startsWith('card.')) return 'table';
  return key.split('.')[0];
}

/**
 * Compact-layout risk: strings a player reads inside table controls, seat
 * plaques, chip rows, and tab labels where Spanish/Portuguese typically runs
 * 20–35% longer than English. Flag by known compact prefixes and short-value
 * heuristics (short strings live in tight controls; they need device review).
 */
const COMPACT_PREFIXES = [
  'poker.', 'table.', 'multiway.action', 'multiway.seat', 'guide.', 'tabs.',
  'common.', 'caption.', 'tournament.', 'championship.stage', 'difficulty.',
  'persona.', 'range.',
];
function compactRisk(key, value) {
  if (COMPACT_PREFIXES.some((prefix) => key.startsWith(prefix))) return true;
  return value.length <= 16;
}

/**
 * Intentionally language-neutral poker notation and product names, per the
 * scope: card notation, BB/SPR/EV/ICM/3-bet/4-bet shorthand, stable protocol
 * strings, language self-names, and numeric-only labels. Seeded from the
 * reviewed shared-value allowlist in catalogParity.test.ts and documented in
 * the style guides.
 */
const LANGUAGE_NEUTRAL_KEYS = new Set([
  'language.en',
  'language.zhHans',
  'language.zhHant',
  'multiway.practiceLevel',
  'championship.lineupTier',
  'guided.calibration.calibration-pot-odds.choice.20-percent',
  'guided.calibration.calibration-pot-odds.choice.25-percent',
  'guided.calibration.calibration-pot-odds.choice.33-percent',
  'guided.calibration.calibration-bluff-threshold.choice.25-percent',
  'guided.calibration.calibration-bluff-threshold.choice.50-percent',
  'multiplayer.option.chips',
  'multiplayer.join.placeholder',
  'multiplayer.lobby.ai',
]);

/** Screenshot route for the device matrix, per feature owner. */
const ROUTE_BY_OWNER = {
  'settings/language-picker': 'Profile → Language',
  'multiway-ai-identities': 'Play → Multiway table',
  'learn-catalog': 'Learn',
  'private-tables': 'Play → Private table',
  'multiway-tables': 'Play → Multiway table',
  championship: 'Championship',
  'ai-coach': 'Table → Coach review',
  'ai-consent': 'AI consent sheet',
  'beta-insights': 'Profile → Beta insights',
  'guided-setup': 'Onboarding → Guided setup',
  'history-replay': 'History → Replay',
  learn: 'Learn',
  'session-results': 'Table → Session results',
  'scenario-training': 'Play → Scenario training',
  table: 'Table',
  'settings-profile': 'Profile',
  'table-setup': 'Play → Custom table',
  feedback: 'Profile → Feedback',
  progress: 'Progress',
  'ai-difficulty': 'Play → Difficulty',
  home: 'Home',
  'play-hub': 'Play',
  'sit-and-go': 'Play → Sit & Go',
  onboarding: 'Onboarding',
  'learn-reference-guide': 'Learn → Table guide',
};

function placeholders(value) {
  return [...value.matchAll(PLACEHOLDER)].map((match) => match[1]).sort();
}

// ---------------------------------------------------------------------------
// 1. Message catalogs — evaluated from the plain object literals.
// ---------------------------------------------------------------------------

function extractObjectLiteral(source, exportName) {
  // Accept both `export const` and module-private `const` declarations (the
  // base English literal is deliberately unexported).
  let start = source.indexOf(`export const ${exportName} = {`);
  if (start === -1) start = source.indexOf(`const ${exportName} = {`);
  const startMarkerLength = start === -1 ? 0 : source.slice(start).indexOf(' = {') + ' = {'.length;
  const bodyStart = start === -1 ? -1 : start + startMarkerLength - 1;
  if (bodyStart === -1) throw new Error(`Cannot find ${exportName}`);
  let depth = 0;
  let inString = null;
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === inString) inString = null;
      continue;
    }
    if (char === '\'' || char === '"' || char === '`') { inString = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart, index + 1);
    }
  }
  throw new Error(`Unterminated object literal for ${exportName}`);
}

async function evaluateCatalogModule(files) {
  const parts = [];
  const exportNames = [];
  for (const [file, exportName] of files) {
    const source = fs.readFileSync(path.join(srcRoot, 'localization', file), 'utf8');
    const literal = extractObjectLiteral(source, exportName);
    parts.push(`const ${exportName} = ${literal};`);
    exportNames.push(exportName);
  }
  const module = `${parts.join('\n\n')}\n\nexport { ${exportNames.join(', ')} };\n`;
  const target = path.join(tmpRoot, 'catalogs.mjs');
  fs.writeFileSync(target, module);
  return import(`${target}?t=${Date.now()}`);
}

const catalogModule = await evaluateCatalogModule([
  // Phase catalogs first: the base englishMessages literal spreads them.
  ['phase7Messages.ts', 'phase7EnglishMessages'],
  ['phase8Messages.ts', 'phase8EnglishMessages'],
  ['phase9Messages.ts', 'phase9EnglishMessages'],
  ['phase12Messages.ts', 'phase12EnglishMessages'],
  ['phase14Messages.ts', 'phase14EnglishMessages'],
  ['phase16Messages.ts', 'phase16EnglishMessages'],
  // Phase 19 composed `englishMessages` from spreads, so the inline base
  // literal is extracted under its internal name and the composed surface is
  // rebuilt below exactly the way messages.ts composes it.
  ['messages.ts', 'baseEnglishMessagesInternal'],
  ['accountDeletionMessages.ts', 'accountDeletionEnglishMessages'],
]);
// The composed English surface, rebuilt exactly the way messages.ts composes
// it (module namespaces are frozen, so this lives in its own object).
const englishMessages = {
  ...catalogModule.baseEnglishMessagesInternal,
  ...catalogModule.phase7EnglishMessages,
  ...catalogModule.phase8EnglishMessages,
  ...catalogModule.phase9EnglishMessages,
  ...catalogModule.phase12EnglishMessages,
  ...catalogModule.phase14EnglishMessages,
  ...catalogModule.phase16EnglishMessages,
};

// AI-coach consent copy is a nested per-language record; count its fields and
// list items from the English block directly.
const consentSource = fs.readFileSync(path.join(srcRoot, 'localization', 'aiCoachConsentMessages.ts'), 'utf8');
const consentEnMatch = consentSource.match(/  en: \{([\s\S]*?)\n  \},/);
if (!consentEnMatch) throw new Error('Cannot extract AI-coach consent English copy');
const consentEnglishBody = consentEnMatch[1];
const consentFields = [...consentEnglishBody.matchAll(/^    (\w+):/gm)].map((match) => match[1]);
const consentSentItems = [...consentEnglishBody.matchAll(/^      '/gm)].length;

// ---------------------------------------------------------------------------
// 2. Learning content + scenarios — transpiled and imported.
// ---------------------------------------------------------------------------

function transpileModule(relPath) {
  const source = fs.readFileSync(path.join(srcRoot, relPath), 'utf8');
  const moduleDir = path.dirname(relPath);
  const rewritten = source.replace(
    /from '(\.[^']+)'/g,
    (match, specifier) => {
      const resolved = path.posix.normalize(path.posix.join(moduleDir, specifier));
      const flatName = `${resolved.replaceAll('/', '_').replace(/\.ts$/, '')}.mjs`;
      return `from './${flatName}'`;
    },
  );
  const result = ts.transpileModule(rewritten, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const targetName = relPath.replaceAll('/', '_').replace(/\.ts$/, '.mjs');
  const target = path.join(tmpRoot, targetName);
  fs.writeFileSync(target, result.outputText);
  return target;
}

const learningFiles = [
  'domain/learning/types.ts',
  'domain/poker/types.ts',
  'domain/learning/phase7Scenarios.ts',
  'domain/learning/practicePacks.ts',
  'domain/learning/scenarios.ts',
  'domain/learning/phase7Content.ts',
  'domain/learning/content.ts',
];
for (const relPath of learningFiles) transpileModule(relPath);
const contentModule = await import(`${path.join(tmpRoot, 'domain_learning_content.mjs')}?t=${Date.now()}`);
const scenariosModule = await import(`${path.join(tmpRoot, 'domain_learning_scenarios.mjs')}?t=${Date.now()}`);

// ---------------------------------------------------------------------------
// 3. Assemble the inventory.
// ---------------------------------------------------------------------------

const baseEnglish = englishMessages;
const phaseFiles = [
  ['phase7Messages.ts', 'phase7EnglishMessages'],
  ['phase8Messages.ts', 'phase8EnglishMessages'],
  ['phase9Messages.ts', 'phase9EnglishMessages'],
  ['phase12Messages.ts', 'phase12EnglishMessages'],
  ['phase14Messages.ts', 'phase14EnglishMessages'],
  ['phase16Messages.ts', 'phase16EnglishMessages'],
];

function messageEntry(key, value, source) {
  return {
    key,
    source,
    value,
    placeholders: placeholders(value),
    owner: featureOwner(key),
    compactRisk: compactRisk(key, value),
    languageNeutral: LANGUAGE_NEUTRAL_KEYS.has(key),
    screenshotRoute: ROUTE_BY_OWNER[featureOwner(key)] ?? 'Onboarding',
  };
}

// The resolved englishMessages catalog is authoritative (later phase spreads
// override earlier ones). Source attribution asks each phase file first; keys
// not owned by a phase file are inline base keys in messages.ts.
const phaseOwnership = new Map();
for (const [file, exportName] of phaseFiles) {
  for (const key of Object.keys(catalogModule[exportName])) {
    if (!phaseOwnership.has(key)) phaseOwnership.set(key, file);
  }
}
const messageEntries = Object.entries(englishMessages).map(([key, value]) => messageEntry(
  key,
  value,
  phaseOwnership.get(key) ?? 'messages.ts (base)',
));

const uniqueKeys = new Set(messageEntries.map((e) => e.key));
const inlineBaseKeys = messageEntries.filter((e) => e.source === 'messages.ts (base)').length;

function lessonStrings(lesson) {
  let count = 2; // title + description
  for (const section of lesson.sections) {
    count += 2; // heading + body
    count += section.takeaway ? 1 : 0;
    count += section.bullets ? section.bullets.length : 0;
    count += section.example ? 2 : 0;
  }
  return count;
}

function trainerStrings(trainer) {
  let count = 2;
  for (const question of trainer.questions) {
    count += 3; // prompt + context + explanation
    count += question.choices.length * 2; // label + feedback
  }
  return count;
}

function sheetStrings(sheet) {
  let count = 2 + (sheet.note ? 1 : 0);
  for (const group of sheet.groups) {
    count += 1 + group.rows.length * 2;
  }
  return count;
}

// `contentModule.lessons` is the aggregate of every content.ts lesson group
// (including the phase7 groups it re-exports), so it is the authoritative list.
const lessonsAll = contentModule.lessons;
const trainersAll = contentModule.trainers;
const sheetsAll = contentModule.cheatSheets;

const learningStrings = lessonsAll.reduce((sum, l) => sum + lessonStrings(l), 0)
  + trainersAll.reduce((sum, t) => sum + trainerStrings(t), 0)
  + sheetsAll.reduce((sum, s) => sum + sheetStrings(s), 0);

const appConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8')).expo;
const localizationPlugin = appConfig.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-localization',
);
const declaredNativeLocales = localizationPlugin?.[1]?.supportedLocales ?? null;

// CLI parsing moved to the top of the file (round 2, finding #10).

// Derive phaseArgs from the CLI args parsed at the top.
const phaseFlagIdx2 = cliArgs.indexOf('--phase');
const commitFlagIdx2 = cliArgs.indexOf('--commit');
const phaseArgs = {
  phase: cliArgs[phaseFlagIdx2 + 1],
  commit: commitFlagIdx2 !== -1 ? cliArgs[commitFlagIdx2 + 1] : undefined,
  force: cliArgs.includes('--force'),
};

/**
 * Reproducible provenance (review remediation finding #7): a commit sha alone
 * does NOT describe what this generator read — it reads the working tree. The
 * inventory therefore records (a) the git state of that tree (HEAD plus how
 * many tracked files differ from it) and (b) SHA-256 hashes of every input
 * file the counts are derived from, so any later tree can be checked byte for
 * byte against the artifact.
 */
function trackedDirtyFileCount() {
  const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: projectRoot }).toString();
  return status.split('\n').filter((line) => line.trim().length > 0).length;
}

const INVENTORY_INPUT_FILES = [
  'app.json',
  'src/domain/learning/content.ts',
  'src/domain/learning/phase7Content.ts',
  'src/domain/learning/phase7Scenarios.ts',
  'src/domain/learning/practicePacks.ts',
  'src/domain/learning/scenarios.ts',
  'src/domain/learning/types.ts',
  'src/domain/poker/types.ts',
  'src/localization/accountDeletionMessages.ts',
  'src/localization/aiCoachConsentMessages.ts',
  'src/localization/messages.ts',
  'src/localization/phase12Messages.ts',
  'src/localization/phase14Messages.ts',
  'src/localization/phase16Messages.ts',
  'src/localization/phase7Messages.ts',
  'src/localization/phase8Messages.ts',
  'src/localization/phase9Messages.ts',
].sort();

function hashInventoryInputs() {
  const combined = createHash('sha256');
  const files = {};
  for (const relative of INVENTORY_INPUT_FILES) {
    const digest = createHash('sha256').update(fs.readFileSync(path.join(projectRoot, relative))).digest('hex');
    files[relative] = digest;
    combined.update(`${relative}\n${digest}\n`);
  }
  return {
    algorithm: 'sha256; combinedHash chains "<relpath>\\n<sha256>\\n" over the sorted relpaths',
    inputCount: INVENTORY_INPUT_FILES.length,
    combinedHash: combined.digest('hex'),
    files,
  };
}

// Freeze commit (review remediation #9): an explicit --commit is recorded as
// a pinned freeze; without it, HEAD is captured but the inventory says so, so
// downstream readers can tell a pinned freeze from an ambient one.
let freezeCommit = 'unavailable';
let freezeCommitSource = 'unavailable';
let sourceFreezeGitState = { gitAvailable: false };
if (phaseArgs.commit) {
  freezeCommit = phaseArgs.commit;
  freezeCommitSource = 'explicit';
} else {
  try {
    freezeCommit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: projectRoot }).toString().trim();
    freezeCommitSource = 'HEAD';
    const trackedDirtyFiles = trackedDirtyFileCount();
    sourceFreezeGitState = {
      gitAvailable: true,
      headCommit: freezeCommit,
      trackedDirtyFiles,
      dirty: trackedDirtyFiles > 0,
      untrackedFilesExcluded: true,
    };
  } catch {
    // Keep the inventory usable outside a git checkout.
    sourceFreezeGitState = { gitAvailable: false };
  }
}
// Verify an explicit commit actually exists before freezing it.
if (freezeCommitSource === 'explicit') {
  try {
    execFileSync('git', ['cat-file', '-e', `${freezeCommit}^{commit}`], { cwd: projectRoot });
  } catch {
    console.error(`CLI error: --commit ${freezeCommit} does not exist in this repository.`);
    process.exit(2);
  }
  // Provenance verification (round 2, finding #4): the generator reads the
  // CURRENT working tree. An explicit --commit is only honest when HEAD
  // matches the commit AND the tracked tree is clean.
  let head = '';
  try {
    head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot }).toString().trim();
  } catch {
    console.error('CLI error: --commit requires a git checkout.');
    process.exit(2);
  }
  const shortCommit = execFileSync('git', ['rev-parse', '--short', freezeCommit], { cwd: projectRoot }).toString().trim();
  if (head.slice(0, shortCommit.length) !== shortCommit) {
    console.error(
      `CLI error: --commit ${shortCommit} does not match HEAD (${head.slice(0, shortCommit.length)}). ` +
      'The generator reads the working tree; checkout the target commit or omit --commit.',
    );
    process.exit(2);
  }
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: projectRoot }).toString().trim();
  if (dirty) {
    console.error(
      'CLI error: --commit requires a clean tracked tree (the working tree has modifications). ' +
      'The generator reads the working tree; commit or stash changes, or omit --commit to record ambient-HEAD provenance.',
    );
    process.exit(2);
  }
  sourceFreezeGitState = {
    gitAvailable: true,
    headCommit: shortCommit,
    trackedDirtyFiles: 0,
    dirty: false,
    untrackedFilesExcluded: true,
  };
}

const sourceInputs = hashInventoryInputs();

// Frozen-overwrite guard (review remediation #9): a pinned freeze may not be
// silently replaced. Regenerating over it requires --force. Ambient-HEAD
// outputs are working artifacts and may be overwritten freely.
const outputFileName = phaseArgs.phase === '19.5' ? 'localization-inventory-ja.json' : 'localization-inventory.json';
const outputPath = path.join(docsRoot, outputFileName);
if (!phaseArgs.force && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    if (existing.sourceFreezeCommitSource === 'explicit') {
      console.error(
        `Refusing to overwrite the frozen inventory ${outputFileName} ` +
        `(frozen at ${existing.sourceFreezeCommit} with an explicit commit). ` +
        'Re-run with --force to replace it deliberately.',
      );
      process.exit(2);
    }
  } catch {
    // A malformed existing file is treated as unfrozen (overwrite allowed).
  }
}

// Provenance note (review remediation finding #7): the artifact only claims to
// represent a pinned/frozen tree when that is demonstrably true (explicit
// --commit on a clean tracked tree). A dirty working tree is named as such.
const provenanceNote = (() => {
  const regenerate = phaseArgs.phase === '19.5'
    ? 'Regenerate with node scripts/generate-localization-inventory.mjs --phase 19.5.'
    : 'Regenerate with node scripts/generate-localization-inventory.mjs --phase 19.';
  const windowLabel = phaseArgs.phase === '19.5'
    ? 'the Phase 19.5 Japanese translation window (ja)'
    : 'the Phase 19 translation window (es-419, pt-BR)';
  if (!sourceFreezeGitState.gitAvailable) {
    return `English source surface for ${windowLabel}, generated from repository sources outside a git checkout; provenance is reproducible through the per-file hashes in sourceInputs. ${regenerate}`;
  }
  if (freezeCommitSource === 'explicit') {
    return `English source surface for ${windowLabel}, frozen at pinned commit ${freezeCommit} with a clean tracked tree; provenance is reproducible through sourceInputs. ${regenerate}`;
  }
  if (sourceFreezeGitState.dirty) {
    return `English source surface for ${windowLabel}, generated from the working tree at HEAD ${sourceFreezeGitState.headCommit} with ${sourceFreezeGitState.trackedDirtyFiles} tracked file modifications — this is NOT a frozen merged-tree snapshot; provenance is reproducible through sourceFreezeGitState and sourceInputs. ${regenerate}`;
  }
  return `English source surface for ${windowLabel}, generated from the working tree at HEAD ${sourceFreezeGitState.headCommit} with a clean tracked tree; provenance is reproducible through sourceFreezeGitState and sourceInputs. ${regenerate}`;
})();

const inventory = {
  generatedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  sourceFreezeCommit: freezeCommit,
  sourceFreezeCommitSource: freezeCommitSource,
  sourceFreezeGitState,
  sourceInputs,
  phase: phaseArgs.phase,
  note: provenanceNote,
  shippedLocales: ['en', 'zh-Hans', 'zh-Hant'],
  expansionLocales: phaseArgs.phase === '19.5' ? ['ja (Phase 19.5)'] : ['es-419', 'pt-BR'],
  deferredLocales: phaseArgs.phase === '19.5' ? ['es-419', 'pt-BR (Phase 19 drafts)', 'es-ES', 'pt-PT', 'ko', 'fr', 'de'] : ['ja (Phase 19.5)', 'es-ES', 'pt-PT', 'ko', 'fr', 'de'],
  messages: {
    inlineBaseKeys,
    phaseKeys: Object.fromEntries(phaseFiles.map(([file, exportName]) => [file, Object.keys(catalogModule[exportName]).length])),
    totalUniqueKeys: uniqueKeys.size,
    compactRiskKeys: messageEntries.filter((e) => e.compactRisk).length,
    languageNeutralKeys: messageEntries.filter((e) => e.languageNeutral).length,
    entries: messageEntries,
  },
  learningContent: {
    lessonCount: lessonsAll.length,
    lessons: lessonsAll.map((lesson) => ({
      id: lesson.id,
      owner: 'learn-lessons',
      sections: lesson.sections.length,
      translatableStrings: lessonStrings(lesson),
      screenshotRoute: 'Learn → Lesson',
    })),
    trainerCount: trainersAll.length,
    trainers: trainersAll.map((trainer) => ({
      id: trainer.id,
      owner: 'learn-trainers',
      questions: trainer.questions.length,
      choices: trainer.questions.reduce((sum, q) => sum + q.choices.length, 0),
      translatableStrings: trainerStrings(trainer),
      screenshotRoute: 'Learn → Practice',
    })),
    cheatSheetCount: sheetsAll.length,
    cheatSheets: sheetsAll.map((sheet) => ({
      id: sheet.id,
      owner: 'learn-reference',
      groups: sheet.groups.length,
      translatableStrings: sheetStrings(sheet),
      screenshotRoute: 'Learn → Reference',
    })),
    translatableStrings: learningStrings,
  },
  scenarios: {
    templateFactories: scenariosModule.scenarioTemplateCount,
    copyFieldsPerTemplate: ['focus', 'opponentAction', 'prompt', 'reasoning', 'takeaway', 'choiceLabels', 'choiceFeedback', 'mathSummary'],
    generatedSurface: 'Six-spot sessions render from template factories; localized through scenarioContent.ts catalogs (position labels, action labels, per-template copy, per-choice feedback, math summaries).',
    screenshotRoute: 'Play → Scenario training',
  },
  separateCatalogs: {
    aiCoachConsent: {
      owner: 'ai-consent',
      fieldsPerLanguage: consentFields,
      sentItemsPerLanguage: consentSentItems,
      screenshotRoute: 'AI consent sheet',
    },
    accountDeletion: {
      owner: 'account-deletion',
      keysPerLanguage: Object.keys(catalogModule.accountDeletionEnglishMessages).length,
      keys: Object.keys(catalogModule.accountDeletionEnglishMessages),
      screenshotRoute: 'Profile → Delete account',
    },
    characterTitles: {
      owner: 'multiway-ai-identities',
      count: 12,
      note: 'Titles are per-language jokes, rewritten (not transliterated) per locale.',
      screenshotRoute: 'Play → Multiway table',
    },
  },
  nativeAndStore: {
    appJsonSupportedLocales: declaredNativeLocales,
    storeLocales: {
      googlePlay: ['en-US', 'zh-CN', 'zh-TW'],
      appStore: ['en-US', 'zh-Hans', 'zh-Hant'],
    },
    plannedStoreLocales: phaseArgs.phase === '19.5'
      ? {
          googlePlay: ['ja-JP'],
          // App Store Connect metadata locale for Japanese is `ja` — the exact
          // identifier encoded in the registry storeLocales mapping.
          appStore: ['ja'],
        }
      : {
          googlePlay: ['es-419', 'pt-BR'],
          // App Store Connect metadata locale for Latin American Spanish is
          // Spanish (Mexico), per scope §L4 and Apple's locale reference.
          appStore: ['es-MX (primary Latin American metadata)', 'pt-BR'],
        },
    screenshotRoute: 'Store listings (not in-app)',
  },
  totals: {
    messageKeys: uniqueKeys.size,
    learningStrings,
    scenarioTemplates: scenariosModule.scenarioTemplateCount,
  },
};

const target = outputPath;
fs.mkdirSync(docsRoot, { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(inventory, null, 2)}\n`);

console.log(`Localization inventory written to ${path.relative(projectRoot, target)}`);
console.log(`  message keys:          ${inventory.totals.messageKeys}`);
console.log(`  learning strings:      ${inventory.totals.learningStrings}`);
console.log(`  scenario templates:    ${inventory.totals.scenarioTemplates}`);
console.log(`  compact-risk keys:     ${inventory.messages.compactRiskKeys}`);
console.log(`  language-neutral keys: ${inventory.messages.languageNeutralKeys}`);
console.log(`  lessons / trainers / sheets: ${inventory.learningContent.lessonCount} / ${inventory.learningContent.trainerCount} / ${inventory.learningContent.cheatSheetCount}`);
