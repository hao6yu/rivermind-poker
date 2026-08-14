import { describe, expect, it } from 'vitest';

import {
  aiDifficultyPickerLayout,
  localAiModePolicy,
  resolveLocalAiDifficulty,
  SELECTABLE_AI_DIFFICULTIES,
} from './aiGameModePolicy';

describe('local AI game mode policy', () => {
  it('keeps one-tap and shared challenges fixed while preserving authored fields', () => {
    expect(localAiModePolicy('quick_play')).toEqual({ kind: 'fixed', difficulty: 'club' });
    expect(localAiModePolicy('daily_challenge')).toEqual({ kind: 'fixed', difficulty: 'club' });
    expect(localAiModePolicy('championship')).toEqual({ kind: 'authored' });
  });

  it('offers only the three player-selectable tiers in Custom and Sit & Go', () => {
    expect(SELECTABLE_AI_DIFFICULTIES).toEqual(['friendly', 'club', 'sharp']);
    expect(localAiModePolicy('custom')).toEqual({
      kind: 'selectable',
      options: SELECTABLE_AI_DIFFICULTIES,
    });
    expect(localAiModePolicy('sit_and_go')).toEqual({
      kind: 'selectable',
      options: SELECTABLE_AI_DIFFICULTIES,
    });
  });

  it('snapshots each launch without allowing a resume to change another mode', () => {
    const customPreference = 'friendly' as const;
    expect(resolveLocalAiDifficulty({ mode: 'quick_play', selectedDifficulty: customPreference }))
      .toBe('club');
    expect(resolveLocalAiDifficulty({ mode: 'custom', selectedDifficulty: customPreference }))
      .toBe('friendly');
    expect(resolveLocalAiDifficulty({
      mode: 'sit_and_go',
      resumeDifficulty: 'sharp',
      selectedDifficulty: 'club',
    })).toBe('sharp');
    expect(customPreference).toBe('friendly');
    expect(resolveLocalAiDifficulty({
      authoredDifficulty: 'nemesis',
      mode: 'championship',
      selectedDifficulty: customPreference,
    })).toBe('nemesis');
  });

  it('rejects missing or non-selectable configuration instead of falling back silently', () => {
    expect(() => resolveLocalAiDifficulty({ mode: 'custom' })).toThrow(/selectable difficulty/);
    expect(() => resolveLocalAiDifficulty({ mode: 'sit_and_go', selectedDifficulty: 'elite' }))
      .toThrow(/selectable difficulty/);
    expect(() => resolveLocalAiDifficulty({ mode: 'championship' })).toThrow(/authored/);
  });

  it('keeps compact controls tappable and gives tablets larger readable metrics', () => {
    const phone = aiDifficultyPickerLayout(320);
    const tablet = aiDifficultyPickerLayout(768);

    expect(phone).toMatchObject({ optionMinHeight: 48, tablet: false });
    expect(tablet).toMatchObject({ optionMinHeight: 56, tablet: true });
    expect(tablet.labelFontSize).toBeGreaterThan(phone.labelFontSize);
    expect(tablet.summaryLineHeight).toBeGreaterThan(phone.summaryLineHeight);
  });
});
