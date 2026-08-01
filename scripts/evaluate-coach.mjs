import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';

import { coachEvalHands } from './coach-eval-hands.mjs';

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...valueParts] = argument.split('=');
    return [key.replace(/^--/, ''), valueParts.join('=') || true];
  }),
);

const expectedEffort = args.get('effort');
if (expectedEffort !== 'low' && expectedEffort !== 'medium') {
  throw new Error('Pass --effort=low or --effort=medium.');
}

const requestedIds = typeof args.get('ids') === 'string'
  ? new Set(String(args.get('ids')).split(',').map((value) => value.trim()).filter(Boolean))
  : null;
const selectedHands = requestedIds
  ? coachEvalHands.filter((testCase) => requestedIds.has(testCase.id))
  : coachEvalHands;
if (selectedHands.length === 0 || (requestedIds && selectedHands.length !== requestedIds.size)) {
  throw new Error('Every --ids entry must match a known evaluation case.');
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required.');
}

const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

const requiredReviewFields = [
  'summary',
  'bestDecision',
  'keyConcept',
  'practiceTip',
  'confidence',
  'handGrade',
  'focusDecisionSequence',
  'focusArea',
];
const reviewGrades = new Set(['strong', 'close', 'mistake']);
const reviewFocusAreas = new Set([
  'none', 'preflop', 'value-betting', 'bluffing', 'calling', 'bet-sizing', 'pot-odds', 'draws',
]);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function percentile(values, percentage) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((percentage / 100) * sorted.length) - 1);
  return sorted[index];
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => new RegExp(pattern, 'i').test(text));
}

function extractPercentages(text) {
  return [...text.matchAll(/\b(\d{1,2}(?:\.\d+)?)\s*%/g)].map((match) => Number(match[1]));
}

function scoreReview(testCase, review) {
  const contractPass = Boolean(
    review
    && requiredReviewFields.every((field) => Object.hasOwn(review, field))
    && requiredReviewFields.slice(0, 4).every((field) => typeof review[field] === 'string' && review[field].trim())
    && typeof review.confidence === 'number'
    && review.confidence >= 0
    && review.confidence <= 1
    && reviewGrades.has(review.handGrade)
    && Number.isInteger(review.focusDecisionSequence)
    && review.focusDecisionSequence >= 0
    && review.focusDecisionSequence <= 40
    && reviewFocusAreas.has(review.focusArea),
  );

  if (!contractPass) {
    return {
      contractPass: false,
      actionPass: false,
      conceptsPass: false,
      potOddsPass: false,
      resultBiasPass: false,
      factDisciplinePass: false,
      percentages: [],
      qualityPoints: 0,
      qualityPossible: 6,
    };
  }

  const bestDecision = review.bestDecision;
  const allText = requiredReviewFields.slice(0, 4).map((field) => review[field]).join(' ');
  const { expectations } = testCase;
  const actionPass = matchesAny(bestDecision, expectations.decisionPatterns);
  const conceptsPass = expectations.conceptGroups.every((group) => matchesAny(allText, group));
  const percentages = extractPercentages(allText);
  const potOddsPass = expectations.expectedPotOdds === undefined
    || percentages.some((value) => Math.abs(value - expectations.expectedPotOdds) <= expectations.potOddsTolerance);
  const resultBiasPass = !expectations.resultBiasPatterns
    || matchesAny(allText, expectations.resultBiasPatterns);
  const factDisciplinePass = !(expectations.forbiddenPatterns ?? []).some(
    (pattern) => new RegExp(pattern, 'i').test(allText),
  );
  const checks = [contractPass, actionPass, conceptsPass, potOddsPass, resultBiasPass, factDisciplinePass];

  return {
    contractPass,
    actionPass,
    conceptsPass,
    potOddsPass,
    resultBiasPass,
    factDisciplinePass,
    percentages,
    qualityPoints: checks.filter(Boolean).length,
    qualityPossible: checks.length,
  };
}

async function readFunctionError(error) {
  const response = error?.context;
  if (!(response instanceof Response)) return { message: error?.message ?? String(error) };
  let body = null;
  try {
    body = await response.clone().json();
  } catch {
    body = await response.clone().text();
  }
  return { message: error?.message ?? 'Function invocation failed.', status: response.status, body };
}

async function invokeCoach(hand) {
  const startedAt = performance.now();
  const { data, error } = await supabase.functions.invoke('poker-coach', { body: hand });
  const elapsedMs = Math.round(performance.now() - startedAt);
  if (error) throw Object.assign(new Error(error.message), { details: await readFunctionError(error), elapsedMs });
  return { data, elapsedMs };
}

async function invokeWithRetry(hand) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await invokeCoach(hand);
      return { ...result, attempts: attempt };
    } catch (error) {
      lastError = error;
      const structuredError = error.details?.body?.error;
      if (structuredError?.retryable === false) throw error;
      if (attempt === 1) {
        const retryAfterMs = Number(structuredError?.retryAfterMs);
        await wait(Number.isFinite(retryAfterMs) ? Math.min(Math.max(retryAfterMs, 250), 5_000) : 750);
      }
    }
  }
  throw lastError;
}

