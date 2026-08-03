import type { ScenarioChoiceGrade, ScenarioSpot } from '../domain/learning/types';
import type { AppLanguage } from './core';
import { toTraditionalChinese } from './learningContentChinese';

interface ScenarioCopy {
  focus: string;
  opponentAction: string;
  prompt: string;
  reasoning: string;
  takeaway: string;
}

function templateId(id: string): string {
  return id.replace(/-\d+$/, '');
}

function mathSummary(scenario: ScenarioSpot): string | null {
  const calculation = scenario.calculation;
  if (!calculation) return null;
  const equity = calculation.estimatedEquityPercent === undefined
    ? ''
    : `，估算胜率为 ${calculation.estimatedEquityPercent}%`;
  return `跟注 ${calculation.callAmountBb} BB 后最终底池为 ${calculation.finalPotBb} BB，需要 ${calculation.requiredEquityPercent}% 胜率${equity}。`;
}

function translatedAction(label: string): string {
  return label
    .replace(/^Check back$/, '随后过牌')
    .replace(/^Check$/, '过牌')
    .replace(/^Fold$/, '弃牌')
    .replace(/^Call (?=\d)/, '跟注 ')
    .replace(/^Raise to (?=\d)/, '加注至 ')
    .replace(/^Bet (?=\d)/, '下注 ')
    .replace(/^Move all-in$/, '全下')
    .replace(/^Raise all-in$/, '全下加注');
}

function choiceFeedback(grade: ScenarioChoiceGrade): string {
  if (grade === 'best') return '这是最清晰的新手基准，风险、价格和牌力之间最平衡。';
  if (grade === 'reasonable') return '这条路线在部分策略中可以混合使用，但不是最简单稳定的基准。';
  return '这条路线的价格或风险不合适；先依据牌力、位置和对手范围选择更稳健的行动。';
}

