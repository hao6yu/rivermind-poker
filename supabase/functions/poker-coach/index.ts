import { withSupabase } from '@supabase/server';
import {
  analyzeCoachHand,
  cardsMatch,
  parseCardLabel,
  parseCoachAnalysisInput,
  type CoachAnalysisInput,
} from '../../../src/domain/poker/analysis.ts';
import { isCoachReview } from '../../../src/domain/poker/coaching.ts';

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

function extractOutputText(response: OpenAIResponse): string | null {
  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text) return content.text;
      if (content.type === 'refusal' && content.refusal) throw new Error('The review request was refused.');
    }
  }
  return null;
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

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return Response.json({ error: 'Poker coach is not configured.' }, { status: 503 });

    const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-5.6-terra';
    const reasoningEffort = getReasoningEffort();
    if (!reasoningEffort) {
      console.error('Unsupported OPENAI_REASONING_EFFORT. Expected low or medium.');
      return Response.json({ error: 'Poker coach reasoning is not configured.' }, { status: 503 });
    }
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
    const { analysisInput: _analysisInput, ...reviewHand } = hand;
    const userId = String(context.userClaims?.sub ?? 'anonymous');
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: reasoningEffort },
        max_output_tokens: 700,
        safety_identifier: await safetyIdentifier(userId),
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
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!response.ok) {
      console.error('OpenAI request failed', { status: response.status, requestId: response.headers.get('x-request-id') });
      return Response.json({ error: 'The AI coach could not complete the review.' }, { status: 502 });
    }

    const payload = await response.json() as OpenAIResponse;
    const outputText = extractOutputText(payload);
    if (!outputText || payload.status !== 'completed') {
      return Response.json({ error: 'The AI coach returned an incomplete review.' }, { status: 502 });
    }

    try {
      const review = JSON.parse(outputText);
      if (!isCoachReview(review)) {
        return Response.json({ error: 'The AI coach returned an invalid review.' }, { status: 502 });
      }
      return Response.json({
        review,
        analysis: verifiedAnalysis,
        model: payload.model ?? model,
        reasoningEffort,
        analysisVersion: verifiedAnalysis.version,
        usage: payload.usage ?? null,
      });
    } catch {
      return Response.json({ error: 'The AI coach returned an unreadable review.' }, { status: 502 });
    }
  }),
};
