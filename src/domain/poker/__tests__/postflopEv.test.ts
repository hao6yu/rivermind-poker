import { describe, expect, it } from 'vitest';

import { seededRandom } from '../cards';
import { createFairMultiwayDecisionState } from '../fairness';
import {
  applyMultiwayAction,
  createMultiwayHand,
  getMultiwayLegalActions,
} from '../multiway';
import { multiwayAiIdentityForSeat } from '../multiwayAiProfiles';
import { resolveMultiwayOpponentRangeIdentity } from '../multiwayEquity';
import { buildOpponentAdaptation, createEmptyOpponentMemory } from '../opponentMemory';
import {
  advancedPostflopCandidateEvs,
  estimatePostflopCandidateEv,
  type PostflopEvContext,
} from '../postflopEv';
import { buildPostflopPlan, type PostflopCandidate } from '../postflopStrategy';

const neutral = buildOpponentAdaptation(createEmptyOpponentMemory());

function context(overrides: Partial<PostflopEvContext> = {}): PostflopEvContext {
  return {
    adaptation: neutral,
    averageOpponentRangeStrength: 0.2,
    currentBet: 60,
    equity: 0.3,
    opponentCount: 1,
    playerStreetBet: 0,
    playersBehind: 0,
    pot: 100,
    street: 'turn',
    tournamentRiskPremium: 0,
    ...overrides,
  };
}

function candidate(
  type: PostflopCandidate['action']['type'],
  amount?: number,
  role: PostflopCandidate['role'] = 'defense',
  potFraction?: number,
): PostflopCandidate {
  return {
    action: amount === undefined ? { type } : { type, amount },
    detail: 'test candidate',
    headline: type,
    potFraction,
    role,
    score: 0.5,
  };
}

describe('advanced postflop action EV', () => {
  it('rejects a clearly losing call instead of using aggression as difficulty', () => {
    const fold = estimatePostflopCandidateEv(candidate('fold'), context({ equity: 0.18 }));
    const call = estimatePostflopCandidateEv(candidate('call'), context({ equity: 0.18 }));

    expect(fold.expectedValue).toBe(0);
    expect(call.expectedValue).toBeLessThan(0);
    expect(fold.utility).toBeGreaterThan(call.utility);
  });

  it('prefers building value with high range equity', () => {
    const valueContext = context({ currentBet: 0, equity: 0.82, playerStreetBet: 0, pot: 120 });
    const check = estimatePostflopCandidateEv(candidate('check', undefined, 'control'), valueContext);
    const raise = estimatePostflopCandidateEv(candidate('raise', 90, 'value', 0.75), valueContext);

    expect(raise.expectedValue).toBeGreaterThan(check.expectedValue);
    expect(raise.utility).toBeGreaterThan(check.utility);
  });

  it('reduces bluff fold equity as more live ranges remain', () => {
    const bluff = candidate('raise', 80, 'bluff', 0.75);
    const headsUp = estimatePostflopCandidateEv(bluff, context({ currentBet: 0, equity: 0.24, opponentCount: 1 }));
    const multiway = estimatePostflopCandidateEv(bluff, context({ currentBet: 0, equity: 0.24, opponentCount: 3, playersBehind: 2 }));

    expect(multiway.foldEquity).toBeLessThan(headsUp.foldEquity);
    expect(multiway.utility).toBeLessThan(headsUp.utility);
  });

  it('charges additional risk for tournament chips without changing card equity', () => {
    const valueRaise = candidate('raise', 140, 'value', 0.75);
    const chipEv = estimatePostflopCandidateEv(valueRaise, context({ equity: 0.64 }));
    const bubbleEv = estimatePostflopCandidateEv(valueRaise, context({ equity: 0.64, tournamentRiskPremium: 0.06 }));

    expect(bubbleEv.expectedValue).toBeLessThan(chipEv.expectedValue);
  });

  it('defends a little wider after a bounded read identifies persistent aggression', () => {
    const passive = estimatePostflopCandidateEv(candidate('call'), context({ equity: 0.36 }));
    const aggressiveRead = estimatePostflopCandidateEv(candidate('call'), context({
      adaptation: { ...neutral, callToleranceDelta: 0.035 },
      equity: 0.36,
    }));

    expect(aggressiveRead.expectedValue).toBeGreaterThan(passive.expectedValue);
  });

  it('models an unlisted human generically in a mixed explicit identity map', () => {
    let state = createMultiwayHand({
      buttonSeat: 0,
      players: [
        { id: 'actor', name: 'Victor', seat: 0, stack: 1_000 },
        { id: 'human', name: 'Mina', seat: 1, stack: 1_000 },
        { id: 'ai-2', name: 'Zane', seat: 2, stack: 1_000 },
      ],
      random: seededRandom(8_401),
    });
    state = applyMultiwayAction(state, 'actor', { type: 'call' });
    state = applyMultiwayAction(state, 'human', { type: 'call' });
    state = applyMultiwayAction(state, 'ai-2', { type: 'check' });
    state = applyMultiwayAction(state, 'human', { type: 'check' });
    state = applyMultiwayAction(state, 'ai-2', { type: 'check' });
    if (state.street !== 'flop' || state.toAct !== 'actor') {
      throw new Error('The mixed advanced-EV fixture did not reach the actor on the flop.');
    }

    const fair = createFairMultiwayDecisionState(state, 'actor');
    const identities = { 'ai-2': multiwayAiIdentityForSeat(2, 'sharp') };
    const human = fair.players.human;
    if (!human) throw new Error('The mixed advanced-EV fixture lost its human seat.');
    const genericHuman = resolveMultiwayOpponentRangeIdentity(human, identities);
    expect(genericHuman.id).toBe('generic-human-range');
    expect(resolveMultiwayOpponentRangeIdentity(fair.players['ai-2']!, identities).id)
      .toBe(identities['ai-2'].id);

    const legal = getMultiwayLegalActions(fair, 'actor');
    const actor = fair.players.actor!;
    const estimatedEquity = 0.47;
    const plan = buildPostflopPlan({
      bigBlind: fair.bigBlind,
      board: fair.board,
      cards: actor.holeCards,
      currentBet: fair.currentBet,
      effectiveStack: actor.stack,
      equity: estimatedEquity,
      initiative: 'none',
      legal,
      opponentCount: 2,
      playerStreetBet: actor.streetBet,
      playersBehind: 0,
      pot: fair.pot,
      street: 'flop',
    });
    const common = {
      adaptation: neutral,
      difficulty: 'elite' as const,
      estimatedEquity,
      identity: multiwayAiIdentityForSeat(0, 'elite'),
      mix: 0.5,
      plan,
      playerId: 'actor',
      state: fair,
      tournamentRiskPremium: 0,
    };
    const omittedHuman = advancedPostflopCandidateEvs({ ...common, identities });
    const explicitGenericHuman = advancedPostflopCandidateEvs({
      ...common,
      identities: { ...identities, human: genericHuman },
    });

    expect(omittedHuman).toEqual(explicitGenericHuman);
  });
});
