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
    expect(buildOpponentAdaptation(established).bluffFrequencyScale).toBeLessThanOrEqual(1.6);
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

  it('lets earned tiers use the same public read more precisely without unbounded exploits', () => {
    const memory = repeatObservation({
      actions: [
        { facingBet: false, street: 'preflop', type: 'raise' },
        { facingBet: true, street: 'flop', type: 'fold' },
      ],
      position: 'late',
    }, 30);
    const sharp = buildOpponentAdaptation(memory, 1);
    const elite = buildOpponentAdaptation(memory, 1.15);
    const nemesis = buildOpponentAdaptation(memory, 1.3);

    expect(elite.pressureFrequencyScale).toBeGreaterThan(sharp.pressureFrequencyScale);
    expect(nemesis.pressureFrequencyScale).toBeGreaterThanOrEqual(elite.pressureFrequencyScale);
    expect(nemesis.pressureFrequencyScale).toBeLessThanOrEqual(1.49);
    expect(Math.abs(nemesis.callToleranceDelta)).toBeLessThanOrEqual(0.1);
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

  it('does not count an unforced raise as facing a bet in multiway hands', () => {
    // Hero is the big blind. Both the button and small blind limp (call) rather than
    // raise, so when hero raises there is no prior street raise and hero's own street
    // bet already matches the current bet: decisionContext.toCall is 0. This is the
    // "raises first in" case: the raise is hero's own initiative, not a response to
    // pressure, so it must not be recorded as facing a bet.
    const players: TablePlayerConfig[] = [
      { id: 'hero', isHero: true, name: 'You', seat: 0, stack: 1_000 },
      { id: 'ai-1', name: 'Mara', seat: 1, stack: 1_000 },
      { id: 'ai-2', name: 'Theo', seat: 2, stack: 1_000 },
    ];
    let game = createMultiwayHand({ buttonSeat: 1, players, random: seededRandom(42) });
    expect(game.players.hero?.position).toBe('BB');
    game = applyMultiwayAction(game, 'ai-1', { type: 'call' });
    game = applyMultiwayAction(game, 'ai-2', { type: 'call' });
    game = applyMultiwayAction(game, 'hero', { type: 'raise', amount: 60 });
    const observation = observePublicMultiwayHand(game);
    const preflopAction = observation.actions.find((action) => action.street === 'preflop');

    expect(preflopAction).toEqual({ facingBet: false, street: 'preflop', type: 'raise' });
  });

  it('marks hero actions as facing a bet exactly when chips were owed', () => {
    const players: TablePlayerConfig[] = [
      { id: 'hero', isHero: true, name: 'You', seat: 0, stack: 1_000 },
      { id: 'ai-1', name: 'Mara', seat: 1, stack: 1_000 },
      { id: 'ai-2', name: 'Theo', seat: 2, stack: 1_000 },
    ];
    let game = createMultiwayHand({ buttonSeat: 1, players, random: seededRandom(42) });
    game = applyMultiwayAction(game, 'ai-1', { type: 'raise', amount: 60 });
    game = applyMultiwayAction(game, 'ai-2', { type: 'fold' });
    game = applyMultiwayAction(game, 'hero', { type: 'fold' });
    const observation = observePublicMultiwayHand(game);

    expect(observation.actions.at(-1)).toEqual({ facingBet: true, street: 'preflop', type: 'fold' });
  });

  it('does not count a non-blind seat opening the pot first-in as facing a bet', () => {
    // Hero is the button and acts first preflop (3-handed order is BTN, SB, BB).
    // decisionContext.toCall is 20 (the live big blind) even though nobody has
    // voluntarily wagered yet -- decisionContext.preflopFacing is 'unopened', which
    // is the correct signal that this raise answers only the forced blind, not a
    // villain's bet.
    const players: TablePlayerConfig[] = [
      { id: 'hero', isHero: true, name: 'You', seat: 0, stack: 1_000 },
      { id: 'ai-1', name: 'Mara', seat: 1, stack: 1_000 },
      { id: 'ai-2', name: 'Theo', seat: 2, stack: 1_000 },
    ];
    const game = createMultiwayHand({ buttonSeat: 0, players, random: seededRandom(42) });
    expect(game.players.hero?.position).toBe('BTN');
    expect(game.toAct).toBe('hero');
    const raised = applyMultiwayAction(game, 'hero', { type: 'raise', amount: 60 });
    const observation = observePublicMultiwayHand(raised);

    expect(observation.actions).toEqual([{ facingBet: false, street: 'preflop', type: 'raise' }]);
  });

  it('does not count an open-fold to the unraised blind as folding to pressure', () => {
    // Same first-in spot as above, but hero folds instead of raising. This is the
    // exact miscount the task exists to fix: folding an unopened pot (facing only
    // the forced big blind) is not "folding under pressure" from a villain's bet.
    const players: TablePlayerConfig[] = [
      { id: 'hero', isHero: true, name: 'You', seat: 0, stack: 1_000 },
      { id: 'ai-1', name: 'Mara', seat: 1, stack: 1_000 },
      { id: 'ai-2', name: 'Theo', seat: 2, stack: 1_000 },
    ];
    const game = createMultiwayHand({ buttonSeat: 0, players, random: seededRandom(42) });
    expect(game.players.hero?.position).toBe('BTN');
    expect(game.toAct).toBe('hero');
    const folded = applyMultiwayAction(game, 'hero', { type: 'fold' });
    const observation = observePublicMultiwayHand(folded);

    expect(observation.actions).toEqual([{ facingBet: false, street: 'preflop', type: 'fold' }]);
  });

  it('marks a postflop fold as facing a bet when chips are genuinely owed', () => {
    const players: TablePlayerConfig[] = [
      { id: 'hero', isHero: true, name: 'You', seat: 0, stack: 1_000 },
      { id: 'ai-1', name: 'Mara', seat: 1, stack: 1_000 },
      { id: 'ai-2', name: 'Theo', seat: 2, stack: 1_000 },
    ];
    let game = createMultiwayHand({ buttonSeat: 1, players, random: seededRandom(42) });
    expect(game.players.hero?.position).toBe('BB');
    game = applyMultiwayAction(game, 'ai-1', { type: 'call' });
    game = applyMultiwayAction(game, 'ai-2', { type: 'call' });
    game = applyMultiwayAction(game, 'hero', { type: 'check' });
    expect(game.street).toBe('flop');
    game = applyMultiwayAction(game, game.toAct!, { type: 'raise', amount: 40 });
    expect(game.toAct).toBe('hero');
    game = applyMultiwayAction(game, 'hero', { type: 'fold' });
    const observation = observePublicMultiwayHand(game);

    expect(observation.actions.at(-1)).toEqual({ facingBet: true, street: 'flop', type: 'fold' });
  });

  it('can at least halve or double bluff frequency at full confidence', () => {
    const foldingObservation: HeroHandObservation = {
      actions: [
        { facingBet: false, street: 'preflop', type: 'call' },
        { facingBet: true, street: 'flop', type: 'fold' },
        { facingBet: true, street: 'turn', type: 'fold' },
        { facingBet: true, street: 'river', type: 'fold' },
        { facingBet: true, street: 'flop', type: 'call' },
      ],
      position: 'late',
    };
    const callingObservation: HeroHandObservation = {
      actions: [
        { facingBet: false, street: 'preflop', type: 'call' },
        { facingBet: true, street: 'flop', type: 'call' },
        { facingBet: true, street: 'turn', type: 'call' },
        { facingBet: true, street: 'river', type: 'call' },
        { facingBet: true, street: 'flop', type: 'fold' },
      ],
      position: 'late',
    };
    const memoryOfSomeoneWhoFolds75PercentOver60Hands = repeatObservation(foldingObservation, 60);
    const memoryOfSomeoneWhoCalls80PercentOver60Hands = repeatObservation(callingObservation, 60);

    const passiveTarget = buildOpponentAdaptation(memoryOfSomeoneWhoFolds75PercentOver60Hands, 1.3, 'late');
    expect(passiveTarget.bluffFrequencyScale).toBeGreaterThan(1.35);
    const station = buildOpponentAdaptation(memoryOfSomeoneWhoCalls80PercentOver60Hands, 1.3, 'late');
    expect(station.bluffFrequencyScale).toBeLessThan(0.75);
  });
});
