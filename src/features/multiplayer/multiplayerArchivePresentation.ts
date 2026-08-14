import type { MultiplayerHandArchive } from '../../domain/multiplayer/contracts';
import type {
  MultiwayHandOutcome,
  MultiwayHandState,
  MultiwayPlayerState,
} from '../../domain/poker/multiway';
import type { MultiwaySessionHandRecord } from '../table/sessionModels';

function mapRecordKeys<T>(
  source: Readonly<Record<string, T>>,
  playerId: (value: string) => string,
  mapValue: (value: T) => T = (value) => value,
): Record<string, T> {
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [
    playerId(key),
    mapValue(value),
  ]));
}

function normalizedOutcome(
  outcome: MultiwayHandOutcome | undefined,
  playerId: (value: string) => string,
): MultiwayHandOutcome | undefined {
  if (!outcome) return undefined;
  return {
    ...outcome,
    awards: outcome.awards.map((award) => ({
      ...award,
      eligiblePlayerIds: award.eligiblePlayerIds.map(playerId),
      shares: mapRecordKeys(award.shares, playerId),
      winnerPlayerIds: award.winnerPlayerIds.map(playerId),
    })),
    handDescriptions: outcome.handDescriptions
      ? mapRecordKeys(outcome.handDescriptions, playerId)
      : undefined,
    winnerPlayerIds: outcome.winnerPlayerIds.map(playerId),
  };
}

/**
 * Existing replay and decision-grading views intentionally use the local
 * `hero` identifier. Multiplayer uses opaque per-room player ids, so this
 * adapter creates a fresh viewer-relative hand without changing the archived
 * redaction boundary or mutating the server payload.
 */
export function multiplayerArchiveToSessionHand(
  archive: MultiplayerHandArchive,
): MultiwaySessionHandRecord | null {
  const source = archive.hand;
  if (!source.outcome || source.deck.length > 0 || !source.players[archive.viewerPlayerId]) return null;

  const occupiedIds = new Set(source.tablePlayerIds);
  const playerId = (value: string): string => {
    if (value === archive.viewerPlayerId) return 'hero';
    // Opaque production ids never use this value, but keep the adapter total
    // for imported fixtures and future server versions.
    if (value === 'hero' && occupiedIds.has('hero')) return 'opponent:hero';
    return value;
  };
  const players = Object.fromEntries(source.tablePlayerIds.map((sourceId) => {
    const player = source.players[sourceId];
    if (!player) throw new Error(`Archived player ${sourceId} is missing.`);
    const id = playerId(sourceId);
    return [id, {
      ...player,
      holeCards: [...player.holeCards],
      id,
      isHero: sourceId === archive.viewerPlayerId,
    } satisfies MultiwayPlayerState];
  }));

  const game: MultiwayHandState = {
    ...source,
    actedAtBet: mapRecordKeys(source.actedAtBet, playerId),
    activePlayerIds: source.activePlayerIds.map(playerId),
    bigBlindPlayerId: playerId(source.bigBlindPlayerId),
    board: [...source.board],
    buttonPlayerId: playerId(source.buttonPlayerId),
    dealOrder: source.dealOrder.map(playerId),
    deck: [],
    history: source.history.map((action) => ({
      ...action,
      decisionContext: action.decisionContext ? {
        ...action.decisionContext,
        board: [...action.decisionContext.board],
        legalActions: { ...action.decisionContext.legalActions },
      } : undefined,
      playerId: playerId(action.playerId),
    })),
    outcome: normalizedOutcome(source.outcome, playerId),
    pending: source.pending.map(playerId),
    players,
    postflopActionOrder: source.postflopActionOrder.map(playerId),
    preflopActionOrder: source.preflopActionOrder.map(playerId),
    smallBlindPlayerId: playerId(source.smallBlindPlayerId),
    tablePlayerIds: source.tablePlayerIds.map(playerId),
    toAct: source.toAct ? playerId(source.toAct) : null,
  };

  return {
    clientId: `multiplayer:${archive.roomId}:session:${archive.sessionNumber}:hand:${source.handNumber}`,
    coachResult: null,
    completedAt: new Date(archive.completedAtMs).toISOString(),
    game,
    mode: 'multiway',
  };
}

export function multiplayerArchivesToSessionHands(
  archives: readonly MultiplayerHandArchive[],
): MultiwaySessionHandRecord[] {
  return archives.flatMap((archive) => {
    const record = multiplayerArchiveToSessionHand(archive);
    return record ? [record] : [];
  });
}
