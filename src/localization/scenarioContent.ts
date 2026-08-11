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
  return `跟注 ${calculation.callAmountBb} 个大盲后最终底池为 ${calculation.finalPotBb} 个大盲，需要 ${calculation.requiredEquityPercent}% 胜率${equity}。`;
}

function translatedAction(label: string): string {
  // English lesson labels spell the unit out ("Call 3 big blinds"); Chinese says 个大盲.
  return label
    .replace(/ big blinds?$/, ' 个大盲')
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
      focus: '盲注防守', opponentAction: '按钮位用较大尺寸开池；你在大盲已投入 1 个大盲。', prompt: '你应该如何防守？',
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
      focus: '隔离与位置', opponentAction: '关煞位跛入 1 个大盲，小盲和大盲仍在你身后等待行动。', prompt: '这手强牌最清晰的计划是什么？',
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
    'cutoff-open': {
      focus: '关煞位开池', opponentAction: '行动弃到你，按钮位和两个盲注位仍在身后。', prompt: '率先入池时最清晰的行动是什么？',
      reasoning: '这手牌的质量和位置足以在关煞位盈利开池。统一使用 2.5 个大盲可让策略保持清晰。', takeaway: '剩余玩家越少，开池范围可以越宽，但应以加注而非跛入来入池。',
    },
    'button-suited-open': {
      focus: '按钮位开池', opponentAction: '你之前的所有玩家都弃牌，只剩两个盲注位。', prompt: '位置应如何影响这手牌？',
      reasoning: '身后只剩两名玩家，且被跟注后能保证位置优势，因此这是一手实用的按钮位开池牌。', takeaway: '后位可以增加开池，因为剩余范围更少，且翻牌后最后行动。',
    },
    'small-blind-steal': {
      focus: '小盲开池', opponentAction: '所有玩家都弃到你；你已经投入 0.5 个大盲。', prompt: '最简单的价值优先计划是什么？',
      reasoning: '这手牌领先随机大盲范围。即使翻牌后要先行动，加注仍能构建价值。', takeaway: '行动弃到小盲时，可用扎实手牌进攻，但要记住翻牌后的位置劣势。',
    },
    'middle-pair-open': {
      focus: '口袋对子开池', opponentAction: '前面的玩家都弃牌，身后仍有三名玩家。', prompt: '应该怎样用这手口袋对子入池？',
      reasoning: '这手牌已有对子强度，也有组成三条的潜力。正常开池可立即赢下底池，或带着主动权看翻牌。', takeaway: '可玩的口袋对子应使用与其他开池范围相同的加注尺寸。',
    },
    'multi-limper-isolate': {
      focus: '多名跛入者', opponentAction: '两名玩家各跛入 1 个大盲，两个盲注位仍在身后。', prompt: '这手强牌最清晰的计划是什么？',
      reasoning: '两名跛入者带来更多死钱和潜在跟注者。这手强牌应使用更大的隔离加注来取得价值。', takeaway: '隔离时每名跛入者可增加约 1 个大盲，再根据位置与对手调整。',
    },
    'overlimp-small-pair': {
      focus: '选择性跟着跛入', opponentAction: '两名玩家跛入。筹码很深，而且盲注位很少加注。', prompt: '哪种低波动入池方式合理？',
      reasoning: '小对子通常需要组成三条才能赢得大底池。深筹码、被动桌况和按钮位置支持便宜跟注。', takeaway: '只有手牌、筹码深度、位置和桌况都适合多人底池时，才选择跟着跛入。',
    },
    'short-stack-open': {
      focus: '短筹码开池', opponentAction: '行动弃到你，有效筹码为 25 个大盲。', prompt: '较短筹码应如何影响开池？',
      reasoning: '25 个大盲时，这手牌仍是强开池牌；较小尺寸可以保留应对身后再加注的空间。', takeaway: '筹码变短时使用高效开池尺寸，并在加注前计划如何应对全下。',
    },
    'suited-broadway-call': {
      focus: '有位置跟注', opponentAction: '关煞位加注到 2.5 个大盲，两个盲注位仍在身后。', prompt: '最清晰的基准是什么？',
      reasoning: '这手牌对抗关煞位范围表现良好，而且通常有位置。跟注可避免对抗更强继续范围时过度扩大底池。', takeaway: '有位置的强可玩牌可以跟注，不必把每次继续都变成再加注。',
    },
    'dominated-broadway-fold': {
      focus: '避免被压制', opponentAction: '一名纪律严谨的前位玩家加注到 3 个大盲。', prompt: '面对这个范围应如何处理？',
      reasoning: '这手牌对抗紧的前位开池经常组成第二好的对子，而且翻牌后每条街都处于不利位置。', takeaway: '开池者位置越早、尺寸越大，就越应弃掉容易被压制的不同花高张牌。',
    },
    'set-mine-price': {
      focus: '埋伏三条条件', opponentAction: '前位加注到 2.5 个大盲。有效筹码 100 个大盲，而且盲注位较被动。', prompt: '哪种回应最能发挥小对子？',
      reasoning: '小对子很少在翻牌组成三条，因此需要深筹码、可接受价格和较高的胜率实现机会。', takeaway: '只有价格、筹码深度、位置与身后玩家都支持未来回报时才埋伏三条。',
    },
    'ace-blocker-three-bet': {
      focus: '阻挡牌再加注', opponentAction: '活跃的按钮位加注到 2.5 个大盲，小盲弃牌。', prompt: '这手牌能支持哪种进攻路线？',
      reasoning: '同花小 A 阻挡 A-A、A-K 和 A-Q，且被跟注后仍有顺子与同花潜力，因此适合偶尔施压。', takeaway: '诈唬再加注应基于阻挡效果和可玩性，而不是因为牌弱。',
    },
    'squeeze-value': {
      focus: '价值挤压', opponentAction: '关煞位加注到 2.5 个大盲，按钮位跟注，大盲仍在身后。', prompt: '最清晰的价值路线是什么？',
      reasoning: '这手牌大幅领先开池者与跟注者的继续范围。再加注能构建价值，并阻止大盲便宜加入。', takeaway: '加注被跟注后，用更大的价值尺寸向两个范围收费并缩小参赛人数。',
    },
    'marginal-four-bet-fold': {
      focus: '面对四下注', opponentAction: '你把前位开池三下注到 10 个大盲，对手四下注到 24 个大盲。', prompt: '有纪律的基准是什么？',
      reasoning: '行动与位置让四下注范围非常强。已经投入的筹码不能弥补继续时的低胜率。', takeaway: '三下注前先做好计划；后续行动代表更强范围时，要放弃边缘牌。',
    },
    'short-stack-reshove': {
      focus: '短筹码再加注', opponentAction: '按钮位加注到 2.5 个大盲，有效筹码为 20 个大盲。', prompt: '筹码深度应如何影响价值回应？',
      reasoning: '20 个大盲时，这手强牌对按钮开池和继续范围有良好胜率。直接全下可阻止对手实现胜率，也避免尴尬的小再加注。', takeaway: '短筹码面对宽后位开池时，强牌更适合直接投入。',
    },
    'suited-connector-defense': {
      focus: '可玩盲注防守', opponentAction: '按钮位加注到 2.25 个大盲，小盲弃牌；你已投入 1 个大盲。', prompt: '价格与可玩性应如何影响这手牌？',
      reasoning: '同花连张获得有利价格，也能组成隐蔽顺子和同花。这些特性帮助它在翻牌后先行动时实现胜率。', takeaway: '面对后位小尺寸开池，同花可玩牌可以比不相连的不同花牌防守更宽。',
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
    .replaceAll('Middle position', '中间位置')
    .replaceAll('Under the gun', '枪口位')
    .replaceAll('Button and blinds behind', '按钮位和盲注位在身后')
    .replaceAll('Button and both blinds', '按钮位和两个盲注位')
    .replaceAll('Small blind and big blind', '小盲和大盲')
    .replaceAll('Three players behind', '身后三名玩家')
    .replaceAll('Two limpers and both blinds', '两名跛入者和两个盲注位')
    .replaceAll('Cutoff and button', '关煞位和按钮位')
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
