#!/usr/bin/env node
/**
 * Phase 19 L4/L5 — translation slice extractor.
 *
 * Dumps the frozen English source surface into JSON slices. The tracked
 * translation sources land in translation-memory/ (the authoritative inputs of
 * scripts/sync-locale-catalog.mjs): the English scenario source slices and the
 * position/choice-label vocabulary. Throwaway working slices for the message,
 * lesson, trainer, and sheet translation passes stay under the gitignored
 * .claude/tmp/translation/ — they are derived from committed TypeScript and
 * are never inputs to the sync script.
 *
 * The committed catalogs remain the source of truth; these slices are working
 * inputs for delegation and the tracked scenario sources are frozen inputs to
 * the generator.
 *
 *   node scripts/extract-translation-slices.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const srcRoot = path.join(projectRoot, 'src');
const outRoot = path.join(projectRoot, '.claude', 'tmp', 'translation');
const memoryRoot = path.join(projectRoot, 'translation-memory');

fs.rmSync(outRoot, { recursive: true, force: true });
fs.mkdirSync(outRoot, { recursive: true });

// ---------------------------------------------------------------------------
// Message catalogs via object-literal evaluation (same technique as the
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
  const target = path.join(outRoot, 'catalogs.mjs');
  fs.writeFileSync(target, `${parts.join('\n\n')}\n\nexport { ${exportNames.join(', ')} };\n`);
  return import(`${target}?t=${Date.now()}`);
}

const catalogs = await evaluateCatalogModule([
  ['phase7Messages.ts', 'phase7EnglishMessages'],
  ['phase8Messages.ts', 'phase8EnglishMessages'],
  ['phase9Messages.ts', 'phase9EnglishMessages'],
  ['phase12Messages.ts', 'phase12EnglishMessages'],
  ['phase14Messages.ts', 'phase14EnglishMessages'],
  ['phase16Messages.ts', 'phase16EnglishMessages'],
  // The inline base surface lives in the internal const (exported via the
  // public baseEnglishMessages alias in messages.ts).
  ['messages.ts', 'baseEnglishMessagesInternal'],
]);

const base = catalogs.baseEnglishMessagesInternal;

// Group base keys into balanced slices by stable prefix so each translation
// slice stays coherent.
const GROUPS = [
  { name: 'base-1-core', prefixes: ['common.', 'difficulty.', 'language.', 'tabs.', 'home.', 'play.', 'caption.', 'tournament.', 'pace.', 'onboarding.', 'welcome.', 'guided.'] },
  { name: 'base-2-table', prefixes: ['alert.', 'table.', 'poker.', 'setup.', 'sizing.', 'guide.', 'decision.', 'card.', 'orientation.', 'roster.', 'betting.', 'odds.'] },
  { name: 'base-3-multiplayer', prefixes: ['multiplayer.', 'multiway.', 'persona.', 'character.'] },
  { name: 'base-4-learn', prefixes: ['learn.', 'activity.', 'lesson.', 'quiz.', 'trainer.', 'mission.', 'sheet.', 'range.', 'concept.', 'scenario.', 'learning.', 'focus.'] },
  { name: 'base-5-meta', prefixes: ['championship.', 'history.', 'replay.', 'stats.', 'opponentRead.', 'opponentTendencies.', 'progress.', 'feedback.', 'beta.', 'coach.', 'session.', 'summary.', 'settings.', 'profile.', 'consent.', 'unread.', 'misc.'] },
];

const assigned = new Set();
for (const group of GROUPS) {
  const slice = {};
  for (const [key, value] of Object.entries(base)) {
    if (group.prefixes.some((prefix) => key.startsWith(prefix))) {
      slice[key] = value;
      assigned.add(key);
    }
  }
  fs.writeFileSync(path.join(outRoot, `es-slice-${group.name}.json`), `${JSON.stringify(slice, null, 2)}\n`);
}
const unassigned = Object.keys(base).filter((key) => !assigned.has(key));
if (unassigned.length > 0) {
  const slice = Object.fromEntries(unassigned.map((key) => [key, base[key]]));
  fs.writeFileSync(path.join(outRoot, 'es-slice-base-6-rest.json'), `${JSON.stringify(slice, null, 2)}\n`);
  console.warn(`Unassigned base keys placed in base-6-rest: ${unassigned.length}`);
}

// Phase slices.
for (const [file, exportName, names] of [
  ['phase7Messages.ts', 'phase7EnglishMessages', ['phase7']],
  ['phase8Messages.ts', 'phase8EnglishMessages', ['phase8']],
  ['phase9Messages.ts', 'phase9EnglishMessages', ['phase9']],
  ['phase12Messages.ts', 'phase12EnglishMessages', ['phase12']],
  ['phase14Messages.ts', 'phase14EnglishMessages', ['phase14']],
  ['phase16Messages.ts', 'phase16EnglishMessages', ['phase16']],
]) {
  fs.writeFileSync(
    path.join(outRoot, `es-slice-${names[0]}.json`),
    `${JSON.stringify(catalogs[exportName], null, 2)}\n`,
  );
}

// ---------------------------------------------------------------------------
// Learning content via transpile + import.
// ---------------------------------------------------------------------------

const tmpLearning = path.join(outRoot, 'learning');
fs.mkdirSync(tmpLearning, { recursive: true });

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
  const target = path.join(tmpLearning, targetName);
  fs.writeFileSync(target, result.outputText);
  return target;
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
const scenariosModule = await import(`${path.join(tmpLearning, 'domain_learning_scenarios.mjs')}?t=${Date.now()}`);

// Lessons: two balanced slices preserving order (index-aligned sections).
const lessons = contentModule.lessons;
const half = Math.ceil(lessons.length / 2);
for (const [name, slice] of [['lessons-1', lessons.slice(0, half)], ['lessons-2', lessons.slice(half)]]) {
  const payload = slice.map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    description: lesson.description,
    sections: lesson.sections.map((section) => ({
      heading: section.heading,
      body: section.body,
      ...(section.bullets ? { bullets: section.bullets } : {}),
      ...(section.takeaway ? { takeaway: section.takeaway } : {}),
      ...(section.example ? { example: { title: section.example.title, detail: section.example.detail } } : {}),
    })),
  }));
  fs.writeFileSync(path.join(outRoot, `es-slice-${name}.json`), `${JSON.stringify(payload, null, 2)}\n`);
}

// Trainers + cheat sheets.
const trainers = contentModule.trainers.map((trainer) => ({
  id: trainer.id,
  questions: trainer.questions.map((question) => ({
    id: question.id,
    prompt: question.prompt,
    context: question.context,
    explanation: question.explanation,
    choices: question.choices.map((choice) => ({ id: choice.id, label: choice.label, feedback: choice.feedback })),
  })),
}));
fs.writeFileSync(path.join(outRoot, 'es-slice-trainers.json'), `${JSON.stringify(trainers, null, 2)}\n`);

const sheets = contentModule.cheatSheets.map((sheet) => ({
  id: sheet.id,
  title: sheet.title,
  description: sheet.description,
  ...(sheet.note ? { note: sheet.note } : {}),
  groups: sheet.groups.map((group) => ({
    title: group.title,
    rows: group.rows.map((row) => ({ label: row.label, detail: row.detail })),
  })),
}));
fs.writeFileSync(path.join(outRoot, 'es-slice-sheets.json'), `${JSON.stringify(sheets, null, 2)}\n`);

// ---------------------------------------------------------------------------
// Scenario templates: instantiate every factory variant and collapse to one
// representative spot per template id.
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const factories = [
  ...(scenariosModule.tournamentBubbleScenarioFactories ?? []),
  ...(scenariosModule.opponentAdjustmentScenarioFactories ?? []),
  ...(scenariosModule.advancedMathScenarioFactories ?? []),
  ...(scenariosModule.phase7PreflopScenarioFactories ?? []),
  ...(scenariosModule.phase7PostflopScenarioFactories ?? []),
];
// The main module keeps its factory list private; generate sessions to reach
// every template instead.
const seen = new Map();
for (let seed = 1; seed <= 60 && seen.size < 200; seed += 1) {
  for (const spot of scenariosModule.generateScenarioSession(seed)) {
    const templateId = spot.id.replace(/-\d+$/, '');
    if (!seen.has(templateId)) seen.set(templateId, spot);
  }
  // Deterministic focused pass: the first argument is the coach focus, so the
  // seed must be passed explicitly (relying on the default consumed
  // Date.now()-seeded sessions and made the slice grouping non-reproducible).
  for (const spot of scenariosModule.generateFocusedScenarioSession('preflop', seed)) {
    const templateId = spot.id.replace(/-\d+$/, '');
    if (!seen.has(templateId)) seen.set(templateId, spot);
  }
}
// Vocabularies the per-language action/position translators must cover.
const positions = new Set();
const choiceLabels = new Set();
for (const spot of seen.values()) {
  positions.add(spot.position);
  positions.add(spot.opponentPosition);
  for (const choice of spot.choices) choiceLabels.add(choice.label);
}
fs.mkdirSync(memoryRoot, { recursive: true });
fs.writeFileSync(path.join(memoryRoot, 'scenario-vocab.json'), `${JSON.stringify({
  positions: [...positions].sort(),
  choiceLabels: [...choiceLabels].sort(),
}, null, 2)}\n`);

const scenarioTemplates = [...seen.entries()].map(([templateId, spot]) => ({
  templateId,
  focus: spot.focus,
  opponentAction: spot.opponentAction,
  prompt: spot.prompt,
  reasoning: spot.reasoning,
  takeaway: spot.takeaway,
  bestChoiceId: spot.bestChoiceId,
  choices: spot.choices.map((choice) => ({ id: choice.id, label: choice.label, feedback: choice.feedback })),
  calculation: spot.calculation ?? null,
}));
// The scenario surface is the largest single slice; split it into three
// balanced parts so each delegation unit stays reviewable. These are the
// frozen English sources the sync script validates against — written into the
// tracked translation memory.
const scenarioChunkSize = Math.ceil(scenarioTemplates.length / 3);
for (const [index, chunk] of [
  scenarioTemplates.slice(0, scenarioChunkSize),
  scenarioTemplates.slice(scenarioChunkSize, scenarioChunkSize * 2),
  scenarioTemplates.slice(scenarioChunkSize * 2),
].entries()) {
  fs.writeFileSync(path.join(memoryRoot, `source-scenario-${index + 1}.json`), `${JSON.stringify(chunk, null, 2)}\n`);
}

console.log(`Translation slices written to ${path.relative(projectRoot, outRoot)}`);
console.log(`  tracked scenario sources: ${path.relative(projectRoot, memoryRoot)} (3 slices + vocab)`);
console.log(`  base slices: ${GROUPS.length + (unassigned.length > 0 ? 1 : 0)} (keys: ${Object.keys(base).length})`);
console.log(`  phase slices: 6`);
console.log(`  lessons: ${lessons.length} in 2 slices`);
console.log(`  trainers: ${trainers.length}, sheets: ${sheets.length}`);
console.log(`  scenario templates: ${scenarioTemplates.length}`);
