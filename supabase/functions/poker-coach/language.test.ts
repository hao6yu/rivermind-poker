import { describe, expect, it } from 'vitest';

import { coachLanguageInstruction } from './language';

describe('coach output language', () => {
  it('gives each allowlisted locale an explicit prose instruction', () => {
    expect(coachLanguageInstruction('en')).toContain('English');
    expect(coachLanguageInstruction('zh-Hans')).toContain('Simplified Chinese');
    expect(coachLanguageInstruction('zh-Hant')).toContain('Traditional Chinese');
  });

  it('keeps poker abbreviations stable in Chinese output', () => {
    expect(coachLanguageInstruction('zh-Hans')).toContain('BB and SPR');
    expect(coachLanguageInstruction('zh-Hant')).toContain('BB and SPR');
  });
});