function buildSummary(results) {
  const completed = results.filter((result) => result.ok);
  const latencies = completed.map((result) => result.elapsedMs);
  const sum = (values) => values.reduce((total, value) => total + value, 0);
  const countPasses = (field) => completed.filter((result) => result.score[field]).length;
  const tokenValues = (field) => completed
    .map((result) => result.usage?.[field])
    .filter((value) => Number.isFinite(value));
  const reasoningTokens = completed
    .map((result) => result.usage?.output_tokens_details?.reasoning_tokens)
    .filter((value) => Number.isFinite(value));

  return {
    requestedEffort: expectedEffort,
    totalCases: results.length,
    completedCases: completed.length,
    failedCases: results.length - completed.length,
    contractPasses: countPasses('contractPass'),
    actionPasses: countPasses('actionPass'),
    conceptPasses: countPasses('conceptsPass'),
    potOddsPasses: countPasses('potOddsPass'),
    resultBiasPasses: countPasses('resultBiasPass'),
    factDisciplinePasses: countPasses('factDisciplinePass'),
    qualityPoints: sum(completed.map((result) => result.score.qualityPoints)),
    qualityPossible: sum(completed.map((result) => result.score.qualityPossible)),
    latencyMs: {
      average: latencies.length ? Math.round(sum(latencies) / latencies.length) : null,
      p50: percentile(latencies, 50),
      p90: percentile(latencies, 90),
      minimum: latencies.length ? Math.min(...latencies) : null,
      maximum: latencies.length ? Math.max(...latencies) : null,
    },
    tokens: {
      inputTotal: sum(tokenValues('input_tokens')),
      outputTotal: sum(tokenValues('output_tokens')),
      reasoningTotal: sum(reasoningTokens),
      total: sum(tokenValues('total_tokens')),
    },
    averageConfidence: completed.length
      ? Number((sum(completed.map((result) => result.review.confidence)) / completed.length).toFixed(3))
      : null,
  };
}

const authStartedAt = performance.now();
const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
if (authError || !authData.session) throw authError ?? new Error('Anonymous authentication returned no session.');
console.log(`Authenticated anonymous evaluator in ${Math.round(performance.now() - authStartedAt)} ms.`);

console.log(`Warming the function and verifying reasoning effort is ${expectedEffort}...`);
const warmup = await invokeWithRetry(selectedHands[0].hand);
if (warmup.data?.reasoningEffort !== expectedEffort) {
  throw new Error(
    `Hosted function reported ${warmup.data?.reasoningEffort ?? 'no effort'}; expected ${expectedEffort}.`,
  );
}
if (warmup.data?.analysisVersion !== 1) {
  throw new Error(`Hosted function reported analysis version ${warmup.data?.analysisVersion ?? 'missing'}; expected 1.`);
}
if (warmup.data?.analysis?.version !== 1 || warmup.data?.analysis?.source !== 'deterministic-poker-engine') {
  throw new Error('Hosted function did not return its deterministic verification facts.');
}
console.log(`Warmup complete in ${warmup.elapsedMs} ms; model ${warmup.data.model}.`);

const results = [];
for (const [index, testCase] of selectedHands.entries()) {
  const prefix = `[${String(index + 1).padStart(2, '0')}/${selectedHands.length}] ${testCase.id}`;
  try {
    const { data, elapsedMs, attempts } = await invokeWithRetry(testCase.hand);
    if (data?.reasoningEffort !== expectedEffort) {
      throw new Error(`Reasoning effort changed during the batch: ${data?.reasoningEffort ?? 'missing'}.`);
    }
    if (data?.analysisVersion !== 1) {
      throw new Error(`Verified analysis version changed during the batch: ${data?.analysisVersion ?? 'missing'}.`);
    }
    if (data?.analysis?.version !== 1 || data?.analysis?.source !== 'deterministic-poker-engine') {
      throw new Error('Deterministic verification facts were missing from the hosted response.');
    }
    const score = scoreReview(testCase, data.review);
    results.push({
      id: testCase.id,
      title: testCase.title,
      category: testCase.category,
      difficulty: testCase.difficulty,
      ok: true,
      elapsedMs,
      attempts,
      model: data.model,
      reasoningEffort: data.reasoningEffort,
      analysisVersion: data.analysisVersion,
      analysisSource: data.analysis.source,
      usage: data.usage,
      review: data.review,
      score,
    });
    console.log(
      `${prefix} ${elapsedMs} ms | action ${score.actionPass ? 'PASS' : 'FAIL'} | `
      + `concepts ${score.conceptsPass ? 'PASS' : 'FAIL'} | facts ${score.factDisciplinePass ? 'PASS' : 'FAIL'}`,
    );
  } catch (error) {
    results.push({
      id: testCase.id,
      title: testCase.title,
      category: testCase.category,
      difficulty: testCase.difficulty,
      ok: false,
      elapsedMs: error.elapsedMs ?? null,
      error: error.details ?? { message: error.message },
    });
    console.error(`${prefix} ERROR: ${error.message}`);
  }
  await wait(250);
}

const summary = buildSummary(results);
const output = {
  generatedAt: new Date().toISOString(),
  projectRef: new URL(supabaseUrl).hostname.split('.')[0],
  model: warmup.data.model,
  reasoningEffort: expectedEffort,
  methodology: {
    warmupExcluded: true,
    sequentialRequests: true,
    retriesPerCase: 1,
    rubric: 'Contract, expected action, required concepts, pot-odds math, result-bias handling, and supplied-fact discipline.',
  },
  summary,
  results,
};

await mkdir('.eval-results', { recursive: true });
const outputPath = args.get('output') === true || !args.get('output')
  ? `.eval-results/coach-${expectedEffort}.json`
  : String(args.get('output'));
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

console.log('\nBatch summary');
console.log(JSON.stringify(summary, null, 2));
console.log(`Saved ${outputPath}`);
