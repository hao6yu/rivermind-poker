import { withSupabase } from '@supabase/server';
import {
  analyzeCoachHand,
  cardsMatch,
  parseCardLabel,
  parseCoachAnalysisInput,
  type CoachAnalysisInput,
} from '../../../src/domain/poker/analysis.ts';
import { isCoachReview } from '../../../src/domain/poker/coaching.ts';
import type { CoachReview } from '../../../src/domain/poker/types.ts';
import {
  classifyOpenAIFailure,
  invalidResponseFailure,
  refusalFailure,
  retryDelayMs,
  shouldRetryInternally,
  timeoutFailure,
  type CoachFailure,
} from './resilience.ts';

interface HandReviewRequest {
  heroCards: string[];
  board: string[];
  street: string;
  potWon: number;
  result: string;
  actionHistory: string[];
  analysisInput?: CoachAnalysisInput;
}

interface OpenAIResponse {
  model?: string;
  status?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  };
}

type ReasoningEffort = 'low' | 'medium';

interface CoachQuota {
  limit: 20;
  remaining: number;
  resetsAt: string;
}

interface QuotaClaimRow {
  allowed: boolean;
  request_count: number;
  remaining: number;
  resets_at: string;
}

interface QuotaReleaseRow {
  released: boolean;
  request_count: number;
  remaining: number;
  resets_at: string;
}

interface ReviewSuccess {
  ok: true;
  review: CoachReview;
  payload: OpenAIResponse;
  attempts: number;
  requestId: string | null;
}

interface ReviewFailure {
  ok: false;
  failure: CoachFailure;
}

const reviewSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    bestDecision: { type: 'string' },
    keyConcept: { type: 'string' },
    practiceTip: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    handGrade: { type: 'string', enum: ['strong', 'close', 'mistake'] },
    focusDecisionSequence: { type: 'integer', minimum: 0, maximum: 40 },
    focusArea: {
      type: 'string',
      enum: ['none', 'preflop', 'value-betting', 'bluffing', 'calling', 'bet-sizing', 'pot-odds', 'draws'],
    },
  },
  required: [
    'summary',
    'bestDecision',
    'keyConcept',
    'practiceTip',
    'confidence',
    'handGrade',
    'focusDecisionSequence',
    'focusArea',
  ],
  additionalProperties: false,
} as const;

function isShortStringArray(value: unknown, maximumItems: number): value is string[] {
  return Array.isArray(value)
    && value.length <= maximumItems
    && value.every((item) => typeof item === 'string' && item.length <= 180);
}

function isParsedCard(card: ReturnType<typeof parseCardLabel>): card is NonNullable<ReturnType<typeof parseCardLabel>> {
  return card !== null;
}

function parseHandReview(value: unknown): HandReviewRequest | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (!isShortStringArray(candidate.heroCards, 2) || candidate.heroCards.length !== 2) return null;
  if (!isShortStringArray(candidate.board, 5)) return null;
  if (!isShortStringArray(candidate.actionHistory, 40)) return null;
  if (typeof candidate.street !== 'string' || candidate.street.length > 20) return null;
  if (typeof candidate.result !== 'string' || candidate.result.length > 300) return null;
  if (typeof candidate.potWon !== 'number' || !Number.isFinite(candidate.potWon) || candidate.potWon < 0) return null;
  const heroCards = candidate.heroCards.map(parseCardLabel);
  const board = candidate.board.map(parseCardLabel);
  if (!heroCards.every(isParsedCard) || !board.every(isParsedCard)) return null;
  const knownCards = [...heroCards, ...board];
  if (new Set(knownCards.map((card) => `${card.rank}-${card.suit}`)).size !== knownCards.length) return null;

  if (candidate.analysisInput === undefined) return candidate as unknown as HandReviewRequest;
  const analysisInput = parseCoachAnalysisInput(candidate.analysisInput);
  if (!analysisInput) return null;
  if (!cardsMatch(analysisInput.heroCards, heroCards) || !cardsMatch(analysisInput.board, board)) return null;
  return { ...candidate, analysisInput } as unknown as HandReviewRequest;
}

