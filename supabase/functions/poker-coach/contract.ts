import {
  cardsMatch,
  parseCardLabel,
  parseCoachAnalysisInput,
  type CoachAnalysisInput,
} from '../../../src/domain/poker/analysis.ts';

export interface HandReviewRequest {
  heroCards: string[];
  board: string[];
  street: string;
  actionHistory: string[];
  analysisInput?: CoachAnalysisInput;
  language: 'en' | 'zh-Hans' | 'zh-Hant';
}

function isShortStringArray(value: unknown, maximumItems: number): value is string[] {
  return Array.isArray(value)
    && value.length <= maximumItems
    && value.every((item) => typeof item === 'string' && item.length <= 180);
}

function isParsedCard(card: ReturnType<typeof parseCardLabel>): card is NonNullable<ReturnType<typeof parseCardLabel>> {
  return card !== null;
}

/** Accepts the public coach contract and returns a newly constructed allowlisted payload. */
export function parseHandReview(value: unknown): HandReviewRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (!isShortStringArray(candidate.heroCards, 2) || candidate.heroCards.length !== 2) return null;
  if (!isShortStringArray(candidate.board, 5)) return null;
  if (!isShortStringArray(candidate.actionHistory, 40)) return null;
  if (typeof candidate.street !== 'string' || candidate.street.length > 20) return null;
  // Typed server allowlist. Kept explicit here (the Edge Function boundary)
  // rather than importing the full app catalog; a parity test asserts it stays
  // identical to the registry's AI_COACH_LANGUAGES list.
  const language = candidate.language ?? 'en';
  if (language !== 'en' && language !== 'zh-Hans' && language !== 'zh-Hant' && language !== 'es-419' && language !== 'pt-BR') return null;
  const heroCards = candidate.heroCards.map(parseCardLabel);
  const board = candidate.board.map(parseCardLabel);
  if (!heroCards.every(isParsedCard) || !board.every(isParsedCard)) return null;
  const knownCards = [...heroCards, ...board];
  if (new Set(knownCards.map((card) => `${card.rank}-${card.suit}`)).size !== knownCards.length) return null;

  const sanitized = {
    heroCards: [...candidate.heroCards],
    board: [...candidate.board],
    street: candidate.street,
    actionHistory: [...candidate.actionHistory],
    language,
  };
  if (candidate.analysisInput === undefined) return sanitized;
  const analysisInput = parseCoachAnalysisInput(candidate.analysisInput);
  if (!analysisInput) return null;
  if (!cardsMatch(analysisInput.heroCards, heroCards) || !cardsMatch(analysisInput.board, board)) return null;
  return { ...sanitized, analysisInput };
}
