import { describe, expect, it } from 'vitest';

import { cheatSheets, lessons, trainers } from '../domain/learning/content';
import { generateScenarioSession, scenarioTemplateCount } from '../domain/learning/scenarios';
import {
  localizeCheatSheetContent,
  localizeLessonContent,
  localizeTrainerContent,
} from './learningContent';
import { localizeScenarioContent } from './scenarioContent';

describe('localized learning content', () => {
  it.each(['zh-Hans', 'zh-Hant'] as const)('covers every lesson in %s without changing examples', (language) => {
    for (const lesson of lessons) {
      const localized = localizeLessonContent(lesson, language, '本地化标题', '本地化说明');
      expect(localized.title).toBe('本地化标题');
      expect(localized.sections).toHaveLength(lesson.sections.length);
      expect(localized.sections[0]?.heading).not.toBe(lesson.sections[0]?.heading);
      expect(localized.sections.map((section) => section.example?.heroCards)).toEqual(
        lesson.sections.map((section) => section.example?.heroCards),
      );
      expect(localized.sections.map((section) => section.example?.board)).toEqual(
        lesson.sections.map((section) => section.example?.board),
      );
    }
  });

  it.each(['zh-Hans', 'zh-Hant'] as const)('fully translates Phase 7 teaching details in %s', (language) => {
    const phase7Lessons = lessons.filter((lesson) => (
      lesson.id.startsWith('lesson-tournament-')
      || lesson.id.startsWith('lesson-opponents-')
      || lesson.id.startsWith('lesson-math-')
    ));
    for (const lesson of phase7Lessons) {
      const localized = localizeLessonContent(lesson, language, '本地化标题', '本地化说明');
      for (const [index, section] of lesson.sections.entries()) {
        const translated = localized.sections[index]!;
        expect(translated.heading).not.toBe(section.heading);
        expect(translated.body).not.toBe(section.body);
        if (section.takeaway) expect(translated.takeaway).not.toBe(section.takeaway);
        if (section.bullets) expect(translated.bullets).not.toEqual(section.bullets);
        if (section.example) {
          expect(translated.example?.title).not.toBe(section.example.title);
          expect(translated.example?.detail).not.toBe(section.example.detail);
        }
      }
    }
  });

  it('preserves the blocker and fold-target test in the small-sample opponent lesson', () => {
    const lesson = lessons.find((candidate) => candidate.id === 'lesson-opponents-evidence');
    if (!lesson) throw new Error('Missing opponent evidence lesson');
    const simplified = JSON.stringify(localizeLessonContent(lesson, 'zh-Hans', '标题', '说明'));
    const traditional = JSON.stringify(localizeLessonContent(lesson, 'zh-Hant', '標題', '說明'));

    expect(simplified).toContain('没有胜率的诈唬');
    expect(simplified).toContain('检查阻挡牌');
    expect(simplified).toContain('更好手牌真的会弃牌');
    expect(traditional).toContain('沒有勝率的詐唬');
    expect(traditional).toContain('檢查阻擋牌');
    expect(traditional).toContain('更好手牌真的會棄牌');
  });

  it.each(['zh-Hans', 'zh-Hant'] as const)('covers every quiz in %s while preserving scoring ids', (language) => {
    for (const trainer of trainers) {
      const localized = localizeTrainerContent(trainer, language, '本地化标题', '本地化说明');
      expect(localized.questions).toHaveLength(trainer.questions.length);
      for (const [index, question] of trainer.questions.entries()) {
        const translated = localized.questions[index]!;
        expect(translated.prompt).not.toBe(question.prompt);
        expect(translated.correctChoiceId).toBe(question.correctChoiceId);
        expect(translated.choices.map((choice) => choice.id)).toEqual(question.choices.map((choice) => choice.id));
        expect(translated.heroCards).toEqual(question.heroCards);
        expect(translated.board).toEqual(question.board);
      }
    }
  });

  it.each(['zh-Hans', 'zh-Hant'] as const)('covers every reference sheet in %s without changing examples or odds', (language) => {
    for (const sheet of cheatSheets) {
      const localized = localizeCheatSheetContent(sheet, language, '本地化标题', '本地化说明');
      expect(localized.groups).toHaveLength(sheet.groups.length);
      expect(localized.groups[0]?.title).not.toBe(sheet.groups[0]?.title);
      expect(localized.groups.map((group) => group.rows.map((row) => row.example))).toEqual(
        sheet.groups.map((group) => group.rows.map((row) => row.example)),
      );
      expect(localized.groups.map((group) => group.rows.map((row) => row.probability))).toEqual(
        sheet.groups.map((group) => group.rows.map((row) => row.probability)),
      );
    }
  });

  it.each(['zh-Hans', 'zh-Hant'] as const)('localizes all randomized scenario templates in %s without changing poker facts', (language) => {
    const scenarios = generateScenarioSession(45_045, scenarioTemplateCount);
    expect(scenarios).toHaveLength(scenarioTemplateCount);
    for (const scenario of scenarios) {
      const localized = localizeScenarioContent(scenario, language);
      expect(localized.focus).not.toBe(scenario.focus);
      expect(localized.prompt).not.toBe(scenario.prompt);
      expect(localized.id).toBe(scenario.id);
      expect(localized.heroCards).toEqual(scenario.heroCards);
      expect(localized.board).toEqual(scenario.board);
      expect(localized.calculation).toEqual(scenario.calculation);
      expect(localized.bestChoiceId).toBe(scenario.bestChoiceId);
      expect(localized.choices.map(({ grade, id }) => ({ grade, id }))).toEqual(
        scenario.choices.map(({ grade, id }) => ({ grade, id })),
      );
    }
  });

  it.each(['zh-Hans', 'zh-Hant'] as const)('keeps all 233 scenario choices specific instead of reducing feedback to a grade in %s', (language) => {
    const scenarios = generateScenarioSession(45_045, scenarioTemplateCount);
    const formerGradeOnlyFeedback = new Set([
      '这是最清晰的新手基准，在风险、底池赔率和牌力之间最平衡。',
      '这种打法在部分策略中可以混合使用，但不是最简单、稳定的基准。',
      '这种打法的跟注成本或承担的风险不合适；应根据牌力、位置和对手范围选择更稳健的行动。',
      '這是最清晰的新手基準，在風險、底池賠率和牌力之間最平衡。',
      '這種打法在部分策略中可以混合使用，但不是最簡單、穩定的基準。',
      '這種打法的跟注成本或承擔的風險不合適；應根據牌力、位置和對手範圍選擇更穩健的行動。',
    ]);
    let choiceCount = 0;

    for (const scenario of scenarios) {
      const localized = localizeScenarioContent(scenario, language);
      const localizedFeedback = localized.choices.map((choice) => choice.feedback);
      choiceCount += localizedFeedback.length;

      expect(new Set(localizedFeedback).size).toBe(localizedFeedback.length);
      for (const [index, feedback] of localizedFeedback.entries()) {
        expect(feedback).toMatch(/[\u3400-\u9fff]/u);
        expect(feedback).not.toBe(scenario.choices[index]!.feedback);
        expect(formerGradeOnlyFeedback).not.toContain(feedback);
      }
    }

    expect(choiceCount).toBe(233);
  });

  it('preserves every numeric feedback fact across randomized scenario variants', () => {
    for (const seed of [12_345, 45_045, 71_071, 99_999]) {
      for (const scenario of generateScenarioSession(seed, scenarioTemplateCount)) {
        const localized = localizeScenarioContent(scenario, 'zh-Hans');
        for (const choice of scenario.choices) {
          const feedback = localized.choices.find((candidate) => candidate.id === choice.id)?.feedback;
          if (!feedback) throw new Error(`Missing localized choice: ${scenario.id}/${choice.id}`);
          const numericFacts = Array.from(choice.feedback.matchAll(/\d+(?:\.\d+)?%?/g), ([fact]) => fact);
          for (const fact of numericFacts) expect(feedback).toContain(fact);
        }
      }
    }
  });

  it('describes the actual randomized hand instead of assuming one hand class', () => {
    const rankLabel: Record<number, string> = {
      14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: '10', 9: '9', 8: '8', 7: '7',
      6: '6', 5: '5', 4: '4', 3: '3', 2: '2',
    };
    const expectedHand = (scenario: ReturnType<typeof generateScenarioSession>[number]) => {
      const [first, second] = scenario.heroCards;
      if (!first || !second) throw new Error(`Missing hero cards: ${scenario.id}`);
      const ranks = `${rankLabel[first.rank]}-${rankLabel[second.rank]}`;
      return first.rank === second.rank
        ? `${ranks} 口袋对子`
        : `${ranks}${first.suit === second.suit ? ' 同花' : ' 不同花'}`;
    };
    const feedbackChoiceByTemplate: Record<string, string> = {
      'tournament-deep-open': 'fold',
      'tournament-call-short-shove': 'fold',
      'short-stack-open': 'fold',
      'cutoff-open': 'fold',
      'read-small-sample': 'large',
    };

    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 45_045]) {
      for (const scenario of generateScenarioSession(seed, scenarioTemplateCount)) {
        const choiceId = feedbackChoiceByTemplate[scenario.id.replace(/-\d+$/, '')];
        if (!choiceId) continue;
        const localized = localizeScenarioContent(scenario, 'zh-Hans');
        const feedback = localized.choices.find((choice) => choice.id === choiceId)?.feedback;
        expect(feedback, `${scenario.id}/${choiceId}`).toContain(expectedHand(scenario));
      }
    }
  });

  it('preserves the scenario math inside the feedback for each affected choice', () => {
    const scenarios = generateScenarioSession(45_045, scenarioTemplateCount);
    const scenarioNamed = (id: string) => {
      const scenario = scenarios.find((candidate) => candidate.id.startsWith(`${id}-`));
      if (!scenario) throw new Error(`Missing scenario fixture: ${id}`);
      return { scenario, localized: localizeScenarioContent(scenario, 'zh-Hans') };
    };
    const feedbackFor = (id: string, choiceId: string) => {
      const { localized } = scenarioNamed(id);
      const feedback = localized.choices.find((choice) => choice.id === choiceId)?.feedback;
      if (!feedback) throw new Error(`Missing localized choice fixture: ${id}/${choiceId}`);
      return feedback;
    };

    const blindDefense = scenarioNamed('blind-defense').scenario.calculation;
    if (!blindDefense || blindDefense.kind === 'bluff' || blindDefense.kind === 'implied-odds') {
      throw new Error('Expected a call calculation for blind-defense');
    }
    expect(feedbackFor('blind-defense', 'call')).toContain(`${blindDefense.requiredEquityPercent}%`);

    const flushDraw = scenarioNamed('flush-draw-price').scenario.calculation;
    if (!flushDraw || flushDraw.kind === 'bluff' || flushDraw.kind === 'implied-odds') {
      throw new Error('Expected a call calculation for flush-draw-price');
    }
    for (const choiceId of ['fold', 'call']) {
      expect(feedbackFor('flush-draw-price', choiceId)).toContain(`${flushDraw.requiredEquityPercent}%`);
      expect(feedbackFor('flush-draw-price', choiceId)).toContain(`${flushDraw.estimatedEquityPercent}%`);
      expect(feedbackFor('flush-draw-price', choiceId)).toContain('9 张');
    }

    const bluff = scenarioNamed('math-half-pot-bluff').scenario.calculation;
    if (!bluff || bluff.kind !== 'bluff') throw new Error('Expected a bluff calculation');
    const bluffFeedback = feedbackFor('math-half-pot-bluff', 'bet');
    expect(bluffFeedback).toContain(`${bluff.riskBb} 个大盲`);
    expect(bluffFeedback).toContain(`${bluff.rewardBb} 个大盲`);
    expect(bluffFeedback).toContain(`${bluff.requiredFoldPercent}%`);
    expect(bluffFeedback).toContain('40%');

    const implied = scenarioNamed('math-implied-short-fold').scenario.calculation;
    if (!implied || implied.kind !== 'implied-odds') throw new Error('Expected an implied-odds calculation');
    const impliedFoldFeedback = feedbackFor('math-implied-short-fold', 'fold');
    expect(impliedFoldFeedback).toContain(`${implied.directRequiredEquityPercent}%`);
    expect(impliedFoldFeedback).toContain(`${implied.estimatedCleanEquityPercent}%`);
    expect(feedbackFor('math-implied-short-fold', 'call')).toContain(`${implied.minimumFutureWinBb} 个大盲`);

    const bluffCatch = scenarioNamed('river-bluff-catch-fold').scenario.calculation;
    if (!bluffCatch || bluffCatch.kind === 'bluff' || bluffCatch.kind === 'implied-odds') {
      throw new Error('Expected a call calculation for river-bluff-catch-fold');
    }
    for (const choiceId of ['call', 'fold']) {
      expect(feedbackFor('river-bluff-catch-fold', choiceId)).toContain(`${bluffCatch.requiredEquityPercent}%`);
      expect(feedbackFor('river-bluff-catch-fold', choiceId)).toContain(`${bluffCatch.estimatedEquityPercent}%`);
    }
  });

  it('uses the agreed scenario terminology throughout the generated Chinese corpus', () => {
    const scenarios = generateScenarioSession(45_045, scenarioTemplateCount);
    const simplified = JSON.stringify(scenarios.map((scenario) => localizeScenarioContent(scenario, 'zh-Hans')));
    const traditional = JSON.stringify(scenarios.map((scenario) => localizeScenarioContent(scenario, 'zh-Hant')));

    expect(simplified).toContain('筹码底池比（SPR）');
    expect(simplified).toContain('再全下');
    expect(simplified).toContain('尚未行动的玩家');
    expect(simplified).toContain('纯筹码价值');
    expect(simplified).not.toMatch(/底池筹码比|持活牌|活跃范围|行动弃到你|你之前的玩家|活跃的庄家位/);
    expect(traditional).toContain('籌碼底池比（SPR）');
    expect(traditional).toContain('再全下');
    expect(traditional).toContain('尚未行動的玩家');
    expect(traditional).toContain('純籌碼價值');
    expect(traditional).not.toMatch(/底池籌碼比|持活牌|活躍範圍|行動棄到你|你之前的玩家|活躍的莊家位/);
  });

  it.each(['zh-Hans', 'zh-Hant'] as const)('keeps Phase 7 scenario positions free of English style labels in %s', (language) => {
    const scenarios = generateScenarioSession(71_071, scenarioTemplateCount).filter((scenario) => (
      scenario.practicePacks.some((pack) => [
        'tournament-short-stack',
        'tournament-bubble',
        'opponent-adjustments',
        'advanced-math',
      ].includes(pack))
    ));
    for (const scenario of scenarios) {
      const localized = localizeScenarioContent(scenario, language);
      expect(`${localized.position} ${localized.opponentPosition}`).not.toMatch(
        /Button|blind|players|caller|folder|patient|aggressor|range|stack|leader/i,
      );
    }
  });

  it('uses Traditional Chinese characters in the Traditional catalog', () => {
    const lesson = localizeLessonContent(lessons[0]!, 'zh-Hant', '繁體標題', '繁體說明');
    expect(lesson.sections[0]?.heading).toContain('張');
    expect(lesson.sections[0]?.body).toContain('撲克');
    expect(lesson.sections[0]?.body).not.toContain('扑克');
  });
});
