export type CoachLanguage = 'en' | 'zh-Hans' | 'zh-Hant';

export function coachLanguageInstruction(language: CoachLanguage): string {
  if (language === 'zh-Hans') {
    return 'Write summary, bestDecision, keyConcept, and practiceTip in concise Simplified Chinese. Keep poker abbreviations such as BB and SPR unchanged.';
  }
  if (language === 'zh-Hant') {
    return 'Write summary, bestDecision, keyConcept, and practiceTip in concise Traditional Chinese suitable for Taiwan and Hong Kong players. Keep poker abbreviations such as BB and SPR unchanged.';
  }
  return 'Write summary, bestDecision, keyConcept, and practiceTip in concise English.';
}
