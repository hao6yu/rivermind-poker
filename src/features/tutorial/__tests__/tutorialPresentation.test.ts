/**
 * Beginner tutorial presentation tests (plan slices 1–3).
 *
 * The coordinator's step→copy mapping is extracted into
 * `tutorialPresentation.ts` (pure functions), so the full authored-hand walk,
 * the retry wording per declined action, the progress labels, and the math
 * detail values are verified without a UI harness. The reducer itself is
 * covered by the domain suite; the offline side-effect boundary is enforced
 * by tutorialBoundary.test.ts.
 */
import { describe, expect, it } from 'vitest';

import {
  BEGINNER_TUTORIAL_STEP_COUNT,
  BEGINNER_TUTORIAL_STEP_IDS,
  beginnerTutorialReducer,
  initialBeginnerTutorialState,
  recommendedActionId,
  type BeginnerTutorialState,
} from '../../../domain/tutorial/beginnerTutorial';
import { translate } from '../../../localization/core';
import {
  coachMessageFor,
  ctaLabelFor,
  FLOP_MATH_VALUES,
  progressLabelFor,
  recommendedActionFor,
  retryCopyFor,
} from '../tutorialPresentation';

const t = ((key: string, values?: Record<string, string | number>) =>
  translate('en', key as Parameters<typeof translate>[1], values)) as (
    key: string,
    values?: Record<string, string | number>,
  ) => string;

/** Walks the authored hand and snapshots the presentation at every step. */
function walk(): Array<{ state: BeginnerTutorialState; coach: string | null; cta: string | null }> {
  const frames: Array<{ state: BeginnerTutorialState; coach: string | null; cta: string | null }> = [];
  let state = initialBeginnerTutorialState();
  for (let guard = 0; guard < 64 && state.stepId !== 'recap'; guard += 1) {
    frames.push({
      state,
      coach: coachMessageFor(state, t),
      cta: ctaLabelFor(state, t),
    });
    const recommended = recommendedActionFor(state);
    state = recommended
      ? beginnerTutorialReducer(state, { type: 'choose', actionId: recommended })
      : beginnerTutorialReducer(state, { type: 'advance' });
  }
  frames.push({ state, coach: coachMessageFor(state, t), cta: ctaLabelFor(state, t) });
  return frames;
}

