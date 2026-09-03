import { describe, expect, it } from 'vitest';

import { cheatSheets, lessons, trainers } from '../domain/learning/content';
import { generateScenarioSession, scenarioTemplateCount } from '../domain/learning/scenarios';
import {
  localizeCheatSheetContent,
  localizeLessonContent,
  localizeTrainerContent,
} from './learningContent';
import {
  englishMessages,
  simplifiedChineseMessages,
  traditionalChineseMessages,
  type MessageKey,
} from './messages';
import { localizeScenarioContent } from './scenarioContent';

function interpolationNames(message: string): string[] {
  return Array.from(message.matchAll(/\{\{(\w+)\}\}/g), ([, name]) => name!).sort();
}

const literalPokerCalques = /三下注|四下注|替代路线|替代路線|按钮位|按鈕位/;
const gluedPokerShorthand = /[\p{Script=Han}][34]-bet|[34]-bet[\p{Script=Han}]/u;
const simplifiedOnlyCharacters = /[这为与个发开关进过还学习决择请设备状态游戏创务时试码链动线页获结录复应该让现实对选户访问验证预览载无暂题参统标义术数据从总续扫维护额处气价钱够风险门说话东举场级识读写买卖爱权轻边队报网络启云软]/;

function localizedLearningCorpus(language: 'zh-Hans' | 'zh-Hant'): string {
  const title = language === 'zh-Hans' ? '本地化标题' : '本地化標題';
  const description = language === 'zh-Hans' ? '本地化说明' : '本地化說明';
  return JSON.stringify({
    lessons: lessons.map((lesson) => localizeLessonContent(lesson, language, title, description)),
    trainers: trainers.map((trainer) => localizeTrainerContent(trainer, language, title, description)),
    cheatSheets: cheatSheets.map((sheet) => localizeCheatSheetContent(sheet, language, title, description)),
    scenarios: generateScenarioSession(15_015, scenarioTemplateCount)
      .map((scenario) => localizeScenarioContent(scenario, language)),
  });
}

const pokerTermExamples: Array<{
  key: MessageKey;
  simplified: string;
  traditional: string;
}> = [
  { key: 'poker.action.fold', simplified: '弃牌', traditional: '棄牌' },
  { key: 'poker.action.check', simplified: '过牌', traditional: '過牌' },
  { key: 'poker.action.call', simplified: '跟注', traditional: '跟注' },
  { key: 'poker.action.bet', simplified: '下注', traditional: '下注' },
  { key: 'poker.action.raise', simplified: '加注', traditional: '加注' },
  { key: 'poker.action.allIn', simplified: '全下', traditional: '全下' },
  { key: 'poker.street.preflop', simplified: '翻牌前', traditional: '翻牌前' },
  { key: 'poker.street.flop', simplified: '翻牌', traditional: '翻牌' },
  { key: 'poker.street.turn', simplified: '转牌', traditional: '轉牌' },
  { key: 'poker.street.river', simplified: '河牌', traditional: '河牌' },
  { key: 'table.review.potOdds', simplified: '底池赔率', traditional: '底池賠率' },
  { key: 'guide.dealer', simplified: 'D · 庄家位', traditional: 'D · 莊家位' },
];

const intentionallyLanguageNeutralKeys = new Set<MessageKey>([
  'language.en',
  'language.zhHans',
  'language.zhHant',
  // Phase 19 language self-names render in their own language in every locale.
  'language.es419',
  'language.ptBr',
  'multiway.practiceLevel',
  'championship.lineupTier',
  'beta.version',
  'guided.calibration.calibration-pot-odds.choice.20-percent',
  'guided.calibration.calibration-pot-odds.choice.25-percent',
  'guided.calibration.calibration-pot-odds.choice.33-percent',
  'guided.calibration.calibration-bluff-threshold.choice.25-percent',
  'guided.calibration.calibration-bluff-threshold.choice.50-percent',
  'multiplayer.option.chips',
  'multiplayer.join.placeholder',
  'multiplayer.lobby.ai',
]);

