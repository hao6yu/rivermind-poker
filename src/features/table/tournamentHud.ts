import type { MultiwayHandState } from '../../domain/poker/multiway';
import {
  sitAndGoBlindLevel,
  sitAndGoRemainingPlayerIds,
  type SitAndGoBlindSpeed,
  type SitAndGoStructureId,
} from '../../domain/poker/tournament';

/**
 * B2: the compact tournament HUD model. Everything derives from the public
 * tournament state already on the table — no new engine surfaces. The
 * provisional place is a chips-in-play rank RIGHT NOW and is never presented
 * as a guaranteed finishing place; the finishing place only exists once the
 * tournament completes (`sitAndGoHeroPlace`).
 *
 * P2 (v1.3 review): during a live hand, an all-in player has zero chips
 * behind but is still competing, so remaining counts come from tournament
 * participation at a settled boundary (`sitAndGoRemainingPlayerIds`), the
 * provisional rank reads chips in play (stack plus this hand's committed
 * chips) instead of dropping on every bet, and equal holdings share a place —
 * the drawer numbering matches the headline rule.
 */

export interface TournamentHudStanding {
  isViewer: boolean;
  name: string;
  playerId: string;
  /** Chips behind right now; zero for an all-in player who is still live. */
  stack: number;
  /** Chips in play: the settled stack after the hand, stack + committed during it. */
  chips: number;
  /** Settled out of the tournament; never true for a live all-in player. */
  eliminated: boolean;
  /** Shared place by chips in play; equal holdings share the same number. */
  place: number;
}

export interface TournamentHudModel {
  bigBlind: number;
  /** Bubble when exactly one more elimination decides qualification; heads-up at two. */
  milestone: 'bubble' | 'headsUp' | null;
  /** Hands left in the current blind level; null on the final level. */
  handsToNextLevel: number | null;
  playerCount: number;
  playersRemaining: number;
  provisionalPlace: number;
  qualifyingPlace: number | null;
  smallBlind: number;
  standings: TournamentHudStanding[];
}

export interface TournamentHudInput {
  game: MultiwayHandState;
  handNumber: number;
  playerCount: number;
  qualifyingPlace?: number | null;
  structureId: SitAndGoStructureId;
  blindSpeed: SitAndGoBlindSpeed;
  viewerPlayerId?: string;
}

/** Equal holdings share a provisional place, mirroring the session-summary rule. */
export function buildTournamentHud(input: TournamentHudInput): TournamentHudModel {
  const { blindSpeed, game, handNumber, playerCount, qualifyingPlace, structureId, viewerPlayerId = 'hero' } = input;
  const level = sitAndGoBlindLevel(handNumber, structureId, blindSpeed);
  const playersRemaining = sitAndGoRemainingPlayerIds(game).length;
  const settled = game.outcome != null;
  const standings: TournamentHudStanding[] = game.tablePlayerIds
    .map((playerId) => {
      const player = game.players[playerId];
      const stack = player?.stack ?? 0;
      // During a live hand the committed chips are still this player's — an
      // all-in seat must not rank last on chips it can still win back.
      const chips = settled ? stack : stack + (player?.totalCommitted ?? 0);
      return {
        chips,
        eliminated: stack === 0 && (settled || (player?.totalCommitted ?? 0) === 0),
        isViewer: playerId === viewerPlayerId,
        name: player?.name ?? playerId,
        playerId,
        // Shared places are stamped below, after the rank sort.
        place: 0,
        stack,
      };
    })
    .sort((left, right) => right.chips - left.chips || left.playerId.localeCompare(right.playerId));
  let previousChips: number | null = null;
  let previousPlace = 0;
  standings.forEach((row, index) => {
    const place = previousChips === row.chips ? previousPlace : index + 1;
    previousChips = row.chips;
    previousPlace = place;
    row.place = place;
  });
  const viewerChips = standings.find((row) => row.isViewer)?.chips
    ?? (game.players[viewerPlayerId]?.stack ?? 0);
  const richer = standings.filter((row) => row.chips > viewerChips).length;
  const provisionalPlace = richer + 1;
  let milestone: TournamentHudModel['milestone'] = null;
  if (qualifyingPlace != null && playersRemaining === qualifyingPlace + 1) milestone = 'bubble';
  if (playersRemaining === 2) milestone = 'headsUp';
  return {
    bigBlind: level.bigBlind,
    handsToNextLevel: level.lastHand === null ? null : Math.max(0, level.lastHand - handNumber + 1),
    milestone,
    playerCount,
    playersRemaining,
    provisionalPlace,
    qualifyingPlace: qualifyingPlace ?? null,
    smallBlind: level.smallBlind,
    standings,
  };
}
