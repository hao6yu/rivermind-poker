import { beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({
  ensureAnonymousSession: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('expo-sqlite/localStorage/install', () => ({}));
vi.mock('./supabase', () => ({
  ensureAnonymousSession: boundary.ensureAnonymousSession,
  supabase: { functions: { invoke: boundary.invoke } },
}));

import { requestHandReview, type HandReviewRequest } from './coach';

const hand = {} as HandReviewRequest;

describe('AI coach network consent boundary', () => {
  beforeEach(() => {
    boundary.ensureAnonymousSession.mockReset();
    boundary.invoke.mockReset();
  });

  it.each(['unknown', 'declined'] as const)('does not authenticate or invoke poker-coach when consent is %s', async (consent) => {
    await expect(requestHandReview(hand, consent)).rejects.toThrow(/Explicit third-party AI consent/);
    expect(boundary.ensureAnonymousSession).not.toHaveBeenCalled();
    expect(boundary.invoke).not.toHaveBeenCalled();
  });

  it('crosses the network boundary only with an explicit grant', async () => {
    boundary.invoke.mockResolvedValue({ data: null, error: null });
    await expect(requestHandReview(hand, 'granted')).rejects.toMatchObject({
      code: 'coach_invalid_response',
    });
    expect(boundary.ensureAnonymousSession).toHaveBeenCalledTimes(1);
    expect(boundary.invoke).toHaveBeenCalledTimes(1);
    expect(boundary.invoke).toHaveBeenCalledWith('poker-coach', expect.any(Object));
  });
});