function scenarioCopy(scenario: ScenarioSpot): ScenarioCopy {
  const math = mathSummary(scenario);
  const common: Record<string, ScenarioCopy> = {
    'button-value': {
      focus: '翻牌前价值', opponentAction: '单挑局行动轮到按钮位。', prompt: '最清晰的新手基准是什么？',
      reasoning: '这手强牌领先随机大盲范围。为价值加注，同时保留翻牌后的位置优势。', takeaway: '按钮位强牌应为价值加注，并利用位置实现优势。',
    },
    'blind-defense': {
      focus: '盲注防守', opponentAction: '按钮位用较大尺寸开池；你在大盲已投入 1 BB。', prompt: '你应该如何防守？',
      reasoning: math ?? '较大开池尺寸让跟注价格变差，而且这手弱牌在不利位置难以实现胜率。', takeaway: '面对小尺寸可扩大防守；价格升高时要放弃最弱的牌。',
    },
    'flush-draw-price': {
      focus: '听牌与底池赔率', opponentAction: '大盲在翻牌圈下注，你持坚果同花听牌。', prompt: '哪项回应最符合直接底池赔率？',
      reasoning: math ?? '九张干净同花补牌到河牌约有 35% 命中率，应与跟注后的最终底池价格比较。', takeaway: '比较听牌胜率时，要使用跟注后的最终底池，而不是下注前的底池。',
    },
    'turn-value': {
      focus: '价值下注', opponentAction: '大盲连续第二次过牌。', prompt: '持强顶对时应该如何继续？',
      reasoning: '多种更弱的一对和听牌仍会继续。中等尺寸可取得价值，又不会只留下最强范围。', takeaway: '价值下注前，先说出哪些更弱手牌会用这个价格跟注。',
    },
    'river-bluff-catch': {
      focus: '抓诈', opponentAction: '大盲在河牌圈超额下注；你只有抓诈牌。', prompt: '这个价格要求你怎么做？',
      reasoning: math ?? '估算胜率低于跟注所需胜率，因此即使绝对牌力看起来不错也应弃牌。', takeaway: '不要让绝对牌力盖过底池价格和基于范围的胜率估算。',
    },
    'missed-draw': {
      focus: '诈唬选择', opponentAction: '大盲过牌；这位对手跟注过多，而你的阻挡牌很差。', prompt: '未成听牌应该诈唬吗？',
      reasoning: '听牌未成不会自动成为有利可图的诈唬。对手倾向、牌面和阻挡牌都显示弃牌率不足。', takeaway: '只有当对手范围能够弃牌时才诈唬，而不是只因听牌未成。',
    },
    'pot-control': {
      focus: '摊牌价值', opponentAction: '大盲跟注翻牌下注，然后在转牌过牌。', prompt: '强踢脚第二对应该如何处理？',
      reasoning: '第二对有摊牌价值，但大额下注没有清晰收益。利用位置免费实现胜率，并在河牌获得更多信息。', takeaway: '优秀的过牌能保护中等摊牌价值；进攻始终需要明确目的。',
    },
    'isolate-limper': {
      focus: '隔离与位置', opponentAction: '关煞位跛入 1 BB，小盲和大盲仍在你身后等待行动。', prompt: '这手强牌最清晰的计划是什么？',
      reasoning: '这手牌领先典型跛入范围。加注能取得价值，并降低进入多人底池的概率。', takeaway: '利用位置和强牌隔离弱跛入者，不要自动跟着跛入。',
    },
    'premium-three-bet': {
      focus: '面对再加注', opponentAction: '你开池后，大盲进行翻牌前三下注。', prompt: '顶端范围最清晰的价值路线是什么？',
      reasoning: '顶端范围希望对抗对手的强继续范围构建大底池。受控的四下注能取得价值，无需直接全下。', takeaway: '持范围顶端牌面对压力时，应继续构建价值，而不是害怕结果。',
    },
    'early-discipline': {
      focus: '前位纪律', opponentAction: '你第一个行动，身后仍有五名持活牌的玩家。', prompt: '六人桌前位最清晰的基准是什么？',
      reasoning: '位置会改变入池门槛。弱牌必须通过五个范围，而且翻牌后经常处于不利位置。', takeaway: '前位要收紧开池范围，因为身后更多玩家可能拿到强牌。',
    },
    'river-thin-value': {
      focus: '薄价值尺寸', opponentAction: '大盲在河牌过牌，多种更弱一对仍可能跟一个适中下注。', prompt: '哪个尺寸最容易让更弱手牌留下？',
      reasoning: '小尺寸针对已识别的更弱一对。目标不是最大下注，而是更差牌仍愿意跟注的最大尺寸。', takeaway: '选择价值尺寸时，要想象哪些更弱手牌真的会付钱。',
    },
    'semi-bluff-size': {
      focus: '半诈唬尺寸', opponentAction: '大盲过牌；你有开放式顺子听牌，但摊牌价值很低。', prompt: '哪条路线能施压又不过度冒险？',
      reasoning: '中等下注可让更强的未成对高牌弃牌，被跟注时仍有八张改善牌。', takeaway: '半诈唬结合弃牌率和听牌胜率，不需要使用最大的尺寸。',
    },
    'turn-straight-price': {
      focus: '顺子听牌价格', opponentAction: '大盲在转牌圈小额下注；八张干净顺子补牌约有 17% 命中率。', prompt: '直接价格支持跟注吗？',
      reasoning: math ?? '所需胜率低于听牌的估算胜率，因此直接跟注有利可图。', takeaway: '即使只剩一张牌，小额下注仍可能给听牌提供有利价格。',
    },
    'overpriced-flush': {
      focus: '听牌价格过高', opponentAction: '大盲在转牌圈下注满池；你有九张同花补牌。', prompt: '这个价格说明你应如何继续？',
      reasoning: math ?? '跟注所需胜率明显高于听牌命中率，因此看似强大的听牌仍应弃牌。', takeaway: '面对给价不合适的大额下注，强听牌也可能应该弃牌。',
    },
  };
  return common[templateId(scenario.id)] ?? {
    focus: scenario.focus,
    opponentAction: scenario.opponentAction,
    prompt: scenario.prompt,
    reasoning: scenario.reasoning,
    takeaway: scenario.takeaway,
  };
}

function translatePosition(value: string): string {
  return value
    .replaceAll('Button', '按钮位')
    .replaceAll('Small blind', '小盲')
    .replaceAll('Big blind', '大盲')
    .replaceAll('Cutoff', '关煞位')
    .replaceAll('Under the gun', '枪口位')
    .replaceAll('two blinds behind', '身后有两个盲注位')
    .replaceAll('six players', '六人桌')
    .replaceAll('Five players behind', '身后五名玩家');
}

export function localizeScenarioContent(scenario: ScenarioSpot, language: AppLanguage): ScenarioSpot {
  if (language === 'en') return scenario;
  const copy = scenarioCopy(scenario);
  const localized: ScenarioSpot = {
    ...scenario,
    ...copy,
    position: translatePosition(scenario.position),
    opponentPosition: translatePosition(scenario.opponentPosition),
    choices: scenario.choices.map((choice) => ({
      ...choice,
      label: translatedAction(choice.label),
      feedback: choiceFeedback(choice.grade),
    })),
  };
  if (language === 'zh-Hans') return localized;
  return JSON.parse(toTraditionalChinese(JSON.stringify(localized))) as ScenarioSpot;
}
