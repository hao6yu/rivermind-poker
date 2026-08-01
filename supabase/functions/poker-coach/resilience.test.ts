import { describe, expect, it } from 'vitest';

import {
  classifyOpenAIFailure,
  parseRetryAfterMs,
  retryDelayMs,
  shouldRetryInternally,
  timeoutFailure,
} from './resilience';

describe('coach proxy resilience', () => {
  it('retries genuine rate limits with a bounded Retry-After delay', () => {
    const failure = classifyOpenAIFailure(429, 'rate_limit_exceeded', '1.5');
    expect(failure.code).toBe('coach_rate_limited');
    expect(failure.retryable).toBe(true);
    expect(failure.retryAfterMs).toBe(1_500);
    expect(shouldRetryInternally(failure, 0)).toBe(true);
    expect(shouldRetryInternally(failure, 1)).toBe(false);
    expect(retryDelayMs(failure)).toBe(1_500);
  });

  it('does not retry billing, quota, credential, or access failures', () => {
    expect(classifyOpenAIFailure(429, 'credit_balance_exhausted', null)).toMatchObject({
      code: 'coach_billing', retryable: false,
    });
    expect(classifyOpenAIFailure(429, 'organization_usage_limit_reached', null)).toMatchObject({
      code: 'coach_billing', retryable: false,
    });
    expect(classifyOpenAIFailure(401, 'invalid_api_key', null).retryable).toBe(false);
    expect(classifyOpenAIFailure(403, 'model_not_allowed', null).retryable).toBe(false);
  });

  it('retries one transient server failure without duplicating a timed-out request', () => {
    const unavailable = classifyOpenAIFailure(503, null, null);
    expect(shouldRetryInternally(unavailable, 0)).toBe(true);
    expect(retryDelayMs(unavailable, () => 0)).toBe(350);
    expect(shouldRetryInternally(timeoutFailure(), 0)).toBe(false);
  });

  it('parses HTTP-date Retry-After values', () => {
    expect(parseRetryAfterMs('Thu, 01 Jan 2026 00:00:03 GMT', Date.parse('2026-01-01T00:00:00Z'))).toBe(3_000);
  });
});
