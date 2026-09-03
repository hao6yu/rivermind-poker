export type CoachLanguage = 'en' | 'zh-Hans' | 'zh-Hant' | 'es-419' | 'pt-BR';

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
  if (language === 'es-419') {
    return [
      'Write summary, bestDecision, keyConcept, and practiceTip in concise, natural Latin American Spanish (es-419), using the tú form.',
      'Use standard poker terms: pasar, igualar, apostar, subir, retirarse, all-in, preflop, flop, turn, river, cartas comunitarias, probabilidades del bote, rango, apuesta por valor, farol, botón (BTN).',
      'Spell out ciegas grandes for big-blind amounts instead of abbreviating as BB, and prefer proyecto for a draw.',
      'Keep established abbreviations such as SPR, EV, ICM, 3-bet, and 4-bet unchanged.',
      'Avoid Spain-specific vocabulary: no vosotros, no calle for a betting street, and do not translate 3-bet or 4-bet.',
    ].join(' ');
  }
  if (language === 'pt-BR') {
    return [
      'Write summary, bestDecision, keyConcept, and practiceTip in concise, natural Brazilian Portuguese (pt-BR), using the você form.',
      'Use standard Brazilian poker terms: passar, pagar, apostar, aumentar, desistir, all-in, pré-flop, flop, turn, river, cartas comunitárias, odds do pote, range, aposta de valor, blefe, botão (BTN).',
      'Keep big blind and big blinds in English instead of abbreviating as BB, and keep draw in English.',
      'Keep established abbreviations such as SPR, EV, ICM, 3-bet, and 4-bet unchanged.',
      'Avoid European Portuguese vocabulary: no escala for a straight, no farol for a bluff, and do not translate 3-bet or 4-bet.',
    ].join(' ');
  }
  return 'Write summary, bestDecision, keyConcept, and practiceTip in concise English.';
}
