import { describe, expect, it, vi } from 'vitest';
import { multiplayerCommandNeedsLiveness, prepareMultiplayerCommandLiveness } from './liveness';

describe('verified liveness before coordinator mutation', () => {
  it.each(['start', 'deal-now', 'tick', 'rematch'] as const)('reads liveness for %s, not just automatic ticks', async (type) => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: [{ user_id: 'host', renewed_at_ms: 20000 }, { user_id: 'silent', renewed_at_ms: 1000 }], error: null });
    expect(multiplayerCommandNeedsLiveness(type)).toBe(true);
    expect(await prepareMultiplayerCommandLiveness({ rpc }, 'room', 'host', 20000, type))
      .toEqual({ host: 20000, silent: 1000 });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['multiplayer_renew_seat_liveness', 'multiplayer_load_seat_liveness']);
  });

  it.each([
    { data: null, error: { code: '57014' } },
    { data: null, error: null },
    { data: [], error: null },
    { data: [{ user_id: 'host', renewed_at_ms: 19999 }], error: null },
    { data: [{ user_id: 'host', renewed_at_ms: '20000' }], error: null },
    { data: [{ user_id: 'host', renewed_at_ms: 20000 }, null], error: null },
    { data: [{ user_id: 'host', renewed_at_ms: 20000 }, { user_id: 'host', renewed_at_ms: 20000 }], error: null },
  ])('refuses unavailable or inconsistent reads without returning an absent map: %j', async (read) => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce(read);
    await expect(prepareMultiplayerCommandLiveness({ rpc }, 'room', 'host', 20000, 'tick'))
      .rejects.toThrow('Seat liveness could not be verified.');
  });

  it.each([{ data: false, error: null }, { data: null, error: { code: 'XX000' } }])('refuses failed renewal before reading or acting', async (renewal) => {
    const rpc = vi.fn().mockResolvedValue(renewal);
    await expect(prepareMultiplayerCommandLiveness({ rpc }, 'room', 'host', 20000, 'deal-now')).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('also fails closed when the RPC rejects instead of returning an error object', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('network unavailable'));
    await expect(prepareMultiplayerCommandLiveness({ rpc }, 'room', 'host', 20000, 'tick')).rejects.toThrow('Seat liveness could not be verified.');
  });
});
