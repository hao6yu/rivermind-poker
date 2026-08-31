import type {
  MultiplayerCoordinatorState,
  MultiplayerHandArchive,
} from './contracts.ts';

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasOwn(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function containsPrivateIdentifier(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsPrivateIdentifier);
  const source = record(value);
  if (!source) return false;
  if (hasOwn(source, 'userId') || hasOwn(source, 'roomCode')) return true;
  return Object.values(source).some(containsPrivateIdentifier);
}

/**
 * Parses the privacy boundary used by both the mobile client and Edge
 * Function. This intentionally verifies redaction in addition to envelope
 * shape so a malformed backend response cannot reveal folded cards or another
 * player's private decision context.
 */
export function parseMultiplayerHandArchive(value: unknown): MultiplayerHandArchive | null {
  const source = record(value);
  const hand = record(source?.hand);
  const players = record(hand?.players);
  const outcome = record(hand?.outcome);
  const history = Array.isArray(hand?.history) ? hand.history : null;
  const viewerPlayerId = source?.viewerPlayerId;
  const viewer = typeof viewerPlayerId === 'string'
    ? record(players?.[viewerPlayerId])
    : null;
  if (
    !source
    || !hand
    || !players
    || !outcome
    || !history
    || !viewer
    || typeof source.roomId !== 'string'
    || source.roomId.length === 0
    || typeof viewerPlayerId !== 'string'
    || viewerPlayerId.length === 0
    || !Number.isSafeInteger(source.sessionNumber)
    || (source.sessionNumber as number) < 1
    || !Number.isFinite(source.completedAtMs)
    || ![null, 'hand-limit', 'host-ended', 'last-player-standing'].includes(
      source.completionReason as null | string,
    )
    || hand.street !== 'complete'
    || !Number.isSafeInteger(hand.handNumber)
    || (hand.handNumber as number) < 1
    || !Array.isArray(hand.tablePlayerIds)
    || !hand.tablePlayerIds.includes(viewerPlayerId)
    || !Array.isArray(hand.deck)
    || hand.deck.length > 0
    || !Array.isArray(hand.pending)
    || hand.pending.length > 0
    || hand.toAct !== null
    || containsPrivateIdentifier(hand)
  ) return null;

  const showdown = outcome.showdown === true;
  for (const [playerId, playerValue] of Object.entries(players)) {
    const player = record(playerValue);
    if (
      !player
      || !Array.isArray(player.holeCards)
      || typeof player.folded !== 'boolean'
      || ![0, 2].includes(player.holeCards.length)
      || (
        playerId !== viewerPlayerId
        && player.holeCards.length > 0
        && (!showdown || player.folded === true)
      )
    ) return null;
  }

  for (const value of history) {
    const action = record(value);
    if (
      !action
      || typeof action.playerId !== 'string'
      || (action.playerId !== viewerPlayerId && hasOwn(action, 'decisionContext'))
    ) return null;
  }

  return source as unknown as MultiplayerHandArchive;
}

export function parseMultiplayerHandArchives(value: unknown): MultiplayerHandArchive[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map(parseMultiplayerHandArchive);
  return parsed.every((archive): archive is MultiplayerHandArchive => archive !== null)
    ? parsed
    : null;
}

/** True only on the authoritative transition that first settles this hand. */
export function multiplayerHandBecameArchivable(
  previous: MultiplayerCoordinatorState,
  next: MultiplayerCoordinatorState,
): boolean {
  if (!next.hand?.outcome) return false;
  return !previous.hand?.outcome
    || previous.sessionNumber !== next.sessionNumber
    || previous.hand.handNumber !== next.hand.handNumber;
}
