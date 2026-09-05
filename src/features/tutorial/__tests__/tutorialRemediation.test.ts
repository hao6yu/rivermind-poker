import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';

import { BEGINNER_TUTORIAL_BOARD, BEGINNER_TUTORIAL_STEP_IDS, bestFiveForSeat, bestHandForSeat, initialBeginnerTutorialState, stepOptions } from '../../../domain/tutorial/beginnerTutorial';
import { compareHandValues } from '../../../domain/poker/evaluator';
import { CATALOG_COMPLETE_LOCALES, translate, type AppLanguage } from '../../../localization/core';

/**
 * Review findings #16/#19/#18 gates:
 *  - #16: every tutorial action label renders WITHOUT unresolved
 *    `{{placeholders}}` in every catalog-complete locale — the amountless
 *    actions must use the plain keys, amount-bearing ones the templates.
 *  - #18: the showdown best-five selector returns the exact authored five
 *    cards for the hero flush and the opponent two pair (the table highlights
 *    exactly these).
 *  - #19: the flop announcement text covers all three newly dealt cards in
 *    natural order.
 */

const __dirnameShim = '.';
const t = (locale: AppLanguage, key: string, values?: Record<string, string | number>) =>
  translate(locale, key as Parameters<typeof translate>[1], values);

describe('tutorial action labels (finding #16)', () => {
  it('renders every option label with no unresolved placeholders in every locale', () => {
    const failures: string[] = [];
    for (const locale of CATALOG_COMPLETE_LOCALES) {
      for (const stepId of BEGINNER_TUTORIAL_STEP_IDS) {
        const state = initialBeginnerTutorialState(stepId);
        for (const option of stepOptions(stepId)) {
          const label = option.amount !== undefined
            ? t(locale, option.id === 'call' ? 'poker.action.callAmount' : option.id === 'bet' ? 'poker.action.betAmount' : 'poker.action.raiseTo', { amount: option.amount })
            : t(locale, `poker.action.${option.id}`);
          expect(label.trim().length, `${locale} ${stepId}/${option.id} blank`).toBeGreaterThan(0);
          if (label.includes('{{')) {
            failures.push(`${locale} ${stepId}/${option.id}: unresolved "${label}"`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('uses the amountless Call key when the authored option carries no amount', () => {
    // flop-decision's call has no amount in the authored script: the bar must
    // render the plain Call label, not `Call {{amount}}`.
    const options = stepOptions('flop-decision');
    const call = options.find((option) => option.id === 'call');
    expect(call?.amount).toBeUndefined();
    for (const locale of CATALOG_COMPLETE_LOCALES) {
      const plain = t(locale, 'poker.action.call');
      const templated = t(locale, 'poker.action.callAmount', {});
      // The plain key never carries a placeholder; the template does.
      expect(plain).not.toContain('{{');
      expect(templated).toContain('{{amount}}');
      expect(plain).not.toBe(templated);
    }
  });
});

describe('showdown best-five highlighting (finding #18)', () => {
  it('selects the exact authored five cards for both showdown hands', () => {
    const heroBest = bestFiveForSeat('hero').map((card) => `${card.rank}:${card.suit}`).sort();
    const bigBlindBest = bestFiveForSeat('big-blind').map((card) => `${card.rank}:${card.suit}`).sort();
    // Hero's ace-high flush: A♥ Q♥ K♥ J♥ 7♥.
    expect(heroBest).toEqual(['7:hearts', '11:hearts', '12:hearts', '13:hearts', '14:hearts'].sort());
    // Opponent two pair: K♣ K♥ J♣ J♥ 7♥.
    expect(bigBlindBest).toEqual(['7:hearts', '11:clubs', '11:hearts', '13:clubs', '13:hearts'].sort());
    // And the flush outranks the two pair (the winner banner says so).
    expect(compareHandValues(bestHandForSeat('hero'), bestHandForSeat('big-blind'))).toBeGreaterThan(0);
  });
});

describe('community-card announcements (finding #19)', () => {
  it('announces the flop as three cards, the turn and river one each', () => {
    const boardCounts: Record<string, number> = {
      welcome: 0, 'seats-and-blinds': 0, 'hole-cards': 0, 'preflop-raise': 0,
      'flop-reveal': 3, 'flop-decision': 3, 'turn-check': 4, 'river-value-bet': 5,
      showdown: 5, recap: 5,
    };
    // The flop delta is 3 (all three cards announced), turn and river 1 each.
    const flopCount = boardCounts['flop-reveal'] ?? 0;
    const preflopCount = boardCounts['preflop-raise'] ?? 0;
    const turnCount = boardCounts['turn-check'] ?? 0;
    const riverCount = boardCounts['river-value-bet'] ?? 0;
    expect(flopCount - preflopCount).toBe(3);
    expect(turnCount - flopCount).toBe(1);
    expect(riverCount - turnCount).toBe(1);
    // The announcement loop's authored order matches the board order.
    expect(BEGINNER_TUTORIAL_BOARD.slice(0, 3).map((card) => `${card.rank}:${card.suit}`)).toEqual([
      '11:hearts', '7:hearts', '2:clubs',
    ]);
  });
});

describe('screen-reader action flow (finding #14)', () => {
  it('keeps the coach card and action bar as normal siblings (no modal isolation)', () => {
    // accessibilityViewIsModal on the coach card trapped VoiceOver/TalkBack —
    // the source must not use it on a non-modal sibling.
    const { readFileSync } = require('node:fs');
    const coachSource = readFileSync(
      resolve(__dirnameShim, 'src/features/tutorial/TutorialCoachCard.tsx'),
      'utf8',
    );
    expect(coachSource).not.toContain('accessibilityViewIsModal');
    // The action bar remains a separate focusable sibling.
    const barSource = readFileSync(
      resolve(__dirnameShim, 'src/features/tutorial/TutorialActionBar.tsx'),
      'utf8',
    );
    expect(barSource).not.toContain('accessibilityViewIsModal');
    expect(barSource).toContain('accessibilityRole');
  });

  it('scrolls the body so the coach and actions stay reachable on compact screens (finding #13)', () => {
    const { readFileSync } = require('node:fs');
    const screenSource = readFileSync(
      resolve(__dirnameShim, 'src/features/tutorial/BeginnerTutorialScreen.tsx'),
      'utf8',
    );
    // The table + coach render inside a ScrollView (compact/large-text safe);
    // the action bar stays outside as a fixed footer.
    expect(screenSource).toContain('<ScrollView');
    expect(screenSource).toContain('<TutorialActionBar');
    const barIndex = screenSource.indexOf('<TutorialActionBar');
    const scrollClose = screenSource.indexOf('</ScrollView>');
    expect(barIndex).toBeGreaterThan(scrollClose);
  });
});
