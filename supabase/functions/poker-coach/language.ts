export type CoachLanguage = 'en' | 'zh-Hans' | 'zh-Hant';

export function coachLanguageInstruction(language: CoachLanguage): string {
  if (language === 'zh-Hans') {
    return [
      'Write summary, bestDecision, keyConcept, and practiceTip in concise, natural Mainland Simplified Chinese.',
      'Use standard poker terms: 过牌、跟注、下注、加注、弃牌、全下、翻牌前、翻牌、转牌、河牌、底牌、公共牌、底池赔率、范围、价值下注、诈唬、庄家位（BTN）.',
      'Prefer 跟注门槛 or 跟注成本 over the literal 当前价格, and 备选打法 over 替代路线.',
      'Keep established abbreviations such as BB, SPR, EV, ICM, 3-bet, and 4-bet unchanged.',
      'Avoid English sentence structure and do not translate 3-bet or 4-bet as 三下注 or 四下注.',
    ].join(' ');
  }
  if (language === 'zh-Hant') {
    return [
      'Write summary, bestDecision, keyConcept, and practiceTip in concise, natural Traditional Chinese suitable for Taiwan and Hong Kong players.',
      'Use standard poker terms: 過牌、跟注、下注、加注、棄牌、全下、翻牌前、翻牌、轉牌、河牌、底牌、公共牌、底池賠率、範圍、價值下注、詐唬、莊家位（BTN）.',
      'Prefer 跟注門檻 or 跟注成本 over the literal 目前價格, and 備選打法 over 替代路線.',
      'Keep established abbreviations such as BB, SPR, EV, ICM, 3-bet, and 4-bet unchanged.',
      'Avoid English sentence structure and do not translate 3-bet or 4-bet as 三下注 or 四下注.',
    ].join(' ');
  }
  return 'Write summary, bestDecision, keyConcept, and practiceTip in concise English.';
}
