export type CoachFailureCode =
  | 'coach_access'
  | 'coach_billing'
  | 'coach_configuration'
  | 'coach_invalid_response'
  | 'coach_rate_limited'
  | 'coach_refused'
  | 'coach_timeout'
  | 'coach_unavailable';

export interface CoachFailure {
  code: CoachFailureCode;
  message: string;
  retryable: boolean;
  httpStatus: number;
  retryAfterMs?: number;
}

const billingCodeFragments = ['billing', 'credit', 'quota', 'spend', 'usage_limit'];

export function parseRetryAfterMs(value: string | null, nowMs = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) return undefined;
  return Math.max(0, dateMs - nowMs);
}

function isBillingLimit(code: string | null): boolean {
  const normalized = code?.toLowerCase() ?? '';
  return billingCodeFragments.some((fragment) => normalized.includes(fragment));
}

export function classifyOpenAIFailure(
  status: number,
  upstreamCode: string | null,
  retryAfterHeader: string | null,
): CoachFailure {
  if (status === 401) {
    return {
      code: 'coach_configuration',
      message: 'AI explanations are temporarily unavailable. Verified facts still work.',
      retryable: false,
      httpStatus: 503,
    };
  }
  if (status === 403) {
    return {
      code: 'coach_access',
      message: 'This AI model is not available to the coach project. Verified facts still work.',
      retryable: false,
      httpStatus: 503,
    };
  }
  if (status === 429 && isBillingLimit(upstreamCode)) {
    return {
      code: 'coach_billing',
      message: 'AI explanations are paused by the project API limit. Verified facts still work.',
      retryable: false,
      httpStatus: 503,
    };
  }
  if (status === 429) {
    return {
      code: 'coach_rate_limited',
      message: 'The AI coach is busy. Try again in a moment.',
      retryable: true,
      httpStatus: 429,
      retryAfterMs: parseRetryAfterMs(retryAfterHeader),
    };
  }
  if (status === 408 || status === 409 || status >= 500) {
    return {
      code: 'coach_unavailable',
      message: 'The AI coach is temporarily unavailable. Your verified facts are ready below.',
      retryable: true,
      httpStatus: 503,
      retryAfterMs: parseRetryAfterMs(retryAfterHeader),
    };
  }
  return {
    code: 'coach_configuration',
    message: 'AI explanations are temporarily unavailable. Verified facts still work.',
    retryable: false,
    httpStatus: 503,
  };
}

export function timeoutFailure(): CoachFailure {
  return {
    code: 'coach_timeout',
    message: 'The AI coach took too long to respond. Your verified facts are ready below.',
    retryable: true,
    httpStatus: 504,
  };
}

export function invalidResponseFailure(): CoachFailure {
  return {
    code: 'coach_invalid_response',
    message: 'The AI coach returned an incomplete explanation. Try again.',
    retryable: true,
    httpStatus: 502,
  };
}

export function refusalFailure(): CoachFailure {
  return {
    code: 'coach_refused',
    message: 'The AI coach could not explain this hand. Your verified facts are ready below.',
    retryable: false,
    httpStatus: 422,
  };
}

export function shouldRetryInternally(failure: CoachFailure, attempt: number): boolean {
  return attempt === 0
    && failure.retryable
    && failure.code !== 'coach_timeout'
    && (failure.retryAfterMs ?? 0) <= 2_000;
}

export function retryDelayMs(failure: CoachFailure, random = Math.random): number {
  if (failure.retryAfterMs !== undefined) return Math.max(0, Math.min(failure.retryAfterMs, 2_000));
  return 350 + Math.floor(random() * 251);
}
