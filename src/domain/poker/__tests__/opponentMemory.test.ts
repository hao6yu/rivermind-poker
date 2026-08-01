import { describe, expect, it } from 'vitest';

import { seededRandom } from '../cards';
import { applyAction, createHand } from '../engine';
import { applyMultiwayAction, createMultiwayHand, type TablePlayerConfig } from '../multiway';
import {
  applyOpponentObservation,
  buildOpponentAdaptation,
  createEmptyOpponentMemory,
  describeOpponentRead,
  isOpponentMemory,
  observePublicHeadsUpHand,
  observePublicMultiwayHand,
  type HeroHandObservation,
  type OpponentMemory,
} from '../opponentMemory';

function repeatObservation(observation: HeroHandObservation, hands: number): OpponentMemory {
  let memory = createEmptyOpponentMemory();
  for (let index = 0; index < hands; index += 1) {
    memory = applyOpponentObservation(memory, observation, `2026-08-01T00:00:${String(index).padStart(2, '0')}Z`);
  }
  return memory;
}

describe('opponent memory', () => {
  it('starts neutral and makes no adjustment before observing a hand', () => {
    const memory = createEmptyOpponentMemory();
    const adaptation = buildOpponentAdaptation(memory);

    expect(describeOpponentRead(memory).title).toBe('Still learning your game');
    expect(adaptation).toEqual({
      bluffFrequencyScale: 1,
      callToleranceDelta: 0,
      confidence: 0,
      pressureFrequencyScale: 1,
      raiseSizeScale: 1,
      valueFrequencyScale: 1,
      valueThresholdDelta: 0,
    });
    expect(isOpponentMemory(memory)).toBe(true);
  });

  it('learns gradually from repeated public folds and caps exploitative pressure', () => {
    const observation: HeroHandObservation = {
      actions: [
        { facingBet: false, street: 'preflop', type: 'call' },
        { facingBet: true, street: 'flop', type: 'fold' },
      ],
      position: 'late',
    };
    const early = repeatObservation(observation, 2);
    const established = repeatObservation(observation, 30);

    expect(describeOpponentRead(early).title).toBe('Still learning your game');
    expect(describeOpponentRead(established).title).toBe('Folds under pressure');
    expect(buildOpponentAdaptation(early).bluffFrequencyScale).toBeLessThan(1.03);
    expect(buildOpponentAdaptation(established).bluffFrequencyScale).toBeGreaterThan(1.08);
    expect(buildOpponentAdaptation(established).bluffFrequencyScale).toBeLessThanOrEqual(1.14);
  });

  it('reduces bluffs and value-bets more directly against repeated calls', () => {
    const memory = repeatObservation({
      actions: [
        { facingBet: false, street: 'preflop', type: 'call' },
        { facingBet: true, street: 'flop', type: 'call' },
        { facingBet: true, street: 'turn', type: 'call' },
      ],
      position: 'blind',
    }, 24);
    const read = describeOpponentRead(memory);
    const adaptation = buildOpponentAdaptation(memory);

    expect(read.title).toBe('Calls pressure often');
    expect(adaptation.bluffFrequencyScale).toBeLessThan(1);
    expect(adaptation.valueFrequencyScale).toBeGreaterThan(1);
    expect(adaptation.valueThresholdDelta).toBeLessThan(0);
  });

  it('keeps an effective recent window so a changed style can replace an old read', () => {
    const folding: HeroHandObservation = {
      actions: [
        { facingBet: false, street: 'preflop', type: 'call' },
        { facingBet: true, street: 'flop', type: 'fold' },
      ],
      position: 'late',
    };
    const calling: HeroHandObservation = {
      actions: [
        { facingBet: false, street: 'preflop', type: 'call' },
        { facingBet: true, street: 'flop', type: 'call' },
        { facingBet: true, street: 'turn', type: 'call' },
      ],
      position: 'late',
    };
    let memory = repeatObservation(folding, 100);
    for (let hand = 0; hand < 180; hand += 1) {
      memory = applyOpponentObservation(memory, calling);
    }

    expect(describeOpponentRead(memory).title).toBe('Calls pressure often');
    expect(memory.preflopOpportunities).toBeLessThanOrEqual(80);
    expect(memory.handsObserved).toBe(280);
  });

  it('extracts a card-free heads-up observation from recorded decision context', () => {
    let game = createHand({ button: 'hero', random: seededRandom(41) });
    game = applyAction(game, 'hero', { type: 'raise', amount: 60 });
    game = applyAction(game, 'villain', { type: 'raise', amount: 120 });
    game = applyAction(game, 'hero', { type: 'fold' });
    const observation = observePublicHeadsUpHand(game);

    expect(observation).toEqual({
      actions: [
        { facingBet: true, street: 'preflop', type: 'raise' },
        { facingBet: true, street: 'preflop', type: 'fold' },
      ],
      position: 'late',
    });
    expect(JSON.stringify(observation)).not.toMatch(/holeCards|deck|board|rank|suit/);
  });

  it('reconstructs public multiway pressure without inspecting any private cards', () => {
    const players: TablePlayerConfig[] = [
      { id: 'hero', isHero: true, name: 'You', seat: 0, stack: 1_000 },
      { id: 'ai-1', name: 'Mara', seat: 1, stack: 1_000 },
      { id: 'ai-2', name: 'Theo', seat: 2, stack: 1_000 },
    ];
    let game = createMultiwayHand({ buttonSeat: 1, players, random: seededRandom(42) });
    game = applyMultiwayAction(game, 'ai-1', { type: 'raise', amount: 60 });
    game = applyMultiwayAction(game, 'ai-2', { type: 'fold' });
    game = applyMultiwayAction(game, 'hero', { type: 'raise', amount: 140 });
    game = applyMultiwayAction(game, 'ai-1', { type: 'fold' });
    const observation = observePublicMultiwayHand(game);

    expect(observation.actions).toEqual([
      { facingBet: true, street: 'preflop', type: 'raise' },
    ]);
    expect(observation.position).toBe('blind');
    expect(JSON.stringify(observation)).not.toMatch(/holeCards|deck|board|rank|suit/);
  });
});
