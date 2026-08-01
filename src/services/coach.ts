import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';

import type { CoachReview } from '../domain/poker/types';
import type { CoachAnalysisInput, VerifiedHandAnalysis } from '../domain/poker/analysis';
import { isCoachReview } from '../domain/poker/coaching';
import {
  CoachRequestError,
  isVerifiedAnalysis,
  parseCoachErrorResponse,
  parseCoachQuota,
  type CoachQuota,
} from './coachErrors';
import { ensureAnonymousSession, supabase } from './supabase';

export { CoachRequestError } from './coachErrors';
export type { CoachQuota, CoachRequestErrorCode } from './coachErrors';

export interface HandReviewRequest {
  heroCards: string[];
  board: string[];
  street: string;
  potWon: number;
  result: string;
  actionHistory: string[];
  analysisInput: CoachAnalysisInput;
}

export interface CoachResult {
  review: CoachReview;
  analysis: VerifiedHandAnalysis;
  quota?: CoachQuota;
  latencyMs?: number;
}

interface CoachResponse extends CoachResult {
  model: string;
  analysisVersion: number;
  quota: CoachQuota;
  latencyMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function classifyFunctionError(error: unknown): Promise<CoachRequestError> {
  if (error instanceof FunctionsHttpError) {
    try {
      const parsed = parseCoachErrorResponse(await error.context.json());
      if (parsed) return parsed;
    } catch {
      // Fall through to a stable message when the proxy response is not readable JSON.
    }
    return new CoachRequestError(
      'coach_unavailable',
      'The AI coach is temporarily unavailable. Your verified facts are ready below.',
      true,
    );
  }
  if (error instanceof FunctionsFetchError) {
    const contextName = isRecord(error.context) ? error.context.name : undefined;
    const timedOut = contextName === 'AbortError' || contextName === 'TimeoutError';
    return new CoachRequestError(
      timedOut ? 'coach_timeout' : 'coach_network',
      timedOut
        ? 'The AI coach took too long to respond. Your verified facts are ready below.'
        : 'The AI coach could not connect. Check your connection and try again.',
      true,
    );
  }
  if (error instanceof FunctionsRelayError) {
    return new CoachRequestError(
      'coach_unavailable',
      'The AI coach service is temporarily unavailable. Your verified facts are ready below.',
      true,
    );
  }
  return new CoachRequestError(
    'coach_unavailable',
    'The AI coach could not complete this explanation. Your verified facts are ready below.',
    true,
  );
}

export async function requestHandReview(hand: HandReviewRequest): Promise<CoachResult> {
  await ensureAnonymousSession();
  if (!supabase) {
    throw new CoachRequestError(
      'coach_configuration',
      'AI review is not connected yet. Add the Supabase project settings to enable it.',
      false,
    );
  }

  const { data, error } = await supabase.functions.invoke<CoachResponse>('poker-coach', {
    body: hand,
    timeout: 32_000,
  });
  if (error) throw await classifyFunctionError(error);
  if (!isCoachReview(data?.review)) {
    throw new CoachRequestError('coach_invalid_response', 'The coach returned an invalid explanation.', true);
  }
  if (data.analysisVersion !== 1 || !isVerifiedAnalysis(data.analysis)) {
    throw new CoachRequestError('coach_invalid_response', 'The coach returned unverified poker facts.', true);
  }
  const quota = parseCoachQuota(data.quota);
  if (!quota) {
    throw new CoachRequestError('coach_invalid_response', 'The coach returned invalid allowance details.', true);
  }
  return {
    review: data.review,
    analysis: data.analysis,
    quota,
    latencyMs: Number.isFinite(data.latencyMs) ? Math.max(0, data.latencyMs) : undefined,
  };
}