function extractOutputText(response: OpenAIResponse): { refused: boolean; text: string | null } {
  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text) return { refused: false, text: content.text };
      if (content.type === 'refusal' && content.refusal) return { refused: true, text: null };
    }
  }
  return { refused: false, text: null };
}

async function safetyIdentifier(userId: string): Promise<string> {
  const encoded = new TextEncoder().encode(userId);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function getReasoningEffort(): ReasoningEffort | null {
  const configured = Deno.env.get('OPENAI_REASONING_EFFORT') ?? 'medium';
  return configured === 'low' || configured === 'medium' ? configured : null;
}

function quotaClaim(value: unknown): QuotaClaimRow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.allowed !== 'boolean') return null;
  if (!Number.isInteger(row.request_count) || !Number.isInteger(row.remaining)) return null;
  if (typeof row.resets_at !== 'string' || !Number.isFinite(Date.parse(row.resets_at))) return null;
  return row as unknown as QuotaClaimRow;
}

function quotaFromClaim(claim: QuotaClaimRow): CoachQuota {
  return {
    limit: 20,
    remaining: Math.max(0, Math.min(20, claim.remaining)),
    resetsAt: claim.resets_at,
  };
}

function quotaRelease(value: unknown): QuotaReleaseRow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.released !== 'boolean') return null;
  if (!Number.isInteger(row.request_count) || !Number.isInteger(row.remaining)) return null;
  if (typeof row.resets_at !== 'string' || !Number.isFinite(Date.parse(row.resets_at))) return null;
  return row as unknown as QuotaReleaseRow;
}

function quotaFromRelease(release: QuotaReleaseRow): CoachQuota {
  return {
    limit: 20,
    remaining: Math.max(0, Math.min(20, release.remaining)),
    resetsAt: release.resets_at,
  };
}

function upstreamErrorCode(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const error = (value as Record<string, unknown>).error;
  if (!error || typeof error !== 'object' || Array.isArray(error)) return null;
  const code = (error as Record<string, unknown>).code;
  return typeof code === 'string' && code.length <= 100 ? code : null;
}