describe('beginner tutorial presentation', () => {
  it('gives every authored step a coach message and the guided steps a CTA', () => {
    const frames = walk();
    // Every non-recap step teaches exactly one point; no copy is missing.
    for (const frame of frames) {
      if (frame.state.stepId !== 'recap') {
        expect(frame.coach, `${frame.state.stepId} has no coach message`).toBeTruthy();
      }
    }
    // The guided CTAs in order: Start → Next ×2 → Deal the cards → Next → Continue.
    const guidedCtas = frames
      .filter((frame) => frame.cta !== null)
      .map((frame) => frame.cta);
    expect(guidedCtas).toEqual([
      translate('en', 'tutorial.step.welcome.cta'),
      translate('en', 'tutorial.step.seats.ctaNext'),
      translate('en', 'tutorial.step.seats.ctaNext'),
      translate('en', 'tutorial.step.seats.ctaDeal'),
      translate('en', 'tutorial.common.next'),
      translate('en', 'tutorial.step.flopReveal.cta'),
      // Review finding #12: showdown carries a working CTA to the recap.
      translate('en', 'tutorial.step.showdown.cta'),
    ]);
    // The interactive steps render the action bar instead of a CTA.
    for (const stepId of ['preflop-raise', 'flop-decision', 'turn-check', 'river-value-bet'] as const) {
      const state = initialBeginnerTutorialState(stepId);
      expect(ctaLabelFor(state, t), stepId).toBeNull();
    }
  });

  it('names the highlighted seat at each stage of the seats step', () => {
    let state = initialBeginnerTutorialState('seats-and-blinds');
    expect(coachMessageFor(state, t)).toBe(translate('en', 'tutorial.step.seats.coachDealer'));
    state = beginnerTutorialReducer(state, { type: 'advance' });
    expect(coachMessageFor(state, t)).toBe(translate('en', 'tutorial.step.seats.coachSmallBlind'));
    state = beginnerTutorialReducer(state, { type: 'advance' });
    expect(coachMessageFor(state, t)).toBe(translate('en', 'tutorial.step.seats.coachBigBlind'));
    expect(ctaLabelFor(state, t)).toBe(translate('en', 'tutorial.step.seats.ctaDeal'));
  });

  it('maps every declined action to its supportive retry copy', () => {
    const cases: Array<[Parameters<typeof initialBeginnerTutorialState>[0], Parameters<typeof beginnerTutorialReducer>[1]['type'] extends never ? never : Parameters<typeof beginnerTutorialReducer>[1], string]> = [
      ['preflop-raise', { type: 'choose', actionId: 'call' }, 'tutorial.retry.preflopRaise.call'],
      ['preflop-raise', { type: 'choose', actionId: 'fold' }, 'tutorial.retry.preflopRaise.fold'],
      ['flop-decision', { type: 'choose', actionId: 'fold' }, 'tutorial.retry.flopDecision.fold'],
      ['flop-decision', { type: 'choose', actionId: 'raise' }, 'tutorial.retry.flopDecision.raise'],
      ['turn-check', { type: 'choose', actionId: 'bet' }, 'tutorial.retry.turnCheck.bet'],
      ['river-value-bet', { type: 'choose', actionId: 'check' }, 'tutorial.retry.riverValueBet.check'],
    ];
    for (const [stepId, event, key] of cases) {
      const declined = beginnerTutorialReducer(initialBeginnerTutorialState(stepId), event);
      expect(retryCopyFor(declined, t)).toBe(translate('en', key as Parameters<typeof translate>[1]));
      // The retry always points at the authored recommended action.
      expect(recommendedActionFor(declined)).toBe(recommendedActionId(stepId as Parameters<typeof recommendedActionId>[0]));
    }
    // No declined action, no retry copy.
    expect(retryCopyFor(initialBeginnerTutorialState('preflop-raise'), t)).toBeNull();
  });

  it('renders the Step X of 10 label through the catalog', () => {
    expect(progressLabelFor('welcome', 0, BEGINNER_TUTORIAL_STEP_COUNT, t)).toBe('Step 1 of 10');
    expect(progressLabelFor('flop-decision', 5, BEGINNER_TUTORIAL_STEP_COUNT, t)).toBe('Step 6 of 10');
    expect(progressLabelFor('recap', BEGINNER_TUTORIAL_STEP_COUNT - 1, BEGINNER_TUTORIAL_STEP_COUNT, t)).toBe('Step 10 of 10');
    expect(BEGINNER_TUTORIAL_STEP_IDS).toHaveLength(10);
  });

  it('pins the optional math detail to the authored chip script', () => {
    expect(FLOP_MATH_VALUES).toEqual({ call: 2, hearts: 9, percent: 19, pot: 15, price: 13, unseen: 47 });
    const detail = translate('en', 'tutorial.math.detail', FLOP_MATH_VALUES);
    expect(detail).toContain('9 ÷ 47 ≈ 19%');
    expect(detail).toContain('Calling 2 chips');
    expect(detail).toContain('15-chip final pot');
    expect(detail).toContain('about 13%');
    // The plain-language line alone is sufficient without the arithmetic.
    expect(translate('en', 'tutorial.math.plain')).toContain('1 chance in 5');
  });

  it('keeps the recap free of coach copy (the completion screen owns it)', () => {
    expect(coachMessageFor(initialBeginnerTutorialState('recap'), t)).toBeNull();
    expect(ctaLabelFor(initialBeginnerTutorialState('recap'), t)).toBeNull();
  });
});