describe('Chinese localization quality', () => {
  it('preserves every interpolation variable in both Chinese catalogs', () => {
    (Object.keys(englishMessages) as MessageKey[]).forEach((key) => {
      const expected = interpolationNames(englishMessages[key]);
      expect(interpolationNames(simplifiedChineseMessages[key]), `${key} zh-Hans`).toEqual(expected);
      expect(interpolationNames(traditionalChineseMessages[key]), `${key} zh-Hant`).toEqual(expected);
    });
  });

  it('uses the approved action and street terminology', () => {
    pokerTermExamples.forEach(({ key, simplified, traditional }) => {
      expect(simplifiedChineseMessages[key]).toBe(simplified);
      expect(traditionalChineseMessages[key]).toBe(traditional);
    });
  });

  it('keeps poker formats distinct from real-money play and preserves regional level wording', () => {
    expect(simplifiedChineseMessages['learn.scenarioDescription']).toContain('现金桌');
    expect(traditionalChineseMessages['learn.scenarioDescription']).toContain('現金桌');
    expect(simplifiedChineseMessages['onboarding.practiceDescription']).toContain('真钱游戏');
    expect(traditionalChineseMessages['onboarding.practiceDescription']).toContain('真錢遊戲');
    expect(simplifiedChineseMessages['learn.intermediateMinutes']).toBe('中级 · {{minutes}} 分钟');
    expect(traditionalChineseMessages['learn.intermediateMinutes']).toBe('中階 · {{minutes}} 分鐘');
  });

  it('does not silently inherit English product copy', () => {
    const keys = Object.keys(englishMessages) as MessageKey[];
    const untranslatedSimplified = keys.filter((key) => (
      simplifiedChineseMessages[key] === englishMessages[key]
      && !intentionallyLanguageNeutralKeys.has(key)
    ));
    const untranslatedTraditional = keys.filter((key) => (
      traditionalChineseMessages[key] === englishMessages[key]
      && !intentionallyLanguageNeutralKeys.has(key)
    ));

    expect(untranslatedSimplified).toEqual([]);
    expect(untranslatedTraditional).toEqual([]);
  });

  it('avoids literal poker calques in product copy', () => {
    const simplified = Object.values(simplifiedChineseMessages).join('\n');
    const traditional = Object.values(traditionalChineseMessages).join('\n');

    expect(simplified).not.toMatch(literalPokerCalques);
    expect(traditional).not.toMatch(literalPokerCalques);
    expect(simplified).not.toMatch(gluedPokerShorthand);
    expect(traditional).not.toMatch(gluedPokerShorthand);
  });

  it.each(['zh-Hans', 'zh-Hant'] as const)(
    'applies the same poker terminology quality to long-form learning content in %s',
    (language) => {
      const corpus = localizedLearningCorpus(language);
      expect(corpus).not.toMatch(literalPokerCalques);
      expect(corpus).not.toMatch(gluedPokerShorthand);
    },
  );

  it('does not leak Simplified-only characters into Traditional learning content', () => {
    expect(localizedLearningCorpus('zh-Hant')).not.toMatch(simplifiedOnlyCharacters);
  });

  it('does not add surrounding whitespace to localized messages', () => {
    (Object.keys(englishMessages) as MessageKey[]).forEach((key) => {
      const simplified = simplifiedChineseMessages[key];
      const traditional = traditionalChineseMessages[key];
      expect(simplified, `${key} zh-Hans trailing whitespace`).toBe(simplified.trimEnd());
      expect(traditional, `${key} zh-Hant trailing whitespace`).toBe(traditional.trimEnd());
      if (!key.endsWith('Suffix')) {
        expect(simplified, `${key} zh-Hans leading whitespace`).toBe(simplified.trimStart());
        expect(traditional, `${key} zh-Hant leading whitespace`).toBe(traditional.trimStart());
      }
    });
  });

  it('does not leak common Simplified-only characters into Traditional copy', () => {
    (Object.keys(traditionalChineseMessages) as MessageKey[]).forEach((key) => {
      if (key === 'language.zhHans') return;
      expect(traditionalChineseMessages[key], key).not.toMatch(simplifiedOnlyCharacters);
    });
  });
});
