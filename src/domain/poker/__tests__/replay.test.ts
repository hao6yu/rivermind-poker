import { describe, expect, it } from 'vitest';

import { seededRandom } from '../cards';
import { applyAction, createHand } from '../engine';
import { buildReplaySteps, replayStepForHeroDecision } from '../replay';

describe('hand replay timeline', () => {
  it('reconstructs actions, street deals, chip movement, and showdown visibility', () => {
    let game = createHand({ button: 'hero', random: seededRandom(10) });
    game = applyAction(game, 'hero', { type: 'call' });
    game = applyAction(game, 'villain', { type: 'check' });
    for (let street = 0; street < 3; street += 1) {
      game = applyAction(game, 'villain', { type: 'check' });
      game = applyAction(game, 'hero', { type: 'check' });
    }

    const steps = buildReplaySteps(game);
    expect(steps.filter((step) => step.kind === 'deal')).toHaveLength(3);
    expect(steps.filter((step) => step.kind === 'action')).toHaveLength(game.history.length);
    expect(steps[1]).toMatchObject({
      kind: 'action',
      actor: 'hero',
      action: 'call',
      pot: 40,
      heroStack: 980,
      heroDecisionSequence: 1,
    });
    expect(steps.at(-1)).toMatchObject({ kind: 'outcome', revealVillain: true, street: 'complete' });
    expect(replayStepForHeroDecision(steps, 3)).toBe(
      steps.findIndex((step) => step.heroDecisionSequence === 3),
    );
  });

  it('keeps hidden cards concealed when a hand ends by folding', () => {
    const game = applyAction(
      createHand({ button: 'hero', random: seededRandom(9) }),
      'hero',
      { type: 'fold' },
    );
    const steps = buildReplaySteps(game);
    expect(steps.at(-1)).toMatchObject({ kind: 'outcome', revealVillain: false });
  });
});
