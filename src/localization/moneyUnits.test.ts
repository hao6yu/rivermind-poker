import { describe, expect, it } from 'vitest';

import { generateScenarioSession } from '../domain/learning/scenarios';
import { CASH_GAME_BIG_BLIND, QUICK_PLAY_SESSION_CONFIG, STARTING_STACK_OPTIONS } from '../domain/poker/session';
import { localizeScenarioContent } from './scenarioContent';
import { formatChips } from '../domain/poker/moneyFormat';
import { SIT_AND_GO_INITIAL_BIG_BLIND, SIT_AND_GO_STRUCTURES } from '../domain/poker/tournament';
import { translate } from './core';
import { englishMessages, simplifiedChineseMessages, traditionalChineseMessages, type MessageKey } from './messages';

/**
 * Chips are the only money unit a player reads. "BB" survives in exactly one
 * message — the table guide's seat glossary — where it names a seat, not an amount.
 */
const seatLabelKeys: MessageKey[] = ['guide.bb'];

const catalogs = {
  en: englishMessages as Record<MessageKey, string>,
  'zh-Hans': simplifiedChineseMessages,
  'zh-Hant': traditionalChineseMessages,
} as const;

describe('money units in localized copy', () => {
  it.each(Object.keys(catalogs) as Array<keyof typeof catalogs>)('never abbreviates big blinds as "BB" in %s', (language) => {
    const offenders = Object.entries(catalogs[language])
      .filter(([key]) => !seatLabelKeys.includes(key as MessageKey))
      .filter(([, value]) => /\bBB\b/.test(value))
      .map(([key]) => key);
    expect(offenders).toEqual([]);
  });

  it('quotes every configuration stack in chips resolved from its own blind level', () => {
    expect(translate('en', 'home.quickPlayDescription', {
      difficulty: 'Club',
      stack: formatChips(QUICK_PLAY_SESSION_CONFIG.startingStackBb * CASH_GAME_BIG_BLIND),
    })).toBe('1 hand · 2,000 chips · Club AI');

    expect(translate('en', 'tournament.description', {
      stack: formatChips(SIT_AND_GO_STRUCTURES.standard.startingStackBb * SIT_AND_GO_INITIAL_BIG_BLIND),
    })).toBe('1,200 chips · rising blinds · one winner');

    expect(translate('en', 'championship.invitationNote', {
      stack: formatChips(SIT_AND_GO_STRUCTURES.invitation.startingStackBb * SIT_AND_GO_INITIAL_BIG_BLIND),
    })).toBe('Your Final victory revealed a private 2,000-chip table. Win it to conquer the River Below.');

    expect(STARTING_STACK_OPTIONS.map((stackBb) => formatChips(stackBb * CASH_GAME_BIG_BLIND)))
      .toEqual(['800', '2,000', '4,000']);
  });

  it('keeps the teaching ratios in big blinds, spelled out', () => {
    expect(translate('en', 'common.bigBlinds', { count: 100 })).toBe('100 big blinds');
    expect(translate('en', 'scenario.math', { call: 3, pot: 13, required: 23 }))
      .toBe('Call 3 big blinds ÷ final pot 13 big blinds = 23% needed');
  });

  it('spells the unit out in every generated scenario line, in every language', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      for (const scenario of generateScenarioSession(seed)) {
        for (const language of ['en', 'zh-Hans', 'zh-Hant'] as const) {
          const localized = localizeScenarioContent(scenario, language);
          const lines = [
            localized.opponentAction,
            localized.prompt,
            localized.reasoning,
            localized.takeaway,
            ...localized.choices.flatMap((choice) => [choice.label, choice.feedback]),
          ];
          for (const line of lines) expect(line).not.toMatch(/\bBB\b/);
        }
      }
    }
  });
});
