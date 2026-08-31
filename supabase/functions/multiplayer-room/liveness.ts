import type { MultiplayerRoomCommand } from '../../../src/domain/multiplayer/contracts.ts';

interface LivenessRpcClient {
  rpc(name: string, args: Record<string, unknown>): Promise<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
}

export class MultiplayerLivenessUnavailable extends Error {
  constructor() { super('Seat liveness could not be verified.'); }
}

export function multiplayerCommandNeedsLiveness(type: MultiplayerRoomCommand['type']): boolean {
  return ['start', 'deal-now', 'tick', 'rematch'].includes(type);
}

/**
 * A failed/invalid read is NOT a legacy room. Never let it change a forced
 * fold to Check, or let a deal use yesterday's connection flags. Called
 * before the coordinator/commit; errors leave the hand and deadline intact.
 */
export async function prepareMultiplayerCommandLiveness(
  admin: LivenessRpcClient,
  roomId: string,
  userId: string,
  nowMs: number,
  type: MultiplayerRoomCommand['type'],
): Promise<Readonly<Record<string, number>> | undefined> {
  try {
    const renewal = await admin.rpc('multiplayer_renew_seat_liveness', {
      p_room_id: roomId, p_user_id: userId, p_renewed_at_ms: nowMs,
    });
    if (renewal.error || renewal.data !== true) throw new MultiplayerLivenessUnavailable();
    if (!multiplayerCommandNeedsLiveness(type)) return undefined;
    const result = await admin.rpc('multiplayer_load_seat_liveness', { p_room_id: roomId });
    if (result.error || !Array.isArray(result.data)) throw new MultiplayerLivenessUnavailable();
    const stamps: Record<string, number> = Object.create(null);
    for (const row of result.data) {
      if (!row || typeof row !== 'object'
        || typeof row.user_id !== 'string' || row.user_id.length === 0
        || !Number.isSafeInteger(row.renewed_at_ms) || row.renewed_at_ms <= 0
        || stamps[row.user_id] !== undefined) throw new MultiplayerLivenessUnavailable();
      stamps[row.user_id] = row.renewed_at_ms;
    }
    // The preceding successful upsert MUST be visible. Empty/partial/lagged
    // reads cannot silently disconnect the caller or turn enforcement off.
    if (stamps[userId] === undefined || stamps[userId] < nowMs) {
      throw new MultiplayerLivenessUnavailable();
    }
    return stamps;
  } catch {
    // Keep RPC details, user IDs and timestamps out of the public error.
    throw new MultiplayerLivenessUnavailable();
  }
}
