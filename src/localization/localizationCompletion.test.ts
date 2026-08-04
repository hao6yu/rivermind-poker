import { describe, expect, it } from 'vitest';

import { dailyChallengeDisplayDate } from '../domain/poker/dailyChallenge';
import type { LiveCoachRecommendation } from '../features/table/liveCoach';
import {
  localizedCoachAlternativeDetail,
  localizedCoachDetail,
  localizedCoachError,
} from '../features/table/localizedGameplay';
import { translate } from './core';
import type { MessageKey } from './messages';

const completionKeys: MessageKey[] = [
  'card.faceDown',
  'progress.title',
  'feedback.title',
  'feedback.error',
  'beta.title',
  'beta.section.ai.body',
  'coach.error.coach_timeout',
  'coach.live.preflop',
  'decision.detail.postflop',
];

describe('localization completion', () => {
  it.each(['zh-Hans', 'zh-Hant'] as const)('does not fall back to English for completion keys in %s', (language) => {
    completionKeys.forEach((key) => {
      expect(translate(language, key)).not.toBe(translate('en', key));
    });
  });

  it('formats Daily Challenge dates with the selected locale', () => {
    expect(dailyChallengeDisplayDate('2026-08-03', 'en')).toBe('Aug 3');
    expect(dailyChallengeDisplayDate('2026-08-03', 'zh-Hans')).toContain('8月3日');
    expect(dailyChallengeDisplayDate('2026-08-03', 'zh-Hant')).toContain('8月3日');
  });

  it('keeps rich English coach copy and supplies localized Chinese presentation copy', () => {
    const recommendation: LiveCoachRecommendation = {
      action: 'Call',
      detail: 'Rich deterministic English explanation.',
      headline: 'Call 20',
      alternative: { detail: 'English alternative.', headline: 'Fold' },
    };
    const zh = (key: MessageKey, values?: Record<string, string | number>) => translate('zh-Hans', key, values);
    const en = (key: MessageKey, values?: Record<string, string | number>) => translate('en', key, values);

    expect(localizedCoachDetail(recommendation, 'en', 'flop', 0.4, 0.25, 2, en)).toBe(recommendation.detail);
    expect(localizedCoachDetail(recommendation, 'zh-Hans', 'flop', 0.4, 0.25, 2, zh)).toContain('40%');
    expect(localizedCoachAlternativeDetail(recommendation, 'zh-Hans', zh)).not.toBe(recommendation.alternative?.detail);
    expect(localizedCoachError('coach_timeout', zh)).toContain('超时');
  });
});
