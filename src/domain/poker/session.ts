import type { CoachFocusArea, CoachHandGrade, CoachReview, GameState } from './types';

export const STARTING_STACK_OPTIONS = [40, 100, 200] as const;
export const SESSION_HAND_TARGET_OPTIONS = [1, 5, 10, 'open'] as const;

/**
 * The blind every practice cash table is dealt at. Starting stacks are stored as
 * a big-blind multiple, but nothing a player reads is quoted that way — screens
 * multiply by this to show chips, so the setup screen and the felt agree.
 */
export const CASH_GAME_BIG_BLIND = 20;

export type StartingStackBb = typeof STARTING_STACK_OPTIONS[number];
/** Two hands is reserved for Quick Play's fair heads-up orbit. */
export type SessionHandTarget = typeof SESSION_HAND_TARGET_OPTIONS[number] | 2;
export type SessionCompletionReason = 'target' | 'hero_bust' | 'villain_bust';

export interface PracticeSessionConfig {
  startingStackBb: StartingStackBb;
  handTarget: SessionHandTarget;
}

export interface PracticeSessionSummary {
  handsPlayed: number;
  heroWins: number;
  villainWins: number;
  ties: number;
  reviewedHands: number;
  netBb: number;
  topFocusArea: CoachSessionStats['topFocusArea'];
}

export const QUICK_PLAY_SESSION_CONFIG: PracticeSessionConfig = {
  startingStackBb: 100,
  // One complete heads-up orbit: each player gets the button once. If the AI
  // folds its first small blind, Quick Play still reaches a player decision on
  // hand two instead of ending the session before the player can act.
  handTarget: 2,
};

export const DEFAULT_CUSTOM_SESSION_CONFIG: PracticeSessionConfig = {
  startingStackBb: 100,
  handTarget: 5,
};

export interface CoachSessionStats {
  reviewedHands: number;
  grades: Record<CoachHandGrade, number>;
  focusCounts: Record<CoachFocusArea, number>;
  topFocusArea: Exclude<CoachFocusArea, 'none'> | null;
}

export function sessionStartingChips(config: PracticeSessionConfig, bigBlind: number): number {
  return config.startingStackBb * bigBlind;
}

export function sessionHandTargetLabel(target: SessionHandTarget): string {
  if (target === 'open') return 'Open-ended';
  return `${target} ${target === 1 ? 'hand' : 'hands'}`;
}

export function sessionCompletionReason(
  game: GameState,
  config: PracticeSessionConfig,
): SessionCompletionReason | null {
  if (!game.outcome) return null;
  // Two hands is the reserved Quick Play orbit. Even if the first hand ends
  // with a bust, reload both seats for the opposite-button hand instead of
  // breaking the product promise after only one deal.
  if (config.handTarget === 2 && game.handNumber < 2) return null;
  if (game.players.hero.stack < game.bigBlind) return 'hero_bust';
  if (game.players.villain.stack < game.bigBlind) return 'villain_bust';
  if (config.handTarget !== 'open' && game.handNumber >= config.handTarget) return 'target';
  return null;
}

export function summarizePracticeSession(
  games: readonly GameState[],
  reviews: readonly CoachReview[],
  config: PracticeSessionConfig,
  bigBlind: number,
): PracticeSessionSummary {
  const completedGames = games.filter((game) => Boolean(game.outcome));
  const heroWins = completedGames.filter((game) => game.outcome?.winner === 'hero').length;
  const villainWins = completedGames.filter((game) => game.outcome?.winner === 'villain').length;
  const ties = completedGames.filter((game) => game.outcome?.winner === 'tie').length;
  const finalHeroStack = completedGames[completedGames.length - 1]?.players.hero.stack
    ?? sessionStartingChips(config, bigBlind);
  const netBb = Math.round(((finalHeroStack - sessionStartingChips(config, bigBlind)) / bigBlind) * 10) / 10;
  const coachStats = summarizeCoachSession(reviews);

  return {
    handsPlayed: completedGames.length,
    heroWins,
    villainWins,
    ties,
    reviewedHands: coachStats.reviewedHands,
    netBb,
    topFocusArea: coachStats.topFocusArea,
  };
}

const focusAreas: CoachFocusArea[] = [
  'preflop',
  'value-betting',
  'bluffing',
  'calling',
  'bet-sizing',
  'pot-odds',
  'draws',
  'none',
];

export function summarizeCoachSession(reviews: readonly CoachReview[]): CoachSessionStats {
  const grades: CoachSessionStats['grades'] = { strong: 0, close: 0, mistake: 0 };
  const focusCounts = Object.fromEntries(focusAreas.map((area) => [area, 0])) as CoachSessionStats['focusCounts'];
  for (const review of reviews) {
    grades[review.handGrade] += 1;
    focusCounts[review.focusArea] += 1;
  }
  const rankedFocusAreas = focusAreas
    .filter((area): area is Exclude<CoachFocusArea, 'none'> => area !== 'none')
    .map((area, order) => ({ area, count: focusCounts[area], order }))
    .filter(({ count }) => count > 0)
    .sort((left, right) => right.count - left.count || left.order - right.order);
  return {
    reviewedHands: reviews.length,
    grades,
    focusCounts,
    topFocusArea: rankedFocusAreas[0]?.area ?? null,
  };
}

export function coachFocusLabel(focusArea: CoachFocusArea): string {
  const labels: Record<CoachFocusArea, string> = {
    none: 'No recurring leak',
    preflop: 'Preflop decisions',
    'value-betting': 'Value betting',
    bluffing: 'Bluffing',
    calling: 'Calling decisions',
    'bet-sizing': 'Bet sizing',
    'pot-odds': 'Pot odds',
    draws: 'Playing draws',
  };
  return labels[focusArea];
}
