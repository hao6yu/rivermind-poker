#!/usr/bin/env node
/**
 * Phase 19 L4/L5 — locale catalog sync.
 *
 * Validates the tracked translation memory (JSON slices under
 * translation-memory/<locale>/, committed next to the generator so a clean
 * checkout can validate and regenerate the catalogs) against the frozen
 * English source, then generates the typed catalog modules:
 *
 *   src/localization/es419/messages.ts         (base + phase maps, exact key sets)
 *   src/localization/es419/phaseMessages.ts
 *   src/localization/es419/learningContent.ts  (LearningContentCatalog)
 *   src/localization/es419/scenarioContent.ts  (per-template copy + feedback)
 *
 * Validation (fails loudly before any file is written):
 *   - exact key coverage vs the English surface (no missing, no extra);
 *   - exact placeholder-name parity per key;
 *   - no blank strings;
 *   - no value identical to English outside the documented allowlist;
 *   - learning content: same lesson/section/question/choice counts and ids;
 *   - scenario content: same template ids and choice ids as the source.
 *
 *   node scripts/sync-locale-catalog.mjs --locale es-419
 */

import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import ts from 'typescript';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const srcRoot = path.join(projectRoot, 'src');
// Committed translation memory: the authoritative, tracked inputs (the
// extractor's throwaway working slices for untranslated surfaces stay under
// the gitignored .claude/tmp/translation).
const memoryRoot = path.join(projectRoot, 'translation-memory');

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

const args = process.argv.slice(2);
const localeIndex = args.indexOf('--locale');
if (localeIndex === -1 || !args[localeIndex + 1]) throw new Error('Usage: sync-locale-catalog.mjs --locale <es-419|pt-BR>');
const locale = args[localeIndex + 1];
if (locale !== 'es-419' && locale !== 'pt-BR') throw new Error(`Unsupported locale ${locale}`);

const config = locale === 'es-419'
  ? {
      dir: 'es419',
      baseName: 'baseSpanishMessages',
      phasePrefix: 'phase7SpanishMessages',
      learningName: 'spanishLearningContent',
      scenarioName: 'spanishScenarioContent',
      draftLine: '// DRAFT: awaiting qualified native es-419 poker-language review.',
    }
  : {
      dir: 'ptbr',
      baseName: 'basePortugueseMessages',
      phasePrefix: 'phase7PortugueseMessages',
      learningName: 'portugueseLearningContent',
      scenarioName: 'portugueseScenarioContent',
      draftLine: '// DRAFT: awaiting qualified native pt-BR poker-language review.',
    };

// ---------------------------------------------------------------------------
// Load the English reference surfaces (same evaluation technique as the
// inventory generator).
// ---------------------------------------------------------------------------

function extractObjectLiteral(source, exportName) {
  const startMarker = `const ${exportName} = {`;
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`Cannot find ${exportName}`);
  const bodyStart = start + startMarker.length - 1;
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
  const target = path.join(memoryRoot, `reference-${Date.now()}.mjs`);
  fs.writeFileSync(target, `${parts.join('\n\n')}\n\nexport { ${exportNames.join(', ')} };\n`);
  try {
    return await import(`${target}?t=${Date.now()}`);
  } finally {
    fs.rmSync(target, { force: true });
  }
}

const reference = await evaluateCatalogModule([
  ['phase7Messages.ts', 'phase7EnglishMessages'],
  ['phase8Messages.ts', 'phase8EnglishMessages'],
  ['phase9Messages.ts', 'phase9EnglishMessages'],
  ['phase12Messages.ts', 'phase12EnglishMessages'],
  ['phase14Messages.ts', 'phase14EnglishMessages'],
  ['phase16Messages.ts', 'phase16EnglishMessages'],
  ['messages.ts', 'baseEnglishMessagesInternal'],
]);

const baseEnglish = reference.baseEnglishMessagesInternal;
const phaseEnglish = {
  phase7: reference.phase7EnglishMessages,
  phase8: reference.phase8EnglishMessages,
  phase9: reference.phase9EnglishMessages,
  phase12: reference.phase12EnglishMessages,
  phase14: reference.phase14EnglishMessages,
  phase16: reference.phase16EnglishMessages,
};

