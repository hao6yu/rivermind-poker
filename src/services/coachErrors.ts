import type { VerifiedHandAnalysis } from '../domain/poker/analysis';

export interface CoachQuota {
  limit: number;
  remaining: number;
  resetsAt: string;
}

export type CoachRequestErrorCode =
  | 'coach_access'
  | 'coach_billing'
  | 'coach_configuration'
  | 'coach_invalid_response'
  | 'coach_network'
  | 'coach_rate_limited'
  | 'coach_refused'
  | 'coach_timeout'
  | 'coach_unavailable'
  | 'daily_limit'
  | 'quota_unavailable';

interface CoachErrorOptions {
  analysis?: VerifiedHandAnalysis;
  quota?: CoachQuota;
  quotaRefunded?: boolean;
  retryAfterMs?: number;
}

export class CoachRequestError extends Error {
  readonly code: CoachRequestErrorCode;
  readonly retryable: boolean;
  readonly analysis?: VerifiedHandAnalysis;
  readonly quota?: CoachQuota;
  readonly quotaRefunded: boolean;
  readonly retryAfterMs?: number;

  constructor(code: CoachRequestErrorCode, message: string, retryable: boolean, options: CoachErrorOptions = {}) {
    super(message);
    this.name = 'CoachRequestError';
    this.code = code;
    this.retryable = retryable;
    this.analysis = options.analysis;
    this.quota = options.quota;
    this.quotaRefunded = options.quotaRefunded === true;
    this.retryAfterMs = options.retryAfterMs;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isVerifiedAnalysis(value: unknown): value is VerifiedHandAnalysis {
  if (!isRecord(value)) return false;
  return value.version === 1
    && value.source === 'deterministic-poker-engine'
    && Array.isArray(value.heroCards)
    && Array.isArray(value.finalBoard)
    && Array.isArray(value.decisions)
    && Array.isArray(value.interpretationLimits);
}

export function parseCoachQuota(value: unknown): CoachQuota | undefined {
  if (!isRecord(value)) return undefined;
  if (!Number.isInteger(value.limit) || !Number.isInteger(value.remaining)) return undefined;
  if (typeof value.resetsAt !== 'string' || !Number.isFinite(Date.parse(value.resetsAt))) return undefined;
  const limit = value.limit as number;
  const remaining = value.remaining as number;
  if (limit < 1 || remaining < 0 || remaining > limit) return undefined;
  return { limit, remaining, resetsAt: value.resetsAt };
}

const knownErrorCodes: CoachRequestErrorCode[] = [
  'coach_access',
  'coach_billing',
  'coach_configuration',
  'coach_invalid_response',
  'coach_network',
  'coach_rate_limited',
  'coach_refused',
  'coach_timeout',
  'coach_unavailable',
  'daily_limit',
  'quota_unavailable',
];

export function parseCoachErrorResponse(value: unknown): CoachRequestError | null {
  if (!isRecord(value) || !isRecord(value.error)) return null;
  const code = value.error.code;
  const message = value.error.message;
  const retryable = value.error.retryable;
  if (!knownErrorCodes.includes(code as CoachRequestErrorCode)) return null;
  if (typeof message !== 'string' || typeof retryable !== 'boolean') return null;
  const retryAfterMs = typeof value.error.retryAfterMs === 'number' && Number.isFinite(value.error.retryAfterMs)
    ? Math.max(0, value.error.retryAfterMs)
    : undefined;
  return new CoachRequestError(code as CoachRequestErrorCode, message, retryable, {
    analysis: isVerifiedAnalysis(value.analysis) ? value.analysis : undefined,
    quota: parseCoachQuota(value.quota),
    quotaRefunded: value.quotaRefunded === true,
    retryAfterMs,
  });
}