function isTimeout(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: unknown }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestOpenAIReview(
  apiKey: string,
  requestBody: Record<string, unknown>,
): Promise<ReviewSuccess | ReviewFailure> {
  let lastFailure = invalidResponseFailure();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const attemptStartedAt = Date.now();
    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(attempt === 0 ? 18_000 : 8_000),
      });
    } catch (error) {
      lastFailure = isTimeout(error)
        ? timeoutFailure()
        : classifyOpenAIFailure(503, null, null);
      console.warn('OpenAI coach attempt failed', {
        attempt: attempt + 1,
        code: lastFailure.code,
        durationMs: Date.now() - attemptStartedAt,
      });
      if (shouldRetryInternally(lastFailure, attempt)) {
        await sleep(retryDelayMs(lastFailure));
        continue;
      }
      return { ok: false, failure: lastFailure };
    }

    const requestId = response.headers.get('x-request-id');
    if (!response.ok) {
      let errorPayload: unknown = null;
      try {
        errorPayload = await response.json();
      } catch {
        // The status and request id are sufficient for safe classification and logging.
      }
      lastFailure = classifyOpenAIFailure(
        response.status,
        upstreamErrorCode(errorPayload),
        response.headers.get('retry-after'),
      );
      console.warn('OpenAI coach attempt failed', {
        attempt: attempt + 1,
        status: response.status,
        code: lastFailure.code,
        requestId,
        durationMs: Date.now() - attemptStartedAt,
      });
      if (shouldRetryInternally(lastFailure, attempt)) {
        await sleep(retryDelayMs(lastFailure));
        continue;
      }
      return { ok: false, failure: lastFailure };
    }

    let payload: OpenAIResponse;
    try {
      payload = await response.json() as OpenAIResponse;
    } catch {
      lastFailure = invalidResponseFailure();
      if (shouldRetryInternally(lastFailure, attempt)) {
        await sleep(retryDelayMs(lastFailure));
        continue;
      }
      return { ok: false, failure: lastFailure };
    }

    const output = extractOutputText(payload);
    if (output.refused) return { ok: false, failure: refusalFailure() };
    if (!output.text || payload.status !== 'completed') {
      lastFailure = invalidResponseFailure();
      if (shouldRetryInternally(lastFailure, attempt)) {
        await sleep(retryDelayMs(lastFailure));
        continue;
      }
      return { ok: false, failure: lastFailure };
    }

    try {
      const review: unknown = JSON.parse(output.text);
      if (!isCoachReview(review)) throw new Error('Invalid review shape');
      return { ok: true, review, payload, attempts: attempt + 1, requestId };
    } catch {
      lastFailure = invalidResponseFailure();
      if (shouldRetryInternally(lastFailure, attempt)) {
        await sleep(retryDelayMs(lastFailure));
        continue;
      }
      return { ok: false, failure: lastFailure };
    }
  }

  return { ok: false, failure: lastFailure };
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > 20_000) return Response.json({ error: 'Request is too large.' }, { status: 413 });

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return Response.json({ error: 'Expected a JSON request body.' }, { status: 400 });
    }

    const hand = parseHandReview(rawBody);
    if (!hand) return Response.json({ error: 'Hand history is invalid.' }, { status: 400 });

    const parsedHeroCards = hand.heroCards.map((label) => parseCardLabel(label));
    const parsedBoard = hand.board.map((label) => parseCardLabel(label));
    if (!parsedHeroCards.every(isParsedCard) || !parsedBoard.every(isParsedCard)) {
      return Response.json({ error: 'Hand cards are invalid.' }, { status: 400 });
    }
    const analysisInput = hand.analysisInput ?? {
      version: 1,
      bigBlind: 1,
      heroCards: parsedHeroCards,
      board: parsedBoard,
      decisions: [],
    } satisfies CoachAnalysisInput;
    const verifiedAnalysis = analyzeCoachHand(analysisInput);

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return Response.json({
        error: {
          code: 'coach_configuration',
          message: 'AI explanations are temporarily unavailable. Verified facts still work.',
          retryable: false,
        },
        analysis: verifiedAnalysis,
      }, { status: 503 });
    }

    const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-5.6-terra';
    const reasoningEffort = getReasoningEffort();
    if (!reasoningEffort) {
      console.error('Unsupported OPENAI_REASONING_EFFORT. Expected low or medium.');
      return Response.json({
        error: {
          code: 'coach_configuration',
          message: 'AI explanations are temporarily unavailable. Verified facts still work.',
          retryable: false,
        },
        analysis: verifiedAnalysis,
      }, { status: 503 });
    }

    const { analysisInput: _analysisInput, ...reviewHand } = hand;
    const userId = context.userClaims?.id ?? context.jwtClaims?.sub;
    if (typeof userId !== 'string' || userId.length === 0) {
      return Response.json({
        error: {
          code: 'coach_access',
          message: 'Sign in again to request an AI explanation. Verified facts still work.',
          retryable: false,
        },
        analysis: verifiedAnalysis,
      }, { status: 401 });
    }
    const safetyId = await safetyIdentifier(userId);
    const { data: quotaData, error: quotaError } = await context.supabaseAdmin.rpc('claim_coach_review_slot', {
      p_user_id: userId,
    });
    const claim = quotaClaim(Array.isArray(quotaData) ? quotaData[0] : quotaData);
    if (quotaError || !claim) {
      console.error('Coach quota claim failed', { code: quotaError?.code ?? 'invalid_rpc_response' });
      return Response.json({
        error: {
          code: 'quota_unavailable',
          message: 'The AI coach could not verify today’s allowance. Try again shortly.',
          retryable: true,
        },
        analysis: verifiedAnalysis,
      }, { status: 503 });
    }

    const quota = quotaFromClaim(claim);
    if (!claim.allowed) {
      return Response.json({
        error: {
          code: 'daily_limit',
          message: 'You’ve used today’s 20 AI reviews. Verified facts are still available below.',
          retryable: false,
        },
        analysis: verifiedAnalysis,
        quota,
      }, { status: 429 });
    }

    const requestStartedAt = Date.now();
    const requestBody = {
      model,
      store: false,
      reasoning: { effort: reasoningEffort },
      max_output_tokens: 700,
      safety_identifier: safetyId,
      instructions: [
        'You are RiverMind, a rigorous Texas Hold’em study coach.',
        'Review only the supplied hand facts. Do not invent hidden cards, stack sizes, solver frequencies, or action sizes.',
        'The verifiedAnalysis object was computed deterministically. Treat its card classifications, possible hand categories, legal actions, pot odds, SPR, and draw counts as authoritative.',
        'Never recalculate, contradict, or replace a verified numeric or card fact. Never claim a hand category is possible when finalBoardTexture or opponentPossibleHandCategories rules it out.',
        'Named draw outs can overlap and are not guaranteed winning outs. Respect the interpretationLimits and qualify conclusions that require an opponent range not supplied.',
        'Explain expected-value logic in plain language. Distinguish a confident conclusion from a close mixed decision.',
        'Grade the decision process, never the hand result: strong means strategically sound, close means mixed or a small error, and mistake means a clear material error.',
        'Set focusDecisionSequence to the one-based verified hero decision that offers the most learning value, or 0 when there is no single focus decision.',
        'Choose one focusArea for session practice. Use none only when there is no meaningful recurring skill to work on.',
        'Be concise, constructive, and suitable for a player who is actively learning.',
      ].join(' '),
      input: JSON.stringify({ hand: reviewHand, verifiedAnalysis }),
      text: {
        format: {
          type: 'json_schema',
          name: 'poker_hand_review',
          strict: true,
          schema: reviewSchema,
        },
      },
    } satisfies Record<string, unknown>;

    const result = await requestOpenAIReview(apiKey, requestBody);
    const latencyMs = Math.min(120_000, Date.now() - requestStartedAt);
    if (!result.ok) {
      const releaseResult = await context.supabaseAdmin.rpc('release_coach_review_slot', {
        p_user_id: userId,
        p_latency_ms: latencyMs,
        p_error_code: result.failure.code,
      });
      const release = quotaRelease(Array.isArray(releaseResult.data) ? releaseResult.data[0] : releaseResult.data);
      const quotaRefunded = !releaseResult.error && release?.released === true;
      const responseQuota = release ? quotaFromRelease(release) : quota;
      if (releaseResult.error || !release) {
        console.error('Coach quota refund failed', { code: releaseResult.error?.code ?? 'invalid_rpc_response' });
      } else if (!release.released) {
        console.warn('Coach quota refund found no pending claim', { latencyMs });
      }
      const responseHeaders = result.failure.retryAfterMs === undefined
        ? undefined
        : { 'Retry-After': String(Math.max(1, Math.ceil(result.failure.retryAfterMs / 1_000))) };
      return Response.json({
        error: {
          code: result.failure.code,
          message: result.failure.message,
          retryable: result.failure.retryable,
          ...(result.failure.retryAfterMs === undefined ? {} : { retryAfterMs: result.failure.retryAfterMs }),
        },
        analysis: verifiedAnalysis,
        quota: responseQuota,
        quotaRefunded,
        latencyMs,
      }, { status: result.failure.httpStatus, headers: responseHeaders });
    }

    const recordResult = await context.supabaseAdmin.rpc('record_coach_review_result', {
      p_user_id: userId,
      p_succeeded: true,
      p_latency_ms: latencyMs,
      p_error_code: null,
    });
    if (recordResult.error) {
      console.error('Coach usage result recording failed', { code: recordResult.error.code });
    }

    console.info('OpenAI coach review completed', {
      requestId: result.requestId,
      attempts: result.attempts,
      latencyMs,
      model: result.payload.model ?? model,
    });
    return Response.json({
      review: result.review,
      analysis: verifiedAnalysis,
      model: result.payload.model ?? model,
      reasoningEffort,
      analysisVersion: verifiedAnalysis.version,
      usage: result.payload.usage ?? null,
      quota,
      latencyMs,
      attempts: result.attempts,
    });
  }),
};
