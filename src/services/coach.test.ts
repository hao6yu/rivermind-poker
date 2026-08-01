import { describe, expect, it } from 'vitest';

import { parseCoachErrorResponse } from './coachErrors';

const analysis = {
  version: 1,
  source: 'deterministic-poker-engine',
  heroCards: ['A♠', 'K♠'],
  finalBoard: [],
  decisions: [],
  interpretationLimits: [],
};

describe('coach error responses', () => {
  it('preserves retry, quota, and deterministic fallback details', () => {
    const error = parseCoachErrorResponse({
      error: {
        code: 'coach_rate_limited',
        message: 'The AI coach is busy.',
        retryable: true,
        retryAfterMs: 1_500,
      },
      analysis,
      quota: { limit: 20, remaining: 14, resetsAt: '2026-08-02T00:00:00Z' },
    });

    expect(error).toMatchObject({
      code: 'coach_rate_limited',
      retryable: true,
      retryAfterMs: 1_500,
      quota: { limit: 20, remaining: 14 },
      analysis: { source: 'deterministic-poker-engine' },
    });
  });

  it('rejects unrecognized or malformed error envelopes', () => {
    expect(parseCoachErrorResponse({ error: 'bad gateway' })).toBeNull();
    expect(parseCoachErrorResponse({
      error: { code: 'surprise', message: 'Nope', retryable: true },
    })).toBeNull();
  });
});
