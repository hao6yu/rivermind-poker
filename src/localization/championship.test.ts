import { describe, expect, it } from 'vitest';

import {
  CHAMPIONSHIP_EVENTS,
  CHAMPIONSHIP_INVITATION_EVENTS,
  CHAMPIONSHIP_STAGES,
  applyChampionshipResult,
  championshipAchievements,
  championshipUndertowIsUnlocked,
  createEmptyChampionshipProgress,
  type ChampionshipProgress,
} from '../domain/poker/championship';
import {
  championshipAchievementAccessibilityLabel,
  championshipAchievementDisplay,
  championshipEventText,
  championshipStageText,
} from './championship';
import { translate, type AppLanguage } from './core';
import type { MessageKey } from './messages';

const LOCALES: readonly AppLanguage[] = ['en', 'zh-Hans', 'zh-Hant'];

function translatorFor(language: AppLanguage) {
  return (key: MessageKey, values?: Record<string, string | number>) => translate(language, key, values);
}

function progressWithRiverBelowWon(): ChampionshipProgress {
  let progress = createEmptyChampionshipProgress();
  for (const event of CHAMPIONSHIP_EVENTS) {
    progress = applyChampionshipResult(progress, {
      eventId: event.id,
      place: 1,
      handsPlayed: 3,
      completedAt: '2026-08-03T00:00:00.000Z',
    });
  }
  return applyChampionshipResult(progress, {
    eventId: 'river_below',
    place: 1,
    handsPlayed: 6,
    completedAt: '2026-08-03T03:00:00.000Z',
  });
}

describe('Championship localization (3.11D)', () => {
  it('resolves every stage and event title/description in all three locales', () => {
    for (const language of LOCALES) {
      const t = translatorFor(language);
      for (const stage of CHAMPIONSHIP_STAGES) {
        expect(championshipStageText(stage.id, 'title', t)).not.toMatch(/^championship\./);
        expect(championshipStageText(stage.id, 'description', t)).not.toMatch(/^championship\./);
      }
      for (const event of [...CHAMPIONSHIP_EVENTS, ...CHAMPIONSHIP_INVITATION_EVENTS]) {
        expect(championshipEventText(event, 'title', t)).not.toMatch(/^championship\./);
        expect(championshipEventText(event, 'description', t)).not.toMatch(/^championship\./);
      }
    }
  });

  it('shows only the neutral placeholder for the hidden Undertow achievement in every locale', () => {
    const leaked = /Undertow|暗流|暗涌/;
    const fresh = createEmptyChampionshipProgress();
    expect(championshipUndertowIsUnlocked(fresh)).toBe(false);
    const lockedAchievement = championshipAchievements(fresh)
      .find((achievement) => achievement.id === 'undertow_conqueror')!;

    for (const language of LOCALES) {
      const t = translatorFor(language);
      const display = championshipAchievementDisplay(lockedAchievement, t);
      // Neither the visible copy nor the accessibility label may name the
      // hidden invitation before The River Below is won.
      expect(display.title, language).not.toMatch(leaked);
      expect(display.description, language).not.toMatch(leaked);
      expect(display.title, language).not.toMatch(/^championship\./);
      expect(display.description, language).not.toMatch(/^championship\./);
    }

    // Once revealed, the authored achievement copy resolves normally.
    const revealed = progressWithRiverBelowWon();
    const revealedAchievement = championshipAchievements(revealed)
      .find((achievement) => achievement.id === 'undertow_conqueror')!;
    expect(revealedAchievement.hidden).toBe(false);
    for (const language of LOCALES) {
      const display = championshipAchievementDisplay(revealedAchievement, translatorFor(language));
      expect(display.title).toMatch(leaked);
    }
  });

  it('keeps the hidden achievement out of the assembled accessibility label in every locale', () => {
    const leaked = /Undertow|暗流/;
    const fresh = createEmptyChampionshipProgress();
    const lockedAchievement = championshipAchievements(fresh)
      .find((achievement) => achievement.id === 'undertow_conqueror')!;

    for (const language of LOCALES) {
      const label = championshipAchievementAccessibilityLabel(lockedAchievement, translatorFor(language));
      // The composed label — exactly what the record modal announces —
      // carries only the neutral placeholder while The Undertow is hidden.
      expect(label, language).not.toMatch(leaked);
      expect(label, language).not.toMatch(/^championship\./);
    }

    // After the reveal the label announces the authored achievement copy.
    const revealed = progressWithRiverBelowWon();
    const revealedAchievement = championshipAchievements(revealed)
      .find((achievement) => achievement.id === 'undertow_conqueror')!;
    for (const language of LOCALES) {
      const label = championshipAchievementAccessibilityLabel(revealedAchievement, translatorFor(language));
      expect(label, language).toMatch(leaked);
    }
  });

  it('carries the Undertow invitation note with matching interpolation in every locale', () => {
    for (const language of LOCALES) {
      const note = translate(language, 'championship.undertowNote', { stack: '2,000' });
      expect(note, language).not.toMatch(/^championship\./);
      expect(note, language).toContain('2,000');
      expect(note).not.toMatch(/\{\{\w+\}\}/);
    }
    // The placeholder set is identical across locales.
    const placeholders = (template: string) => [...template.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]);
    const english = translate('en', 'championship.undertowNote').match(/\{\{(\w+)\}\}/g) ?? [];
    expect(placeholders(translate('zh-Hans', 'championship.undertowNote'))).toEqual(placeholders(translate('en', 'championship.undertowNote')));
    expect(placeholders(translate('zh-Hant', 'championship.undertowNote'))).toEqual(placeholders(translate('en', 'championship.undertowNote')));
    expect(english).toEqual(['{{stack}}']);
  });

  it('no longer describes the expanded tour with the five-event v1 wording', () => {
    const stale = /five-event|五站/;
    for (const key of ['championship.journey', 'championship.invitationCompleteNote'] as const) {
      for (const language of LOCALES) {
        expect(translate(language, key), `${language} ${key}`).not.toMatch(stale);
      }
    }
  });

  it('gives the hidden-chain summary outcomes their own terminal copy in every locale', () => {
    // Winning The Undertow ends the authored chain: the summary must not
    // claim that a next stop unlocked, and the River Below summary must stay
    // truthful when the conquered invitation is replayed.
    for (const language of LOCALES) {
      const undertowTitle = translate(language, 'summary.undertowChampion');
      const undertowBody = translate(language, 'summary.body.undertowChampion');
      const belowBody = translate(language, 'summary.body.belowChampion');
      expect(undertowTitle, language).not.toMatch(/^summary\./);
      expect(undertowBody, language).not.toMatch(/^summary\./);
      expect(undertowBody, language).not.toMatch(/next Championship stop|下一站|下一站錦標賽已解鎖/);
      expect(undertowBody, language).not.toMatch(/\{\{\w+\}\}/);
      expect(belowBody, language).not.toMatch(/\{\{\w+\}\}/);
      // The River Below copy never names the deeper invitation, so a replay
      // of an already-conquered chain cannot say it still awaits.
      expect(belowBody, language).not.toMatch(/Undertow|暗流/);
    }
  });
});