/**
 * Values that intentionally match English: language self-names, protocol-stable
 * strings, numeric-only labels, and product names (documented in
 * catalogParity.test.ts and the style guides).
 */
const SHARED_VALUE_ALLOWLIST = new Set([
  'language.en',
  'language.zhHans',
  'language.zhHant',
  `language.${locale === 'es-419' ? 'es419' : 'ptBr'}`,
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
if (locale === 'pt-BR') {
  // The unit name "big blind/big blinds" is the established Brazilian term and
  // is identical to English by glossary decision (style guide §4–§5).
  SHARED_VALUE_ALLOWLIST.add('common.bigBlinds');
}

function placeholders(value) {
  return [...value.matchAll(PLACEHOLDER)].map((match) => match[1]).sort();
}

function validateTranslations(english, translated, label) {
  const errors = [];
  const englishKeys = Object.keys(english);
  const translatedKeys = Object.keys(translated);
  for (const key of englishKeys) {
    if (!(key in translated)) { errors.push(`${label}: missing key ${key}`); continue; }
    const value = translated[key];
    if (typeof value !== 'string' || value.trim().length === 0) errors.push(`${label}: blank value for ${key}`);
    const expected = placeholders(english[key]);
    const actual = placeholders(value);
    if (expected.join(',') !== actual.join(',')) {
      errors.push(`${label}: placeholder mismatch for ${key} (expected [${expected}], got [${actual}])`);
    }
    if (value === english[key] && !SHARED_VALUE_ALLOWLIST.has(key)) {
      errors.push(`${label}: value identical to English for ${key}`);
    }
  }
  for (const key of translatedKeys) {
    if (!(key in english)) errors.push(`${label}: unknown key ${key}`);
  }
  return errors;
}

function readJson(relative) {
  const target = path.join(memoryRoot, locale, relative);
  if (!fs.existsSync(target)) throw new Error(`Missing translation output: ${path.relative(projectRoot, target)}`);
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function writeGenerated(relative, content) {
  const target = path.join(srcRoot, 'localization', config.dir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  console.log(`  wrote ${path.relative(projectRoot, target)}`);
}

function serializeObject(entries, indent = '  ') {
  return entries
    .map(([key, value]) => `${indent}${JSON.stringify(key)}: ${JSON.stringify(value)},`)
    .join('\n');
}

// ---------------------------------------------------------------------------
// 1. Messages (base + phases)
// ---------------------------------------------------------------------------

const baseSlices = fs.existsSync(path.join(memoryRoot, locale))
  ? fs.readdirSync(path.join(memoryRoot, locale)).filter((name) => name.startsWith('base-') && name.endsWith('.json'))
  : [];
if (baseSlices.length === 0) throw new Error(`No base-* slices found for ${locale}`);

const baseMerged = {};
for (const name of baseSlices.sort()) {
  Object.assign(baseMerged, readJson(name));
}
const baseErrors = validateTranslations(baseEnglish, baseMerged, `base[${locale}]`);

const phaseNames = Object.keys(phaseEnglish);
const phaseMaps = {};
const phaseErrors = [];
for (const phase of phaseNames) {
  const translated = readJson(`phase${phase.replace('phase', '')}.json`);
  phaseMaps[phase] = translated;
  phaseErrors.push(...validateTranslations(phaseEnglish[phase], translated, `${phase}[${locale}]`));
}

const allErrors = [...baseErrors, ...phaseErrors];
if (allErrors.length > 0) {
  console.error(`Validation failed for ${locale}:`);
  for (const error of allErrors.slice(0, 40)) console.error(`  - ${error}`);
  if (allErrors.length > 40) console.error(`  ... and ${allErrors.length - 40} more`);
  process.exit(1);
}

const phaseFile = `// GENERATED by scripts/sync-locale-catalog.mjs from the JSON translation
// memory under translation-memory/${locale}/. Edit the JSON sources and
// re-run the sync script; hand edits here will be overwritten.
${config.draftLine}
import type { baseEnglishMessages, phase7EnglishMessages, phase8EnglishMessages, phase9EnglishMessages, phase12EnglishMessages, phase14EnglishMessages, phase16EnglishMessages } from '../messages';

export const ${config.baseName}: Record<keyof typeof baseEnglishMessages, string> = {
${serializeObject(Object.entries(baseMerged))}
};
`;

const phaseParts = phaseNames.map((phase) => {
  const exportName = `${phase}SpanishMessages`.replace('Spanish', locale === 'es-419' ? 'Spanish' : 'Portuguese');
  return {
    exportName,
    body: `export const ${exportName}: Record<keyof typeof ${phase}EnglishMessages, string> = {
${serializeObject(Object.entries(phaseMaps[phase]))}
};`,
  };
});

const phaseFileContent = `// GENERATED by scripts/sync-locale-catalog.mjs from the JSON translation
// memory under translation-memory/${locale}/. Edit the JSON sources and
// re-run the sync script; hand edits here will be overwritten.
${config.draftLine}
import type { phase7EnglishMessages } from '../phase7Messages';
import type { phase8EnglishMessages } from '../phase8Messages';
import type { phase9EnglishMessages } from '../phase9Messages';
import type { phase12EnglishMessages } from '../phase12Messages';
import type { phase14EnglishMessages } from '../phase14Messages';
import type { phase16EnglishMessages } from '../phase16Messages';

${phaseParts.map((part) => part.body).join('\n\n')}
`;

writeGenerated('messages.ts', phaseFile.replace("import type { baseEnglishMessages, phase7EnglishMessages, phase8EnglishMessages, phase9EnglishMessages, phase12EnglishMessages, phase14EnglishMessages, phase16EnglishMessages } from '../messages';", "import type { baseEnglishMessages } from '../messages';"));
writeGenerated('phaseMessages.ts', phaseFileContent);

console.log(`Messages validated for ${locale}: base ${Object.keys(baseMerged).length} keys, phases ${phaseNames.map((p) => `${p} ${Object.keys(phaseMaps[p]).length}`).join(', ')}`);

// ---------------------------------------------------------------------------
// 2. Learning content (lessons, trainers, cheat sheets)
// ---------------------------------------------------------------------------

// The transpiled learning-content cache lives in the OS temp dir so the
// tracked translation memory never holds build artifacts.
const tmpLearning = fs.mkdtempSync(path.join(tmpdir(), 'rivermind-locale-sync-'));

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
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const targetName = relPath.replaceAll('/', '_').replace(/\.ts$/, '.mjs');
  fs.writeFileSync(path.join(tmpLearning, targetName), result.outputText);
}

for (const relPath of [
  'domain/learning/types.ts',
  'domain/poker/types.ts',
  'domain/learning/phase7Scenarios.ts',
  'domain/learning/practicePacks.ts',
  'domain/learning/scenarios.ts',
  'domain/learning/phase7Content.ts',
  'domain/learning/content.ts',
]) transpileModule(relPath);
const contentModule = await import(`${path.join(tmpLearning, 'domain_learning_content.mjs')}?t=${Date.now()}`);

/**
 * Values with no Latin letters (card notation, numbers, symbols) may stay
 * identical to the English source; anything with words must be translated.
 */
function isLanguageNeutral(value) {
  return !/[A-Za-z]/.test(value);
}

function requireTranslated(label, english, value, errors) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${label}: blank or missing value`);
    return;
  }
  if (value === english && !isLanguageNeutral(english)) {
    errors.push(`${label}: value identical to English`);
  }
}

function learningErrorList(errors, kind) {
  if (errors.length === 0) return;
  console.error(`Learning content validation failed for ${locale} (${kind}):`);
  for (const error of errors.slice(0, 40)) console.error(`  - ${error}`);
  if (errors.length > 40) console.error(`  ... and ${errors.length - 40} more`);
  process.exit(1);
}

// Lessons: two index-aligned slice files, merged by lesson id.
const lessonsCatalog = {};
{
  const errors = [];
  const englishById = new Map(contentModule.lessons.map((lesson) => [lesson.id, lesson]));
  const seen = new Set();
  for (const name of ['lessons-1.json', 'lessons-2.json']) {
    for (const lesson of readJson(name)) {
      const source = englishById.get(lesson.id);
      if (!source) { errors.push(`${lesson.id}: unknown lesson id`); continue; }
      if (seen.has(lesson.id)) errors.push(`${lesson.id}: duplicate lesson entry`);
      seen.add(lesson.id);
      if ((lesson.sections ?? []).length !== source.sections.length) {
        errors.push(`${lesson.id}: section count mismatch`);
        continue;
      }
      lessonsCatalog[lesson.id] = { sections: [] };
      source.sections.forEach((section, index) => {
        const translated = lesson.sections[index];
        const copy = { heading: translated.heading ?? '', body: translated.body ?? '' };
        requireTranslated(`${lesson.id} section[${index}].heading`, section.heading, copy.heading, errors);
        requireTranslated(`${lesson.id} section[${index}].body`, section.body, copy.body, errors);
        if (section.bullets) {
          if ((translated.bullets ?? []).length !== section.bullets.length) {
            errors.push(`${lesson.id} section[${index}]: bullets count mismatch`);
          } else {
            copy.bullets = translated.bullets;
            section.bullets.forEach((bullet, bulletIndex) => requireTranslated(
              `${lesson.id} section[${index}].bullets[${bulletIndex}]`, bullet, copy.bullets[bulletIndex], errors,
            ));
          }
        }
        if (section.takeaway) {
          copy.takeaway = translated.takeaway ?? '';
          requireTranslated(`${lesson.id} section[${index}].takeaway`, section.takeaway, copy.takeaway, errors);
        }
        if (section.example) {
          copy.example = {
            title: translated.example?.title ?? '',
            detail: translated.example?.detail ?? '',
          };
          requireTranslated(`${lesson.id} section[${index}].example.title`, section.example.title, copy.example.title, errors);
          requireTranslated(`${lesson.id} section[${index}].example.detail`, section.example.detail, copy.example.detail, errors);
        }
        lessonsCatalog[lesson.id].sections.push(copy);
      });
    }
  }
  for (const lesson of contentModule.lessons) {
    if (!seen.has(lesson.id)) errors.push(`${lesson.id}: missing from translated lessons`);
  }
  learningErrorList(errors, 'lessons');
}

// Trainers: questions keyed by question id, choices by choice id.
const trainersCatalog = {};
{
  const errors = [];
  const englishById = new Map(contentModule.trainers.map((trainer) => [trainer.id, trainer]));
  const translatedById = new Map(readJson('trainers.json').map((trainer) => [trainer.id, trainer]));
  for (const trainer of contentModule.trainers) {
    const translated = translatedById.get(trainer.id);
    if (!translated) { errors.push(`${trainer.id}: missing trainer`); continue; }
    const questions = {};
    for (const question of trainer.questions) {
      const translatedQuestion = (translated.questions ?? []).find((q) => q.id === question.id);
      if (!translatedQuestion) { errors.push(`${trainer.id}/${question.id}: missing question`); continue; }
      const choices = {};
      for (const choice of question.choices) {
        const translatedChoice = (translatedQuestion.choices ?? []).find((c) => c.id === choice.id);
        if (!translatedChoice) { errors.push(`${trainer.id}/${question.id}/${choice.id}: missing choice`); continue; }
        choices[choice.id] = { label: translatedChoice.label ?? '', feedback: translatedChoice.feedback ?? '' };
        requireTranslated(`${trainer.id}/${question.id}/${choice.id}.label`, choice.label, choices[choice.id].label, errors);
        requireTranslated(`${trainer.id}/${question.id}/${choice.id}.feedback`, choice.feedback, choices[choice.id].feedback, errors);
      }
      questions[question.id] = {
        prompt: translatedQuestion.prompt ?? '',
        context: translatedQuestion.context ?? '',
        explanation: translatedQuestion.explanation ?? '',
        choices,
      };
      requireTranslated(`${trainer.id}/${question.id}.prompt`, question.prompt, questions[question.id].prompt, errors);
      requireTranslated(`${trainer.id}/${question.id}.context`, question.context, questions[question.id].context, errors);
      requireTranslated(`${trainer.id}/${question.id}.explanation`, question.explanation, questions[question.id].explanation, errors);
    }
    trainersCatalog[trainer.id] = { questions };
  }
  learningErrorList(errors, 'trainers');
}

// Cheat sheets: groups stay index-aligned; title/description come from the
// activity.* message keys, so only note/groups belong in the catalog.
const sheetsCatalog = {};
{
  const errors = [];
  const englishById = new Map(contentModule.cheatSheets.map((sheet) => [sheet.id, sheet]));
  const translatedById = new Map(readJson('sheets.json').map((sheet) => [sheet.id, sheet]));
  for (const sheet of contentModule.cheatSheets) {
    const translated = translatedById.get(sheet.id);
    if (!translated) { errors.push(`${sheet.id}: missing sheet`); continue; }
    const copy = { groups: [] };
    if (sheet.note) {
      copy.note = translated.note ?? '';
      requireTranslated(`${sheet.id}.note`, sheet.note, copy.note, errors);
    }
    if ((translated.groups ?? []).length !== sheet.groups.length) {
      errors.push(`${sheet.id}: group count mismatch`);
      continue;
    }
    sheet.groups.forEach((group, index) => {
      const translatedGroup = translated.groups[index];
      const groupCopy = { title: translatedGroup.title ?? '', rows: [] };
      requireTranslated(`${sheet.id} group[${index}].title`, group.title, groupCopy.title, errors);
      if ((translatedGroup.rows ?? []).length !== group.rows.length) {
        errors.push(`${sheet.id} group[${index}]: row count mismatch`);
        groupCopy.rows = group.rows.map(() => ({ label: '', detail: '' }));
      } else {
        group.rows.forEach((row, rowIndex) => {
          const rowCopy = { label: translatedGroup.rows[rowIndex].label ?? '', detail: translatedGroup.rows[rowIndex].detail ?? '' };
          requireTranslated(`${sheet.id} group[${index}] row[${rowIndex}].label`, row.label, rowCopy.label, errors);
          requireTranslated(`${sheet.id} group[${index}] row[${rowIndex}].detail`, row.detail, rowCopy.detail, errors);
          groupCopy.rows.push(rowCopy);
        });
      }
      copy.groups.push(groupCopy);
    });
    sheetsCatalog[sheet.id] = copy;
  }
  learningErrorList(errors, 'sheets');
}

const learningHeader = `// GENERATED by scripts/sync-locale-catalog.mjs from the JSON translation
// memory under translation-memory/${locale}/. Edit the JSON sources and
// re-run the sync script; hand edits here will be overwritten.
${config.draftLine}
import type { LearningContentCatalog } from '../learningContentChinese';

`;
writeGenerated('learningContent.ts', `${learningHeader}export const ${config.learningName}: LearningContentCatalog = ${JSON.stringify({
  cheatSheets: sheetsCatalog,
  lessons: lessonsCatalog,
  trainers: trainersCatalog,
}, null, 2)};\n`);

console.log(`Learning content validated for ${locale}: lessons ${Object.keys(lessonsCatalog).length}, trainers ${Object.keys(trainersCatalog).length}, sheets ${Object.keys(sheetsCatalog).length}`);

// ---------------------------------------------------------------------------
// 3. Scenario content (per-template copy + feedback) and vocabulary
// ---------------------------------------------------------------------------

const SCENARIO_PLACEHOLDERS = new Set([
  'heroHand',
  'riskBb', 'rewardBb', 'requiredFoldPercent',
  'callAmountBb', 'finalPotBb', 'requiredEquityPercent', 'estimatedEquityPercent',
  'directRequiredEquityPercent', 'estimatedCleanEquityPercent', 'minimumFutureWinBb',
]);
const MATH_FALLBACK_TEMPLATES = new Set([
  'blind-defense', 'flush-draw-price', 'river-bluff-catch', 'missed-draw',
  'river-bluff-catch-call', 'river-bluff-catch-fold', 'turn-straight-price', 'overpriced-flush',
]);
const CALCULATION_KINDS = new Set(['call', 'bluff', 'implied-odds']);

function scenarioPlaceholders(value) {
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]);
}

const scenarioTemplates = {};
const scenarioErrors = [];
{
  const sourceById = new Map();
  // The frozen English scenario source lives in the extractor's slice arrays at
  // the slice root (shared by both locales); the translated outputs under
  // out/<locale>/ are objects keyed by templateId.
  for (const name of ['source-scenario-1.json', 'source-scenario-2.json', 'source-scenario-3.json']) {
    const target = path.join(memoryRoot, name);
    if (!fs.existsSync(target)) throw new Error(`Missing English scenario slice: ${path.relative(projectRoot, target)}`);
    for (const template of JSON.parse(fs.readFileSync(target, 'utf8'))) sourceById.set(template.templateId, template);
  }
  const seen = new Set();
  for (const name of ['scenario-1.json', 'scenario-2.json', 'scenario-3.json']) {
    // Translated scenario outputs are objects keyed by templateId; the same
    // validation rules run per slice before the sync.
    for (const [id, copy] of Object.entries(readJson(name))) {
      if (typeof copy !== 'object' || copy === null || Array.isArray(copy)) {
        scenarioErrors.push(`${id}: entry must be an object`);
        continue;
      }
      if (seen.has(id)) { scenarioErrors.push(`${id}: duplicate template entry`); continue; }
      seen.add(id);
      const source = sourceById.get(id);
      if (!source) { scenarioErrors.push(`${id}: unknown template id`); continue; }
      const entry = {
        focus: copy.focus ?? '',
        opponentAction: copy.opponentAction ?? '',
        prompt: copy.prompt ?? '',
        reasoning: copy.reasoning ?? '',
        takeaway: copy.takeaway ?? '',
        choices: {},
      };
      for (const field of ['focus', 'opponentAction', 'prompt', 'takeaway']) {
        requireTranslated(`${id}.${field}`, source[field] ?? '', entry[field], scenarioErrors);
      }
      const reasoning = copy.reasoning;
      if (reasoning && typeof reasoning === 'object' && !Array.isArray(reasoning)) {
        if (!MATH_FALLBACK_TEMPLATES.has(id)) {
          scenarioErrors.push(`${id}.reasoning: mathFallback only allowed for math templates`);
        }
        entry.reasoning = { mathFallback: reasoning.mathFallback ?? '' };
        requireTranslated(`${id}.reasoning.mathFallback`, source.reasoning ?? '', entry.reasoning.mathFallback, scenarioErrors);
      } else {
        requireTranslated(`${id}.reasoning`, source.reasoning ?? '', entry.reasoning, scenarioErrors);
        for (const name2 of scenarioPlaceholders(entry.reasoning)) {
          if (!SCENARIO_PLACEHOLDERS.has(name2)) scenarioErrors.push(`${id}.reasoning: unknown placeholder {{${name2}}}`);
        }
      }
      const choiceIds = new Set((source.choices ?? []).map((choice) => choice.id));
      const translatedChoices = copy.choices ?? {};
      if (new Set(Object.keys(translatedChoices)).size !== Object.keys(translatedChoices).length
        || [...Object.keys(translatedChoices)].some((choiceId) => !choiceIds.has(choiceId))) {
        scenarioErrors.push(`${id}.choices: unknown or duplicate choice ids`);
      }
      for (const choice of source.choices ?? []) {
        const translatedChoice = translatedChoices[choice.id];
        if (!translatedChoice) { scenarioErrors.push(`${id}/${choice.id}: missing choice`); continue; }
        const choiceEntry = { label: translatedChoice.label ?? '', feedback: translatedChoice.feedback ?? '' };
        requireTranslated(`${id}/${choice.id}.label`, choice.label, choiceEntry.label, scenarioErrors);
        const feedback = choiceEntry.feedback;
        if (typeof feedback === 'string') {
          requireTranslated(`${id}/${choice.id}.feedback`, choice.feedback, feedback, scenarioErrors);
          for (const name2 of scenarioPlaceholders(feedback)) {
            if (!SCENARIO_PLACEHOLDERS.has(name2)) scenarioErrors.push(`${id}/${choice.id}.feedback: unknown placeholder {{${name2}}}`);
          }
        } else if (Array.isArray(feedback) && feedback.length > 0) {
          const defaults = feedback.filter((variant) => variant && variant.if === undefined);
          const conditions = feedback.filter((variant) => variant && variant.if !== undefined).map((variant) => variant.if);
          if (defaults.length > 1) scenarioErrors.push(`${id}/${choice.id}.feedback: multiple default variants`);
          if (new Set(conditions).size !== conditions.length) scenarioErrors.push(`${id}/${choice.id}.feedback: duplicate conditions`);
          for (const condition of conditions) {
            if (!CALCULATION_KINDS.has(condition)) scenarioErrors.push(`${id}/${choice.id}.feedback: unknown condition ${condition}`);
          }
          for (const [variantIndex, variant] of feedback.entries()) {
            if (!variant || typeof variant.text !== 'string' || variant.text.trim().length === 0) {
              scenarioErrors.push(`${id}/${choice.id}.feedback[${variantIndex}]: blank text`);
              continue;
            }
            for (const name2 of scenarioPlaceholders(variant.text)) {
              if (!SCENARIO_PLACEHOLDERS.has(name2)) scenarioErrors.push(`${id}/${choice.id}.feedback[${variantIndex}]: unknown placeholder {{${name2}}}`);
            }
          }
        } else {
          scenarioErrors.push(`${id}/${choice.id}.feedback: must be a string or non-empty variants array`);
        }
        entry.choices[choice.id] = choiceEntry;
      }
      scenarioTemplates[id] = entry;
    }
  }
  for (const id of sourceById.keys()) {
    if (!seen.has(id)) scenarioErrors.push(`${id}: missing from translated scenario output`);
  }
  const vocab = readJson(`vocab-${locale}.json`);
  const actionRules = (vocab.actions ?? []).map((rule) => ({ regex: new RegExp(rule.pattern, 'u'), template: rule.template }));
  for (const [id, template] of sourceById) {
    const entry = scenarioTemplates[id];
    if (!entry) continue;
    for (const choice of template.choices ?? []) {
      const translatedChoice = entry.choices[choice.id];
      if (!translatedChoice) continue;
      const rule = actionRules.find(({ regex }) => regex.test(choice.label));
      if (!rule) { scenarioErrors.push(`${id}/${choice.id}: no vocab action rule matches "${choice.label}"`); continue; }
      const rendered = choice.label.replace(rule.regex, rule.template);
      if (rendered !== translatedChoice.label) {
        scenarioErrors.push(`${id}/${choice.id}.label: "${translatedChoice.label}" does not match vocab rendering "${rendered}"`);
      }
    }
  }
  if (scenarioErrors.length > 0) {
    console.error(`Scenario content validation failed for ${locale}:`);
    for (const error of scenarioErrors.slice(0, 40)) console.error(`  - ${error}`);
    if (scenarioErrors.length > 40) console.error(`  ... and ${scenarioErrors.length - 40} more`);
    process.exit(1);
  }

  const vocabName = locale === 'es-419' ? 'spanishScenarioVocab' : 'portugueseScenarioVocab';
  const templatesName = locale === 'es-419' ? 'spanishScenarioTemplates' : 'portugueseScenarioTemplates';
  const scenarioHeader = `// GENERATED by scripts/sync-locale-catalog.mjs from the JSON translation
// memory under translation-memory/${locale}/. Edit the JSON sources and
// re-run the sync script; hand edits here will be overwritten.
${config.draftLine}
import type { ScenarioTemplateCatalog, ScenarioVocab } from '../scenarioCatalog';

`;
  writeGenerated('scenarioContent.ts', `${scenarioHeader}export const ${templatesName}: ScenarioTemplateCatalog = ${JSON.stringify(scenarioTemplates, null, 2)};

export const ${vocabName}: ScenarioVocab = ${JSON.stringify(vocab, null, 2)};
`);
}

console.log(`Scenario content validated for ${locale}: templates ${Object.keys(scenarioTemplates).length}`);
