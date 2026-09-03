import type { ScenarioChoice, ScenarioSpot } from '../domain/learning/types';
import type { AppLanguage } from './core';
import { toTraditionalChinese } from './learningContentChinese';
import { phase7ScenarioChineseCopy } from './phase7ScenarioChinese';

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
  if (calculation.kind === 'bluff') {
    return `冒险 ${calculation.riskBb} 个大盲争夺 ${calculation.rewardBb} 个大盲，纯诈唬至少需要 ${calculation.requiredFoldPercent}% 弃牌率。`;
  }
  if (calculation.kind === 'implied-odds') {
    return `按直接底池赔率，跟注需要 ${calculation.directRequiredEquityPercent}% 胜率，干净改善率约 ${calculation.estimatedCleanEquityPercent}%；成牌后还需要预计再赢约 ${calculation.minimumFutureWinBb} 个大盲。`;
  }
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
    .replace(/^Call all-in$/, '跟注全下')
    .replace(/^Raise to (?=\d)/, '加注至 ')
    .replace(/^Bet (?=\d)/, '下注 ')
    .replace(/^Move all-in$/, '全下')
    .replace(/^Raise all-in$/, '全下加注');
}

type ChoiceFeedback = string | ((scenario: ScenarioSpot) => string);

const rankLabels: Record<number, string> = {
  14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: '10', 9: '9', 8: '8',
  7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2',
};

function heroHandLabel(scenario: ScenarioSpot): string {
  const [first, second] = scenario.heroCards;
  if (!first || !second) return '这手牌';
  const firstRank = rankLabels[first.rank] ?? `${first.rank}`;
  const secondRank = rankLabels[second.rank] ?? `${second.rank}`;
  if (first.rank === second.rank) return `${firstRank}-${secondRank} 口袋对子`;
  return `${firstRank}-${secondRank}${first.suit === second.suit ? ' 同花' : ' 不同花'}`;
}

/**
 * Feedback is keyed by both template and choice because every button teaches a
 * different trade-off. Keeping this exhaustive prevents localization from
 * silently reducing the lesson to a generic best/reasonable/mistake sentence.
 */
const choiceFeedbackChinese: Record<string, Record<string, ChoiceFeedback>> = {
  'read-patient-raise': {
    fold: '对手很少在河牌大额加注，而且这里几乎没有未成听牌；其范围过度集中于价值牌，弃牌最稳妥。',
    call: '绝对牌力虽强，却无法凭空增加诈唬组合；面对这位对手几乎从未采用的行动线，跟注缺少依据。',
  },
  'short-stack-reshove': {
    fold: '这手强牌对抗后位开池范围明显领先，不能因为面对加注就直接弃牌。',
    'all-in': '筹码底池比（SPR）较低，面对较宽开池范围，直接为价值全下既实用，也能阻止对手便宜兑现胜率。',
    call: '跟注会让对手保留宽范围，但在这个筹码深度会错失清晰的价值投入机会。',
  },
  'river-bluff-catch-call': {
    call: (scenario) => {
      const calculation = scenario.calculation;
      return calculation && calculation.kind !== 'bluff' && calculation.kind !== 'implied-odds'
        ? `跟注 ${calculation.callAmountBb} 个大盲后，最终底池为 ${calculation.finalPotBb} 个大盲，只需 ${calculation.requiredEquityPercent}% 胜率；多个听牌未成，使估算胜率高于门槛。`
        : '多个自然听牌未成，而且跟注门槛较低，因此抓诈唬跟注有充分依据。';
    },
    raise: '把盈利的抓诈唬牌改成加注，会赶走诈唬牌，却主要得到更强价值牌的行动。',
    fold: (scenario) => {
      const calculation = scenario.calculation;
      return calculation && calculation.kind !== 'bluff' && calculation.kind !== 'implied-odds'
        ? `估算胜率已超过 ${calculation.requiredEquityPercent}% 的盈亏平衡门槛，弃牌会放弃一次符合底池赔率的跟注。`
        : '估算胜率高于盈亏平衡门槛，弃牌会放弃一次符合底池赔率的跟注。';
    },
  },
  'button-suited-open': {
    limp: '率先加注比公开跛入更能利用位置，也能立即向两个随机盲注范围施压。',
    raise: (scenario) => `${heroHandLabel(scenario)}有足够可玩性，能从庄家位向两个随机盲注范围施压。`,
    fold: '弃牌很安全，但会放弃一次有位置、身后仅剩两名玩家的实用开池机会。',
  },
  'three-bet-pot-dry-range-bet': {
    check: '过牌可以保护范围，却会放弃在干燥牌面上以低风险施压的机会。',
    large: '满池下注承担过多风险；较小尺寸已经能向相同的未成对牌与中等强度牌施压。',
    small: '约 1/3 底池的小注能利用 3-bet 方更强的范围，同时以较低风险攻击跟注者的较弱范围。',
  },
  'multiway-range-discipline': {
    check: '过牌能保留两张高牌的改善胜率，也尊重两名跟注者中至少一人更常击中牌面的事实。',
    small: '小注可以少量混合，但同时面对两个范围时，需要更好的阻挡牌或后门听牌。',
    large: '在相连牌面上，满池诈唬必须同时迫使两个范围弃牌，承担的风险过高。',
  },
  'bubble-short-stack-action': {
    fold: '继续等待会让盲注吞掉更大比例的剩余筹码，也会失去这手牌率先入池时的弃牌率。',
    shove: (scenario) => `${heroHandLabel(scenario)}既有实用胜率，也能在率先行动时立即赢得盲注，适合直接全下。`,
  },
  'math-reverse-flush': {
    fold: '更高同花和困难的后续行动，会让干净胜率低于简单按 9 张同花补牌计算的结果。',
    raise: '低同花听牌缺乏坚果潜力，对抗紧范围时是很脆弱的半诈唬。',
    call: '把每张同花牌都当作干净胜出牌，会忽略组成较低同花后输掉大底池的风险。',
  },
  'pot-control': {
    check: '过牌可以兑现现有摊牌价值，也避免面对更强对子时把底池做得过大。',
    large: '满池下注会让这手中等强度牌过多地只对抗更强范围。',
    small: '小额保护下注可以混合使用，但许多更弱牌会弃牌，而更强牌仍会继续。',
  },
  'facing-three-bet-position-call': {
    fold: '弃牌较保守，却放弃了这手牌的实用胜率、同花连张可玩性和位置优势。',
    raise: '可以选择性混合 4-bet，但持这手可玩牌时，有位置跟注是更稳定的基准。',
    call: '位置与同花连张特性有助于兑现胜率，也无需再次把底池大幅做大。',
  },
  'facing-three-bet-dominated-fold': {
    call: '面对更强的 3-bet 范围，这手不同花牌会组成太多被压制的次优对子。',
    'all-in': '直接全下通常只会得到胜率明显更高的范围跟注。',
    fold: '应放弃容易被压制的不同花牌；此前投入的开池筹码已经属于底池，不能成为继续理由。',
  },
  'tournament-reshove-discipline': {
    fold: '前位开池范围及其全下跟注范围都更强，压制这手牌的组合太多，弃牌最有纪律。',
    shove: (scenario) => `紧的前位开池者弃牌较少，且会用对${heroHandLabel(scenario)}胜率很高的范围跟注你的再全下。`,
    call: '跟注会消耗相当一部分筹码，并让容易被压制的牌在不利位置、低翻牌后空间下继续。',
  },
  'math-implied-short-fold': {
    fold: (scenario) => {
      const calculation = scenario.calculation;
      return calculation?.kind === 'implied-odds'
        ? `直接跟注需 ${calculation.directRequiredEquityPercent}% 胜率，干净改善率仅约 ${calculation.estimatedCleanEquityPercent}%；剩余筹码不足以在组成三条后补回差距。`
        : '剩余筹码太短，无法在组成三条后经常赢回足够筹码来补足直接胜率差距。';
    },
    shove: '小口袋对子对抗能够跟注全下的前位强范围胜率不足。',
    call: (scenario) => {
      const calculation = scenario.calculation;
      return calculation?.kind === 'implied-odds'
        ? `深筹码时相同跟注可能成立，但这里成牌后还需再赢约 ${calculation.minimumFutureWinBb} 个大盲，短筹码无法提供所需隐含赔率。`
        : '深筹码时相同跟注可能成立，但这里剩余价值太少，无法提供所需隐含赔率。';
    },
  },
  'suited-broadway-call': {
    call: '跟注能让较弱牌留在范围中，并利用自己的位置优势兑现这手牌的胜率。',
    fold: (scenario) => `${heroHandLabel(scenario)}对正常关煞位开池拥有太多胜率和可玩性，不应直接放弃。`,
    raise: '再加注可以少量混合，但有位置跟注是兑现这手牌胜率最简单的办法。',
  },
  'overpriced-flush': {
    raise: '诈唬加注需要可信的弃牌率；听牌本身并不能消除不利的跟注成本。',
    fold: (scenario) => {
      const calculation = scenario.calculation;
      return calculation && calculation.kind !== 'bluff' && calculation.kind !== 'implied-odds'
        ? `跟注需要 ${calculation.requiredEquityPercent}% 胜率，明显高于约 ${calculation.estimatedEquityPercent}% 的同花完成率，因此应弃牌。`
        : '跟注所需胜率明显高于同花完成率，因此应弃牌。';
    },
    call: (scenario) => {
      const calculation = scenario.calculation;
      return calculation && calculation.kind !== 'bluff' && calculation.kind !== 'implied-odds'
        ? `听牌看起来虽强，但约 ${calculation.estimatedEquityPercent}% 的胜率低于 ${calculation.requiredEquityPercent}% 的直接门槛，跟注仍然亏损。`
        : '听牌看起来虽强，但胜率低于直接底池赔率门槛，跟注仍然亏损。';
    },
  },
  'river-thin-value': {
    'all-in': '超大下注会赶走太多原本希望跟注的更弱范围。',
    small: '约 1/3 底池的下注给更弱对子合理的跟注成本，同时仍能取得价值。',
    check: '过牌保证摊牌，却会错过多个更弱对子能够提供的盈利跟注。',
  },
  'caller-nut-advantage-restraint': {
    large: '满池下注会在跟注者拥有更多顺子、三条和两对组合时，把底池做到最大。',
    check: '过牌能保护高对子，并让对抗拥有更多超强牌的范围时保持底池可控。',
    medium: '受控的价值兼保护下注能向对子和听牌收费，又不会强迫自己打最大底池。',
  },
  'small-blind-steal': {
    raise: '为价值加注，并让翻牌后拥有位置优势的大盲付出跟注成本。',
    fold: (scenario) => `${heroHandLabel(scenario)}对抗单一随机大盲范围足够强，不应直接放弃小盲。`,
    call: '部分策略会混合跛入，但持这手牌时，为价值加注是更清晰的新手基准。',
  },
  'dominated-broadway-fold': {
    call: '小幅折扣无法弥补这手牌对抗强范围时的差可玩性与不利位置。',
    fold: '紧的前位范围会压制太多这手牌组成顶对后的结果，弃牌最稳妥。',
    raise: '这手牌缺少阻挡效果和稳定胜率，不适合作为简单的诈唬再加注。',
  },
  'short-stack-three-bet-plan': {
    raise: '高效的 3-bet 尺寸能构建价值，也提前为这个筹码深度下面对全下继续做好准备。',
    fold: '这手强牌对抗宽庄家位开池范围明显领先，不能弃牌。',
    call: '跟注可以打，但会错失价值，并让庄家位便宜兑现胜率。',
  },
  'bubble-ladder-discipline': {
    fold: '牌力边缘、筹码领先者能施加最大压力，而且仍有一名只剩 4 个大盲的玩家；保留中筹码更重要。',
    shove: '最短筹码即将被盲注吞没时，没有必要让整份中筹码穿过筹码领先者冒险。',
    raise: '开池会给覆盖你的筹码领先者再全下机会，而你的范围很难舒适防守。',
  },
  'read-sticky-bluff-restraint': {
    large: '增加风险无法修复较差的阻挡牌，也无法让多次继续的对手范围突然愿意弃牌。',
    check: '这手牌阻挡效果差，而且既有跟注样本说明达成所需弃牌率的可能性很低。',
  },
  'turn-value': {
    check: '过牌能控制底池，却会错过从更弱对子和听牌获得价值。',
    bet: '半池下注能瞄准多种更弱手牌，同时向现有听牌收费。',
    'all-in': '超大额全下会赶走太多原本希望继续跟注的更弱范围。',
  },
  'missed-draw': {
    small: '小注给爱跟注的对手便宜的跟注成本，而且没有明确的更好手牌弃牌目标。',
    check: '弃牌率低且阻挡牌较差，因此有纪律地放弃诈唬最合理。',
    pot: '没有证据表明对手会弃掉足够多的一对；加大下注只会承担更多风险。',
  },
  'blocker-three-bet-plan': {
    fold: '弃牌可以接受，但会放弃 A 阻挡牌和同花小牌的顺子潜力。',
    call: '跟注利用了底池赔率，却无法立即向宽开池范围施压。',
    raise: 'A 阻挡高对子和强 A 牌的继续组合，同花小牌也保留多种改善路径，适合用作 3-bet。',
  },
  'overlimp-small-pair': {
    raise: '隔离加注可以使用，但小对子不喜欢面对多名跟注者和翻牌后压力。',
    fold: '若牌桌进攻性强，弃牌没有问题；但题目给出的深筹码和低挤压条件支持便宜跟注。',
    call: '深筹码、位置优势和较低挤压风险，共同支持低成本埋伏三条。',
  },
  'out-of-position-three-bet-size': {
    'small-raise': '这个尺寸太小，会给开池者和大盲有吸引力的底池赔率来兑现胜率。',
    call: '跟注可以打，但会邀请大盲加入，也错过一次清晰的价值再加注。',
    raise: '不利位置使用更大的 3-bet，既能构建价值，也会向开池者的位置优势收费。',
  },
  'bubble-premium-call': {
    fold: '泡沫期压力会改变边缘跟注，但这手顶级强牌对宽小盲全下范围领先太多，不能弃掉。',
    call: '即使被对手覆盖，这手顶级强牌仍明显超过更高的锦标赛跟注门槛。',
  },
  'no-equity-turn-give-up': {
    medium: '翻牌已被跟注，而相连转牌强化了对手范围；再做常规下注很难让足够多的更好牌弃掉。',
    check: '这手牌几乎没有改善胜率，同时跟注者范围变强，过牌可以干净地放弃。',
    overbet: '加大尺寸无法修复低胜率、弱阻挡牌，以及明显更有利于跟注者的转牌。',
  },
  'river-bluff-catch-fold': {
    raise: '诈唬加注会让剩余筹码暴露在两极化且价值偏重的范围面前。',
    call: (scenario) => {
      const calculation = scenario.calculation;
      return calculation && calculation.kind !== 'bluff' && calculation.kind !== 'implied-odds'
        ? `跟注需要约 ${calculation.requiredEquityPercent}% 胜率，远高于这条价值偏重行动线的 ${calculation.estimatedEquityPercent}% 现实估算。`
        : '跟注所需胜率远高于这条价值偏重行动线的现实诈唬估算。';
    },
    fold: (scenario) => {
      const calculation = scenario.calculation;
      return calculation && calculation.kind !== 'bluff' && calculation.kind !== 'implied-odds'
        ? `有纪律地弃牌，避免用约 ${calculation.estimatedEquityPercent}% 的估算胜率去支付 ${calculation.requiredEquityPercent}% 的门槛。`
        : '有纪律地弃牌，避免用过低的估算胜率支付过高门槛。';
    },
  },
  'tournament-calloff-fold': {
    call: '跟注没有弃牌率，却要把剩余筹码投入对抗明显更强的前位全下范围。',
    fold: '前位全下范围压制太多组合，已投入的大盲也无法提供足够胜率，弃牌正确。',
  },
  'tournament-early-shove-fold': {
    shove: '身后仍有 5 名尚未行动的玩家可能拿到更强牌，这个全下作为实用基准过宽。',
    fold: '身后仍有 5 名玩家尚未行动，这手牌太容易被更强范围压制或跟注，因此应弃牌。',
    limp: '公开跛入会花掉稀缺筹码，却没有弃牌压力，也没有面对加注的清晰计划。',
  },
  'middle-pair-open': {
    fold: '弃牌较保守；这手口袋对子通常足够强，可以从当前位置开池。',
    limp: '公开跛入会邀请身后施压，也让自己的入池范围更容易被识别。',
    raise: '率先入池时加注，即使没有组成三条，也保留立即赢下底池的路径。',
  },
  'ace-blocker-three-bet': {
    call: '跟注利用了底池赔率，但会在不利位置且没有主动权的情况下打翻牌后。',
    fold: '弃牌可以接受，却放弃了 A 阻挡效果和同花牌的可玩性。',
    raise: 'A 会阻挡顶级继续范围，同花小牌又保留顺子潜力，适合有选择地 3-bet。',
  },
  'semi-bluff-size': {
    'all-in': '较小下注已经能制造相近的弃牌率，巨大推注却让整份筹码承担不必要的风险。',
    half: '半池下注结合弃牌率和 8 张顺子补牌，同时把风险控制在合理范围。',
    check: '过牌能安全兑现听牌胜率，却放弃让更好高牌立即弃牌的机会。',
  },
  'math-half-pot-bluff': {
    bet: (scenario) => {
      const calculation = scenario.calculation;
      return calculation?.kind === 'bluff'
        ? `冒险 ${calculation.riskBb} 个大盲争夺 ${calculation.rewardBb} 个大盲，需要约 ${calculation.requiredFoldPercent}% 弃牌率，低于有依据的 40% 估算。`
        : '半池诈唬所需弃牌率低于有依据的 40% 估算，因此可以下注。';
    },
    'all-in': '题目只支持经过计算的半池诈唬，并不支持未经计算的极端全下尺寸。',
    check: (scenario) => {
      const calculation = scenario.calculation;
      return calculation?.kind === 'bluff'
        ? `过牌可以安全放弃，但题目给出的 40% 弃牌率估算高于 ${calculation.requiredFoldPercent}% 的纯诈唬门槛。`
        : '过牌可以安全放弃，但题目给出的弃牌率估算高于纯诈唬门槛。';
    },
  },
  'math-pot-bluff-fold': {
    check: (scenario) => {
      const calculation = scenario.calculation;
      return calculation?.kind === 'bluff'
        ? `估算弃牌率只有 35%，明显低于冒险 ${calculation.riskBb} 个大盲争夺 ${calculation.rewardBb} 个大盲所需的 ${calculation.requiredFoldPercent}% 门槛，因此应过牌。`
        : '估算弃牌率只有 35%，低于满池纯诈唬所需的 50%，因此应过牌。';
    },
    bet: (scenario) => {
      const calculation = scenario.calculation;
      return calculation?.kind === 'bluff'
        ? `冒险 ${calculation.riskBb} 个大盲争夺 ${calculation.rewardBb} 个大盲，需要 ${calculation.requiredFoldPercent}% 的范围弃牌；现有证据只支持 35%。`
        : '满池纯诈唬需要一半范围弃牌，现有证据只支持 35%，下注亏损。';
    },
  },
  'river-raise-discipline': {
    call: '跟注能留下诈唬与更弱同花，同时限制对抗坚果牌偏重范围时的损失。',
    raise: '加注会赶走许多更弱手牌，而最可能继续的反而是更高同花。',
    fold: '弃牌较谨慎，却会对包含更弱价值牌和诈唬的小额下注放弃过多。',
  },
  'late-open-value-three-bet': {
    raise: '这个尺寸能构建价值、阻止对手便宜兑现胜率，也让较弱强牌仍有继续空间。',
    fold: '这手强牌远远领先宽庄家位开池范围，不能弃牌。',
    call: '跟注让庄家位保留宽范围，却会错失价值，并让对手便宜兑现胜率。',
  },
  'blind-defense': {
    fold: (scenario) => `较大开池尺寸提高了跟注成本，而${heroHandLabel(scenario)}在不利位置很难兑现胜率，因此应弃牌。`,
    call: (scenario) => {
      const calculation = scenario.calculation;
      return calculation && calculation.kind !== 'bluff' && calculation.kind !== 'implied-odds'
        ? `跟注在尚未计入差可玩性前就需要约 ${calculation.requiredEquityPercent}% 胜率；已经投入的大盲属于底池，不能当作继续理由。`
        : '跟注在尚未计入差可玩性前就需要很高胜率；已经投入的大盲属于底池，不能当作继续理由。';
    },
    raise: '这手牌阻挡效果和可玩性都很差，不适合作为诈唬再加注。',
  },
  'tournament-small-blind-shove': {
    limp: '跛入可用于成熟策略，但筹码很浅且翻牌后处于不利位置，会留下困难决策。',
    shove: '全下能向单一随机范围施加最大弃牌压力，被跟注时也能完整兑现手牌胜率。',
    fold: (scenario) => `${heroHandLabel(scenario)}足以向单一随机大盲范围施压，不应直接放弃小盲。`,
  },
  'tournament-deep-open': {
    shove: '冒险超过 35 个大盲会赶走较弱牌，却只得到不必要地偏强范围的行动。',
    fold: (scenario) => `${heroHandLabel(scenario)}在前面都弃牌后，完全足以从关煞位开池。`,
    raise: '高效的小额开池既能构建价值，也保留面对后续行动的决策空间。',
  },
  'math-semibluff-equity': {
    check: '过牌能兑现听牌胜率，却会放弃让当前领先的手牌立即弃牌。',
    'all-in': '这手听牌无需极端超额下注，也能同时利用改善胜率和弃牌压力。',
    bet: '受控的半诈唬可立即赢下底池，被跟注时也保留干净的改善胜率。',
  },
  'isolate-limper': {
    call: '跟注保持底池较小，却会邀请两个盲注加入，也错失强力隔离机会。',
    fold: '这手强牌对抗单一跛入范围明显过强，不能弃牌。',
    raise: '加注能构建价值、阻止盲注便宜加入，并争取有位置单挑跛入者。',
  },
  'tournament-call-short-shove': {
    fold: (scenario) => `${heroHandLabel(scenario)}对宽后位全下范围过强，不能连同已投入的大盲和底池一起放弃。`,
    call: '这手牌对庄家位的宽短筹码全下范围有强胜率，已投入的大盲也改善了底池赔率。',
  },
  'tournament-medium-open': {
    shove: '直接全下会冒险超过 20 个大盲；小额开池能获得相近弃牌率，也让更弱牌继续。',
    fold: (scenario) => `庄家位优势和扎实牌力，使弃掉${heroHandLabel(scenario)}明显过紧。`,
    raise: '小额开池能施加压力，也保留面对任一盲注全下时按计划回应的空间。',
  },
  'button-value': {
    raise: '加注能构建价值、向更弱牌施压，并保留翻牌后的位置优势。',
    limp: '部分成熟策略会混合跛入，但为价值加注是更简单清晰的基准。',
    fold: '这手强牌对抗单一随机大盲范围领先太多，不能弃牌。',
  },
  'multi-limper-isolate': {
    call: '跟注会邀请两个盲注加入，也错失从两名跛入者取得大量价值的机会。',
    fold: '这手强牌远远领先常见跛入范围，不能弃牌。',
    raise: '面对两名跛入者要增加隔离尺寸，用强牌缩小入池人数。',
  },
  'river-bad-bluff-candidate': {
    small: '小尺寸恰好给希望赶走的一对范围有吸引力的跟注成本。',
    check: '对手爱跟注、阻挡牌差且没有摊牌价值时，过牌能避免一次缺乏依据的进攻。',
    large: '这手牌阻挡对手可能弃掉的组合，却没有阻挡最强跟注牌，因此大额诈唬缺少支持。',
  },
  'math-implied-set-call': {
    fold: '弃牌能避免波动，但深筹码、有位置和低挤压风险支持保守地埋伏三条。',
    raise: '小口袋对子对紧的继续范围表现较差，也没有必要把它转成诈唬。',
    call: (scenario) => {
      const calculation = scenario.calculation;
      return calculation?.kind === 'implied-odds'
        ? `位置、深筹码和低挤压风险支持跟注；虽还需在成牌后再赢约 ${calculation.minimumFutureWinBb} 个大盲，但强范围具备支付能力。`
        : '位置、深筹码、低挤压风险，以及对手组成三条后可能支付，共同支持跟注。';
    },
  },
  'river-polarized-value': {
    check: '过牌会让范围顶端失去价值，而对手仍有多种强牌能够跟注。',
    small: '小注可以获得跟注，但对手有不少强抓诈唬牌时，会留下太多价值。',
    overbet: '坚果同花支持两极化超额下注，较低同花和部分抓诈唬牌仍可能支付。',
  },
  'premium-three-bet': {
    fold: '这手牌位于开池范围最顶端，面对一次正常 3-bet 绝不能弃牌。',
    call: '跟注可以设陷阱，却会少拿价值，也让对手便宜兑现胜率。',
    raise: '受控的价值 4-bet 能构建底池，同时让较弱的顶级牌仍有继续空间。',
  },
  'set-mine-price': {
    raise: '再加注可以混合使用，但往往赶走更弱牌，并只面对强继续范围。',
    fold: '弃牌能避免波动，但深筹码和位置优势使跟注具备可行性。',
    call: '深筹码与位置提供足够上行空间，使组成三条后的回报能够支持跟注。',
  },
  'read-frequent-folder-pressure': {
    check: '过牌能兑现听牌胜率，却会放弃既有样本支持的弃牌压力。',
    bet: '受控的连续下注结合干净改善胜率，以及对手过去频繁弃牌的相关证据。',
    'all-in': '样本支持增加压力，却不支持在较小下注已能制造弃牌时冒险整份筹码。',
  },
  'turn-favors-caller-check': {
    check: '过牌能保护摊牌价值，也避免对抗新完成的顺子与两对时打大底池。',
    small: '小额保护下注可以混合，但一旦跟注者强力施压，就必须谨慎弃牌。',
    large: '满池下注所针对的转牌，会把跟注者的许多对子和听牌改善成更强牌。',
  },
  'short-stack-open': {
    limp: '跛入会放弃主动权，也会在身后受压时制造尴尬决策。',
    raise: '小额开池承担风险较少，也为面对较短筹码再加注预先留下计划空间。',
    fold: (scenario) => `${heroHandLabel(scenario)}在当前筹码深度是明确的价值开池，不能弃牌。`,
  },
  'marginal-four-bet-fold': {
    call: '跟注会在不利位置形成大底池，而且对手范围过于频繁地压制这手牌。',
    'all-in': '全下通常只会得到胜率明显更高的手牌跟注。',
    fold: '面对强前位 4-bet 范围，这手牌没有足够稳健的继续能力，弃牌正确。',
  },
  'early-discipline': {
    fold: (scenario) => `${heroHandLabel(scenario)}缺少高张强度与可玩性，而且身后仍有 5 名尚未行动的玩家可以施压。`,
    limp: '公开跛入会用弱牌进入多人底池，而且没有位置优势。',
    raise: '在六人桌前位，这手牌太弱，不属于清晰的开池范围。',
  },
  'four-bet-premium-value': {
    fold: '这手牌位于开池范围最顶端，绝不能面对一次 3-bet 就弃牌。',
    call: '跟注可以设陷阱，却会错失对抗强继续范围构建底池的最清晰机会。',
    raise: '紧凑的价值 4-bet 能构建底池，也给 3-bet 者用较弱牌继续的空间。',
  },
  'tournament-avoid-deep-shove': {
    fold: '这手牌对抗三人桌盲注再加注范围过强，不能弃牌。',
    raise: '受控的价值 4-bet 既能构建底池，也让较弱牌继续，并保留最终决策空间。',
    shove: '超过 30 个大盲的全下会赶走大部分较弱范围，却更常被较强范围跟注。',
  },
  'read-small-sample': {
    check: '这手牌没有明确价值目标或有依据的诈唬；仅 2 次观察不足以支持极端调整。',
    large: (scenario) => `单次跟注不能证明稳定倾向，而且${heroHandLabel(scenario)}也没有明确的更好手牌弃牌目标。`,
  },
  'flush-draw-price': {
    fold: (scenario) => {
      const calculation = scenario.calculation;
      return calculation && calculation.kind !== 'bluff' && calculation.kind !== 'implied-odds'
        ? `9 张干净同花补牌到河牌约有 ${calculation.estimatedEquityPercent}% 胜率，明显高于 ${calculation.requiredEquityPercent}% 的跟注门槛，不能弃牌。`
        : '9 张干净同花补牌到河牌约有 35% 胜率，高于跟注门槛，不能弃牌。';
    },
    call: (scenario) => {
      const calculation = scenario.calculation;
      return calculation && calculation.kind !== 'bluff' && calculation.kind !== 'implied-odds'
        ? `跟注需要 ${calculation.requiredEquityPercent}% 胜率，而 9 张干净同花补牌到河牌约有 ${calculation.estimatedEquityPercent}% 胜率，跟注盈利。`
        : '9 张干净同花补牌的胜率高于跟注门槛，直接跟注盈利。';
    },
    raise: '半诈唬可以成立，但还要额外假设对手会弃牌；直接跟注是最清晰的数学基准。',
  },
  'read-pressure-bluff-catch': {
    call: '合理的跟注成本、多个未成听牌和已有的频繁进攻样本，共同支持抓诈唬跟注。',
    fold: '弃牌波动较低，却可能过度尊重一个来自已观察到频繁施压范围的小额下注。',
    raise: '跟注能保留诈唬；加注会赶走它们，却主要得到最强价值牌的行动。',
  },
  'turn-straight-price': {
    call: (scenario) => {
      const calculation = scenario.calculation;
      return calculation && calculation.kind !== 'bluff' && calculation.kind !== 'implied-odds'
        ? `跟注只需约 ${calculation.requiredEquityPercent}% 胜率，低于题目给出的 ${calculation.estimatedEquityPercent}% 顺子听牌命中率。`
        : '跟注所需胜率低于顺子听牌命中率，因此盈利。';
    },
    'all-in': '直接跟注盈利，并不代表在没有弃牌率证据时应该冒险整份筹码。',
    fold: (scenario) => {
      const calculation = scenario.calculation;
      return calculation && calculation.kind !== 'bluff' && calculation.kind !== 'implied-odds'
        ? `听牌约有 ${calculation.estimatedEquityPercent}% 胜率，而跟注只需 ${calculation.requiredEquityPercent}%；弃牌会放弃有利底池赔率。`
        : '听牌胜率高于跟注门槛，弃牌会放弃有利底池赔率。';
    },
  },
  'river-bluff-catch': {
    fold: (scenario) => {
      const calculation = scenario.calculation;
      return calculation && calculation.kind !== 'bluff' && calculation.kind !== 'implied-odds'
        ? `跟注需要约 ${calculation.requiredEquityPercent}% 胜率；可信的 ${calculation.estimatedEquityPercent}% 估算不足以支持跟注。`
        : '可信的估算胜率低于跟注门槛，因此应弃牌。';
    },
    call: (scenario) => {
      const calculation = scenario.calculation;
      return calculation && calculation.kind !== 'bluff' && calculation.kind !== 'implied-odds'
        ? `顶对看起来很强，但 ${calculation.estimatedEquityPercent}% 的估算胜率低于 ${calculation.requiredEquityPercent}% 的跟注成本门槛，跟注亏损。`
        : '顶对看起来很强，但估算胜率低于跟注成本门槛。';
    },
    raise: '把摊牌价值转成诈唬，需要题目中并不存在的阻挡牌与弃牌率证据。',
  },
  'suited-connector-defense': {
    fold: '弃牌能避开不利位置，却会在面对宽范围小尺寸开池时防守过紧。',
    raise: '再加注可以少量混合，但跟注是兑现这手可玩牌胜率最简单的办法。',
    call: '大盲折扣与同花连张特性，使这成为一个实用的盲注跟注。',
  },
  'tournament-button-shove': {
    fold: (scenario) => `${heroHandLabel(scenario)}拥有足够胜率和后位弃牌压力，不应直接放弃盲注。`,
    raise: '小额加注可用于成熟策略，但在这个筹码深度会产生困难的加注后弃牌分支。',
    shove: (scenario) => `全下向两个宽盲注范围施压，被跟注时也能完整兑现${heroHandLabel(scenario)}的胜率。`,
  },
  'squeeze-value': {
    fold: '这手顶级强牌接近范围顶端，在这里绝不能弃牌。',
    raise: '更大的挤压尺寸能同时向两名玩家收费，并降低形成多人底池的概率。',
    call: '跟注可以设陷阱，却会邀请第四名玩家加入，也错失从两个范围取得价值。',
  },
  'bubble-covering-call': {
    fold: '弃牌能保住领先，但面对最短筹码的宽全下范围，会放弃一个符合底池赔率的机会。',
    call: '你覆盖最短筹码，失利后仍有筹码，而且对其后位范围拥有强胜率，因此可以跟注。',
  },
  'river-showdown-check': {
    check: '这手牌保有实用摊牌价值，却无法列出足够多愿意支付河牌下注的更弱手牌。',
    large: '满池下注会赶走更弱牌，却得到通常已经击败这手中等牌的范围行动。',
    small: '极小下注有时能瞄准更低对子，但可取得的价值空间很窄。',
  },
  'brick-turn-value-barrel': {
    medium: '略大于半池的下注能向听牌收费，同时让多种更弱成牌继续。',
    check: '过牌能保护手牌，却会错过更弱顶对、第二对和现有听牌提供的价值。',
    overbet: '超大下注会赶走太多强顶对原本希望继续跟注的更弱范围。',
  },
  'river-blocker-bluff': {
    check: '放弃诈唬可以接受，但没有利用坚果花色阻挡牌向受限的过牌范围施压。',
    large: '两极化大注向一对牌施压，而坚果花色阻挡牌会移除重要的强跟注组合。',
    small: '小注给许多对子和低同花过于便宜的抓诈唬成本。',
  },
  'tournament-value-reshove': {
    fold: '这手强牌远远领先宽庄家位开池范围，不能弃牌。',
    call: '跟注能保留宽范围，却会放弃即时价值，并让开池者兑现胜率。',
    shove: '再全下可以立即赢得死钱；被跟注时，对庄家位继续范围仍有强胜率。',
  },
  'equity-driven-turn-barrel': {
    medium: '受控的第二次下注结合听牌胜率，并向一对牌与较弱未成牌施压。',
    overbet: '较小下注已经能让相同的中等强度范围弃牌，无需承担超大风险。',
    check: '过牌能保证兑现听牌胜率，却会放弃让中等强度牌立即弃牌的机会。',
  },
  'read-sticky-thin-value': {
    check: '过牌能保护结果，却会错过既有样本支持的、来自爱跟注弱范围的价值。',
    small: '适中小注给更弱对子合理的跟注成本，也利用了对手多次跟注的证据。',
    'all-in': '极端尺寸仍会赶走目标弱牌，并让继续范围过度集中于更强牌。',
  },
  'three-bet-pot-connected-check': {
    large: '跟注者拥有许多对子、两对、三条和听牌，能够对大注继续或加注。',
    check: '过牌能保留两张高牌的改善胜率，也避免在强跟注与加注很多的牌面做大底池。',
    small: '有更好阻挡牌时可以混合小注，但这手牌没有必要强迫对手立即弃牌。',
  },
  'cutoff-open': {
    fold: (scenario) => `${heroHandLabel(scenario)}在前面都弃牌后，足够强到可以从关煞位入池。`,
    limp: '公开跛入会放弃即时压力，并邀请形成多人底池。',
    raise: '统一的小额加注既能构建价值，也有机会立即赢下盲注。',
  },
  'release-three-bet-bluff': {
    call: '这手同花 A 对抗 4-bet 范围没有足够胜率或兑现条件。',
    'all-in': '把诈唬变成 5-bet 全下，会用整份筹码对抗对手最强范围。',
    fold: '施压牌已经完成任务；当对手代表明显更强范围时，应按计划弃牌。',
  },
  'bubble-leader-pressure': {
    raise: '紧凑开池能向两个受限盲注范围施压，同时保留回应全下的空间。',
    shove: '小额开池已能取得大部分泡沫期压力，没有必要冒险超过 30 个大盲。',
    fold: (scenario) => `${heroHandLabel(scenario)}的牌力与庄家位压力足以对抗两个受限范围，弃牌过紧。`,
  },
  'river-thin-value-target': {
    check: '过牌保证摊牌，却会错过更弱顶对和顽固低对提供的价值。',
    small: '有吸引力的小尺寸能瞄准更弱一对，又不会迫使对手范围只剩强牌。',
    overbet: '超额下注会赶走许多被你击败的牌，却更常得到更强范围的跟注。',
  },
  'bubble-medium-stack-calloff': {
    fold: '仍有一名只剩 6 个大盲的玩家时，保住第二大筹码比按纯筹码价值计算的边缘跟注更重要。',
    call: (scenario) => `${heroHandLabel(scenario)}按纯筹码价值计算可能接近门槛，但跟注没有弃牌率，失利会在最短筹码之前出局。`,
  },
};

function choiceFeedback(scenario: ScenarioSpot, choice: ScenarioChoice): string {
  const feedback = choiceFeedbackChinese[templateId(scenario.id)]?.[choice.id];
  if (!feedback) {
    throw new Error(`Missing Chinese scenario feedback: ${templateId(scenario.id)}/${choice.id}`);
  }
  return typeof feedback === 'function' ? feedback(scenario) : feedback;
}

function scenarioCopy(scenario: ScenarioSpot): ScenarioCopy {
  const math = mathSummary(scenario);
  const common: Record<string, ScenarioCopy> = {
    ...phase7ScenarioChineseCopy,
    'button-value': {
      focus: '翻牌前价值', opponentAction: '单挑局行动轮到庄家位。', prompt: '最清晰的新手基准是什么？',
      reasoning: '这手强牌领先随机大盲范围。为价值加注，同时保留翻牌后的位置优势。', takeaway: '庄家位强牌应为价值加注，并利用位置实现优势。',
    },
    'blind-defense': {
      focus: '盲注防守', opponentAction: '庄家位用较大尺寸开池；你在大盲已投入 1 个大盲。', prompt: '你应该如何防守？',
      reasoning: math ?? '较大开池尺寸提高了跟注成本，而且这手弱牌在不利位置难以兑现胜率。', takeaway: '面对小尺寸可以扩大防守；跟注成本升高时，要放弃最弱的牌。',
    },
    'flush-draw-price': {
      focus: '听牌与底池赔率', opponentAction: '大盲在翻牌圈下注，你持坚果同花听牌。', prompt: '哪项回应最符合直接底池赔率？',
      reasoning: math ?? '九张干净同花补牌到河牌约有 35% 命中率，应和跟注后的最终底池计算出的底池赔率比较。', takeaway: '比较听牌胜率时，要使用跟注后的最终底池，而不是下注前的底池。',
    },
    'turn-value': {
      focus: '价值下注', opponentAction: '大盲连续第二次过牌。', prompt: '持强顶对时应该如何继续？',
      reasoning: '多种更弱的一对和听牌仍会继续。中等尺寸可以取得价值，又不会只留下最强范围。', takeaway: '价值下注前，先说出哪些更弱手牌会按这个跟注成本继续。',
    },
    'river-bluff-catch': {
      focus: '抓诈唬', opponentAction: '大盲在河牌圈超额下注；你只有抓诈唬牌。', prompt: '这个下注尺寸要求你怎么做？',
      reasoning: math ?? '估算胜率低于跟注所需胜率，因此即使绝对牌力看起来不错，也应弃牌。', takeaway: '不要让绝对牌力盖过底池赔率和基于范围的胜率估算。',
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
      focus: '面对再加注', opponentAction: '你开池后，大盲在翻牌前做 3-bet。', prompt: '范围顶端的强牌应如何最清晰地取得价值？',
      reasoning: '范围顶端的强牌希望对抗对手较强的继续范围做大底池。受控的 4-bet 能取得价值，无需直接全下。', takeaway: '持范围顶端的牌面对压力时，应继续构建价值，而不是害怕结果。',
    },
    'early-discipline': {
      focus: '前位纪律', opponentAction: '你第一个行动，身后仍有五名尚未行动的玩家。', prompt: '六人桌前位最清晰的基准是什么？',
      reasoning: '位置会改变入池门槛。身后五名玩家中任何一人都可能拿到更强牌，而且你在翻牌后经常处于不利位置。', takeaway: '前位要收紧开池范围，因为身后更多玩家可能拿到强牌。',
    },
    'cutoff-open': {
      focus: '关煞位开池', opponentAction: '前面的玩家都弃牌，轮到你；庄家位和两个盲注位仍在身后。', prompt: '率先入池时最清晰的行动是什么？',
      reasoning: '这手牌的牌力和你的位置，足以支持在关煞位盈利开池。统一使用 2.5 个大盲可让策略保持清晰。', takeaway: '身后玩家越少，开池范围可以越宽，但应以加注而非跛入来入池。',
    },
    'button-suited-open': {
      focus: '庄家位开池', opponentAction: '前面的玩家都弃牌，只剩两个盲注位。', prompt: '位置应如何影响这手牌？',
      reasoning: '身后只剩两名玩家，且被跟注后能保证位置优势，因此这是一手实用的庄家位开池牌。', takeaway: '后位可以扩大开池范围，因为身后玩家更少，而且翻牌后最后行动。',
    },
    'small-blind-steal': {
      focus: '小盲开池', opponentAction: '所有玩家都弃到你；你已经投入 0.5 个大盲。', prompt: '最简单的价值优先计划是什么？',
      reasoning: '这手牌领先随机大盲范围。即使翻牌后要先行动，加注仍能构建价值。', takeaway: '前面都弃牌、轮到小盲行动时，可以用扎实手牌进攻，但要记住翻牌后的位置劣势。',
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
      reasoning: '小对子通常需要组成三条才能赢得大底池。深筹码、被动桌况和庄家位支持便宜跟注。', takeaway: '只有手牌、筹码深度、位置和桌况都适合多人底池时，才选择跟着跛入。',
    },
    'short-stack-open': {
      focus: '短筹码开池', opponentAction: '前面的玩家都弃牌，轮到你；有效筹码为 25 个大盲。', prompt: '较短筹码应如何影响开池？',
      reasoning: '25 个大盲时，这手牌仍是强开池牌；较小尺寸可以保留应对身后再加注的空间。', takeaway: '筹码变短时使用高效开池尺寸，并在加注前计划如何应对全下。',
    },
  'suited-broadway-call': {
      focus: '有位置跟注', opponentAction: '关煞位加注到 2.5 个大盲，两个盲注位仍在身后。', prompt: '最清晰的基准是什么？',
      reasoning: '这手牌对抗关煞位范围表现良好，而且通常有位置。跟注可避免对抗更强继续范围时过度扩大底池。', takeaway: '有位置的强可玩牌可以跟注，不必把每次继续都变成再加注。',
    },
    'dominated-broadway-fold': {
      focus: '避免被压制', opponentAction: '一名纪律严谨的前位玩家加注到 3 个大盲。', prompt: '面对这个范围应如何处理？',
      reasoning: '这手牌对抗紧的前位开池经常组成次优对子，而且翻牌后每条街都处于不利位置。', takeaway: '开池者位置越早、尺寸越大，就越应弃掉容易被压制的不同花高张牌。',
    },
    'set-mine-price': {
      focus: '埋伏三条条件', opponentAction: '前位加注到 2.5 个大盲。有效筹码 100 个大盲，而且盲注位较被动。', prompt: '哪种回应最能发挥小对子？',
      reasoning: '小对子很少在翻牌组成三条，因此需要较深筹码、合理的跟注成本和较好的胜率兑现条件。', takeaway: '只有跟注成本、筹码深度、位置与身后玩家都支持未来回报时，才适合埋伏三条。',
    },
    'ace-blocker-three-bet': {
      focus: '阻挡牌再加注', opponentAction: '频繁开池的庄家位加注到 2.5 个大盲，小盲弃牌。', prompt: '这手牌适合采用哪种进攻打法？',
      reasoning: '同花小 A 阻挡 A-A、A-K 和 A-Q，且被跟注后仍有顺子与同花潜力，因此适合偶尔施压。', takeaway: '诈唬再加注应基于阻挡效果和可玩性，而不是因为牌弱。',
    },
    'squeeze-value': {
      focus: '价值挤压', opponentAction: '关煞位加注到 2.5 个大盲，庄家位跟注，大盲仍在身后。', prompt: '最清晰的价值打法是什么？',
      reasoning: '这手牌大幅领先开池者与跟注者的继续范围。再加注能构建价值，并阻止大盲便宜加入。', takeaway: '加注被跟注后，用更大的价值尺寸向两个范围收费并减少入池人数。',
    },
    'marginal-four-bet-fold': {
      focus: '面对 4-bet', opponentAction: '你把前位开池 3-bet 到 10 个大盲，对手 4-bet 到 24 个大盲。', prompt: '有纪律的基准是什么？',
      reasoning: '此前行动和位置表明对手的 4-bet 范围非常强。已经投入的筹码不能弥补继续时的低胜率。', takeaway: '做 3-bet 前先规划好后续；当再加注代表更强范围时，要放弃边缘牌。',
    },
    'short-stack-reshove': {
      focus: '短筹码再加注', opponentAction: '庄家位加注到 2.5 个大盲，有效筹码为 20 个大盲。', prompt: '筹码深度应如何影响价值回应？',
      reasoning: '20 个大盲时，这手强牌对庄家位的开池和继续范围有良好胜率。直接全下可以阻止对手兑现胜率，也能避免尴尬的小额再加注。', takeaway: '短筹码面对较宽的后位开池时，强牌更适合直接投入。',
    },
    'suited-connector-defense': {
      focus: '可玩盲注防守', opponentAction: '庄家位加注到 2.25 个大盲，小盲弃牌；你已投入 1 个大盲。', prompt: '底池赔率与可玩性应如何影响这手牌？',
      reasoning: '同花连张获得有利的底池赔率，也能组成隐蔽顺子和同花。这些特性有助于它在翻牌后先行动时兑现胜率。', takeaway: '面对后位小尺寸开池，同花且可玩的牌可以比不相连的不同花牌防守更宽。',
    },
    'late-open-value-three-bet': {
      focus: '面对后位开池做价值 3-bet', opponentAction: '庄家位加注到 2.5 个大盲，小盲弃牌。', prompt: '哪种计划能最清晰地从强牌获得价值？',
      reasoning: '这手牌大幅领先庄家位的开池与继续范围。不利位置加到 9 个大盲可以构建价值，同时仍让较弱但不错的牌继续。', takeaway: '先建立 3-bet 的价值核心，再加入少量施压牌。',
    },
    'blocker-three-bet-plan': {
      focus: '用阻挡牌做 3-bet', opponentAction: '频繁开池的庄家位加注到 2.5 个大盲，小盲弃牌。', prompt: '哪种进攻计划的结构最合理？',
      reasoning: '同花小 A 会减少 A-A、A-K 与 A-Q 的组合，同时保有顺子与同花潜力，因此适合有选择地诈唬 3-bet。', takeaway: '施压牌应依靠阻挡效果与可玩性，而不是只因牌太弱而无法跟注。',
    },
    'out-of-position-three-bet-size': {
      focus: '不利位置的 3-bet 尺寸', opponentAction: '关煞位加注到 2.5 个大盲；被跟注后你将处于不利位置。', prompt: '哪个尺寸最能支持价值计划？',
      reasoning: '不利位置应使用更大的 3-bet。加到 11 个大盲既能构建价值，也会提高开池者利用位置继续的成本。', takeaway: '面对相同开池尺寸，不利位置的 3-bet 应大于有位置时。',
    },
    'facing-three-bet-position-call': {
      focus: '有位置跟注 3-bet', opponentAction: '你开池到 2.5 个大盲，大盲 3-bet 到 10 个大盲。', prompt: '最清晰的基准是什么？',
      reasoning: '这手牌可以组成强对子、顺子和同花，而且翻牌后最后行动。跟注可以让对手较弱的 3-bet 牌留在范围中，也避免只对抗最强的继续范围。', takeaway: '位置与稳定的可玩性，可以让跟注 3-bet 成为最佳基准。',
    },
    'facing-three-bet-dominated-fold': {
      focus: '面对 3-bet 弃掉被压制牌', opponentAction: '你开池到 2.5 个大盲，小盲 3-bet 到 11 个大盲，大盲弃牌。', prompt: '应该如何回应？',
      reasoning: '这手不同花牌经常被压制，而且面对来自不利位置的较大再加注。已经投入的 2.5 个大盲不能让亏损的继续变正确。', takeaway: '把开池筹码视为沉没成本；只有手牌能承受新的范围和跟注成本时才继续。',
    },
    'four-bet-premium-value': {
      focus: '价值 4-bet', opponentAction: '你开池到 2.5 个大盲，小盲 3-bet 到 11 个大盲，大盲弃牌。', prompt: '哪种打法能最清晰地构建价值？',
      reasoning: '这手牌希望对抗小盲的强继续牌构建更大底池。受控的 4-bet 能取得价值，无需使用不必要的直接全下尺寸。', takeaway: '用范围顶端做价值 4-bet，并选择仍会被较弱牌跟注的尺寸。',
    },
    'release-three-bet-bluff': {
      focus: '放弃 3-bet 诈唬', opponentAction: '你把关煞位开池 3-bet 到 10 个大盲，对手 4-bet 到 24 个大盲。', prompt: '这手牌最初的计划是什么？',
      reasoning: '这手牌用于在翻牌前制造弃牌，而不是面对任何后续加注都继续。4-bet 把对手范围收窄到明显领先这手施压牌的部分。', takeaway: '好的 3-bet 诈唬计划，也包括面对对手进一步加注时有纪律地弃牌。',
    },
    'short-stack-three-bet-plan': {
      focus: '短筹码 3-bet 投入计划', opponentAction: '庄家位加注到 2.5 个大盲，小盲弃牌；有效筹码为 30 个大盲。', prompt: '哪种计划最能利用较短筹码？',
      reasoning: '30 个大盲时，这手强牌对庄家位的开池与继续范围都有良好胜率。较小而高效的 3-bet 可以降低筹码底池比（SPR），并提前准备应对全下。', takeaway: '筹码变短时，要在做 3-bet 前决定价值牌是否会面对全下继续。',
    },
    'three-bet-pot-dry-range-bet': {
      focus: '干燥 3-bet 底池的范围下注', opponentAction: '你在翻牌前做 3-bet，关煞位跟注，并在这个干燥翻牌过牌。', prompt: '哪种翻牌计划最能利用范围优势？',
      reasoning: '在这个干燥的 A 高牌面，做 3-bet 的一方拥有更多强 A、高对子与 A-K 组合。小额下注可以用较低风险高效利用范围优势。', takeaway: '干燥高张的 3-bet 底池翻牌上，范围优势通常支持频繁小注。',
    },
    'three-bet-pot-connected-check': {
      focus: '相连 3-bet 底池中的克制', opponentAction: '你在翻牌前做 3-bet，关煞位跟注，并在这个相连翻牌过牌。', prompt: '牌面互动应如何改变计划？',
      reasoning: '跟注者较窄的范围与这个低张相连牌面连接紧密。这手牌仍有未来胜率，但缺少支持自动大额持续下注的坚果优势。', takeaway: '翻牌前做过 3-bet，并不代表在相连牌面上仍然控制翻牌后范围。',
    },
    'caller-nut-advantage-restraint': {
      focus: '坚果优势下的尺寸', opponentAction: '你翻牌前开池，大盲跟注，并在这个低张相连翻牌过牌。', prompt: '跟注者的坚果优势应如何影响这手牌？',
      reasoning: '这手高对子仍可从对子与听牌取得价值，但大盲拥有更多牌面最强组合。受控半池下注既尊重坚果优势，也不会放弃价值。', takeaway: '跟注者的坚果优势应限制下注尺寸与频率，而不是消除所有价值下注。',
    },
    'multiway-range-discipline': {
      focus: '多人底池范围纪律', opponentAction: '你翻牌前加注，庄家位与大盲都跟注；两名对手在翻牌过牌。', prompt: '需要同时面对两个继续范围，会带来什么变化？',
      reasoning: '多人底池中，每名对手可以更有选择地继续，而整个对手群击中牌面的概率更高。高张有一定价值，但不足以支持自动施压。', takeaway: '多人底池要减少诈唬，因为一次下注需要同时面对多个继续范围。',
    },
    'equity-driven-turn-barrel': {
      focus: '依靠胜率的转牌连续下注', opponentAction: '大盲跟注你的翻牌下注，并在转牌过牌；你仍有强同花听牌。', prompt: '哪种转牌计划能同时保留两条获胜路径？',
      reasoning: '这手牌可以改善为强同花，也能让更好的未成牌或一对弃牌。两条路径共同支持受控的第二次下注。', takeaway: '当改善胜率与可信弃牌率重叠时，转牌半诈唬最有效。',
    },
    'turn-favors-caller-check': {
      focus: '转牌有利于跟注者', opponentAction: '大盲跟注你的翻牌下注，并在连接中间点数的转牌后过牌。', prompt: '范围变化应如何影响这手高对子？',
      reasoning: '这张转牌完成并强化了大盲翻牌跟注范围中的多种相连牌。这手牌仍有摊牌价值，但范围变化让控制底池成为最清晰基准。', takeaway: '当转牌完成跟注者的自然听牌与对子组合时，要重新建立范围比较。',
    },
    'brick-turn-value-barrel': {
      focus: '空白转牌价值连续下注', opponentAction: '大盲跟注你的翻牌下注，并在低张空白转牌再次过牌。', prompt: '哪种计划能继续从更弱对子与听牌取得价值？',
      reasoning: '空白转牌几乎没有改变结构，这手牌仍领先许多翻牌跟注。受控价值下注既能向听牌收费，也不会只留下最强手牌。', takeaway: '真正的空白转牌上，只要能说出多种会继续的更弱牌，就可持续价值下注。',
    },
    'no-equity-turn-give-up': {
      focus: '无胜率转牌放弃', opponentAction: '大盲跟注你的翻牌下注，并在强化相连跟注牌的转牌后过牌。', prompt: '这手牌是否仍有足够胜率与弃牌压力继续下注？',
      reasoning: '这手牌几乎没有实际改善机会，而且转牌强化了多种翻牌跟注牌。缺少实用阻挡牌与可信弃牌率时，第二次诈唬只会浪费筹码。', takeaway: '当转牌同时削弱改善机会和可信弃牌率时，应当放弃。',
    },
    'river-thin-value-target': {
      focus: '河牌薄价值', opponentAction: '大盲跟注适中翻牌与转牌下注，然后在空白河牌过牌。', prompt: '哪个尺寸能让更弱的一对继续跟注？',
      reasoning: '空白河牌上，这手牌仍领先多种自然的抓诈唬牌。小额价值下注瞄准这些更弱跟注牌，而不会只让范围顶端继续。', takeaway: '做薄价值下注时，要给更弱手牌合理的跟注成本。',
    },
    'river-polarized-value': {
      focus: '两极化河牌价值', opponentAction: '大盲跟注翻牌与转牌，并在河牌完成了翻牌时出现的同花听牌后过牌。', prompt: '如何从包含较低同花与抓诈唬牌的受限范围中取得价值？',
      reasoning: '这手牌处于河牌范围顶端，而过牌的对手较少拥有坚果牌。大型两极化下注既能取得价值，也为大型河牌诈唬提供价值端。', takeaway: '最舒适面对跟注的手牌，才适合使用最大的河牌尺寸。',
    },
    'river-showdown-check': {
      focus: '河牌摊牌价值过牌', opponentAction: '大盲跟注一次翻牌下注，双方转牌过牌；大盲在河牌再次过牌。', prompt: '是否有明确的更弱跟注目标？',
      reasoning: '这手牌能在摊牌获胜，但大型河牌下注没有稳定目标：更弱牌弃牌，更强对子继续。过牌能保留已有价值。', takeaway: '难以说出更弱跟注时，中等强度河牌应留在过牌范围。',
    },
    'river-blocker-bluff': {
      focus: '阻挡牌河牌诈唬', opponentAction: '大盲跟注翻牌，双方转牌过牌，并在第三张同花河牌到来时过牌。', prompt: '哪个诈唬尺寸最能利用坚果花色阻挡牌？',
      reasoning: '这手牌几乎没有摊牌价值，阻挡坚果同花，同时没有阻挡许多一对弃牌。因此它比随机未成牌更适合大型诈唬。', takeaway: '选择能阻挡跟注、又保留对手弃牌的河牌诈唬。',
    },
    'river-bad-bluff-candidate': {
      focus: '糟糕的河牌诈唬候选', opponentAction: '爱抓诈唬的对手跟注翻牌，双方转牌过牌，对手在完成同花的河牌过牌。', prompt: '未成听牌是否会自动变成诈唬？',
      reasoning: '听牌未成并不会自动成为好诈唬。对手跟注过多，而且这手牌缺乏阻挡最强河牌继续范围的实用牌。', takeaway: '未成听牌要有可信弃牌率和实用阻挡牌，才能成为河牌诈唬。',
    },
    'river-bluff-catch-call': {
      focus: '合理底池赔率下抓诈唬', opponentAction: '多个自然听牌未成后，大盲在 24 个大盲底池中领先下注 8 个大盲。', prompt: '如果这手牌约有 28% 获胜率，底池赔率支持什么行动？',
      reasoning: math ?? '跟注 8 个大盲争夺最终 40 个大盲底池，需要 20% 胜率。28% 的估计超过门槛，因此跟注是符合底池赔率的基准。', takeaway: '当足够多听牌未成时，小额河牌下注可以支持用抓诈唬牌跟注。',
    },
    'river-bluff-catch-fold': {
      focus: '面对超额下注弃掉抓诈唬牌', opponentAction: '价值偏重的大盲在 24 个大盲底池中超额下注 30 个大盲。', prompt: '如果这手牌只有约 20% 获胜率，新的跟注成本要求什么行动？',
      reasoning: math ?? '跟注 30 个大盲争夺最终 84 个大盲底池，需要约 36% 胜率。20% 的估计远低于门槛，因此应弃牌。', takeaway: '手牌不变时，下注尺寸仍能让跟注变成弃牌。',
    },
    'river-raise-discipline': {
      focus: '河牌加注纪律', opponentAction: '大盲在三张同花的河牌向 24 个大盲底池下注 8 个大盲；坚果同花仍然可能存在。', prompt: '如何继续，同时不赶走你能击败的诈唬？',
      reasoning: '这手牌强到足以继续，但加注缺少良好价值目标：更弱手牌通常弃牌，更强同花继续。跟注能保留诈唬并控制最终底池。', takeaway: '河牌加注前，先说出哪些更弱手牌真的会跟注。',
    },
    'river-thin-value': {
      focus: '薄价值尺寸', opponentAction: '大盲在河牌过牌，多种更弱一对仍可能跟一个适中下注。', prompt: '哪个尺寸最容易让更弱手牌留下？',
      reasoning: '小尺寸针对已识别的更弱一对。目标不是最大下注，而是更差牌仍愿意跟注的最大尺寸。', takeaway: '选择价值尺寸时，要想象哪些更弱手牌真的会付钱。',
    },
    'semi-bluff-size': {
      focus: '半诈唬尺寸', opponentAction: '大盲过牌；你有开放式顺子听牌，但摊牌价值很低。', prompt: '哪种打法能施压又不过度冒险？',
      reasoning: '中等下注可让更强的未成对高牌弃牌，被跟注时仍有八张改善牌。', takeaway: '半诈唬结合弃牌率和听牌胜率，不需要使用最大的尺寸。',
    },
    'turn-straight-price': {
      focus: '顺子听牌的底池赔率', opponentAction: '大盲在转牌圈小额下注；八张干净顺子补牌约有 17% 命中率。', prompt: '直接底池赔率支持跟注吗？',
      reasoning: math ?? '跟注所需胜率低于听牌的估算胜率，因此直接跟注有利可图。', takeaway: '即使只剩一张牌，小额下注仍可能给听牌提供有利的底池赔率。',
    },
    'overpriced-flush': {
      focus: '同花听牌的跟注成本过高', opponentAction: '大盲在转牌圈下注满池；你有九张同花补牌。', prompt: '这个跟注成本说明你应如何继续？',
      reasoning: math ?? '跟注所需胜率明显高于听牌命中率，因此看似强大的听牌仍应弃牌。', takeaway: '面对底池赔率不合适的大额下注，强听牌也可能应该弃牌。',
    },
    'tournament-deep-open': {
      focus: '深筹码开池尺寸', opponentAction: '前面的玩家都弃牌，轮到你；剩余玩家的筹码仍足以打多个翻牌后街。', prompt: '哪种率先入池计划能保留这手牌的价值？',
      reasoning: '这个筹码深度仍支持小额正常开池与灵活的翻牌后计划。直接全下会冒整个深筹码的风险，却不会带来足够额外弃牌或价值。', takeaway: '有效筹码仍有充足翻牌后空间时，不要使用短筹码行动。',
    },
    'tournament-medium-open': {
      focus: '中筹码灵活性', opponentAction: '前面的玩家都弃牌，两个盲注位都有足够筹码再全下。', prompt: '哪个尺寸能施压，同时不过度消耗筹码灵活性？',
      reasoning: '二十多个大盲且有位置时，可以使用小额开池。这个尺寸风险较低、保留较弱继续范围，也能诚实评估再全下。', takeaway: '中筹码应高效加注，并在开池前决定如何回应全下。',
    },
    'tournament-button-shove': {
      focus: '庄家位推弃压力', opponentAction: '前面的玩家都弃牌，只剩两个随机盲注范围。', prompt: '这手牌最清晰的短筹码基准是什么？',
      reasoning: '约十一个大盲且只剩盲注位时，这手牌兼具实用胜率与即时弃牌压力。直接全下避免投入大部分筹码后再弃牌。', takeaway: '在后位且筹码较短时，扎实的率先入池牌可以简化为直接全下。',
    },
    'tournament-early-shove-fold': {
      focus: '前位全下纪律', opponentAction: '你第一个行动，身后仍有五名尚未行动的玩家。', prompt: '短筹码会让这手牌自动全下吗？',
      reasoning: '短筹码紧迫感不会消除位置。身后五名玩家中任何一人都可能拿到强牌，而且这手牌被跟注时表现也较差，因此保留筹码优于勉强全下。', takeaway: '即使筹码较短，前位仍要保留弃牌范围。',
    },
    'tournament-value-reshove': {
      focus: '价值再全下', opponentAction: '宽范围庄家位开到 2.2 个大盲，小盲弃牌。', prompt: '哪种回应能最清晰地从这手牌取得价值？',
      reasoning: '这手牌对较宽的庄家位开池及其合理跟注范围都有强胜率。少于二十个大盲时，直接再全下可以避免尴尬的小额 3-bet，并争夺底池中的死钱。', takeaway: '较短筹码面对宽后位开池时，强牌可以为价值再全下。',
    },
    'tournament-reshove-discipline': {
      focus: '再全下范围纪律', opponentAction: '纪律严谨的枪口位玩家开到 2.5 个大盲，其余玩家都弃牌。', prompt: '紧的开池位置应如何影响这手牌？',
      reasoning: '同一筹码深度面对宽庄家位开池可以支持再全下，但面对紧的前位范围则不成立。这手牌被跟注时胜率不足，也得不到足够的即时弃牌率。', takeaway: '再全下取决于双方范围如何互动，不是看到短筹码后的条件反射。',
    },
    'tournament-call-short-shove': {
      focus: '跟注后位短筹码全下', opponentAction: '短筹码庄家位全下，小盲弃牌；你已投入大盲。', prompt: '面对宽后位全下，这手牌支持什么行动？',
      reasoning: '庄家位只面对两名对手且筹码很短，因此可以用较宽范围全下。这手牌对该范围保持强胜率，已投入的大盲也改善了底池赔率。', takeaway: '面对后位短筹码的宽全下范围，可以用对其完整范围仍有足够胜率的牌扩大跟注。',
    },
    'tournament-calloff-fold': {
      focus: '全下跟注纪律', opponentAction: '纪律严谨的枪口位玩家全下，其余所有玩家都弃牌。', prompt: '已投入的大盲会让这手牌成为盈利跟注吗？',
      reasoning: '全下来自最前位置，因此其范围应远强于庄家位全下范围。这手牌经常被压制，稍好的底池赔率无法弥补胜率差距。', takeaway: '跟注全下需要足够的直接胜率；已投入筹码不能证明对抗压制范围的跟注合理。',
    },
    'tournament-small-blind-shove': {
      focus: '小盲推弃压力', opponentAction: '庄家位弃牌，只剩一个随机大盲范围；若被跟注，翻牌后你先行动。', prompt: '哪种计划最清晰地利用这手牌和短有效筹码？',
      reasoning: '只剩一名对手且有效筹码少于十个大盲时，这手牌有足够胜率直接施压。全下可以避免低筹码且不利位置的翻牌后底池。', takeaway: '小盲率先入池可向单一范围施加更宽压力，但被跟注时仍需有实用胜率。',
    },
    'tournament-avoid-deep-shove': {
      focus: '保留翻牌后空间', opponentAction: '你开到 2.2 个大盲，大盲再加注到 7 个大盲；身后仍有超过二十五个大盲。', prompt: '哪种价值回应能让较弱手牌继续？',
      reasoning: '有效筹码尚未进入全下或弃牌区间。这手牌可以使用较小的价值 4-bet，让较弱但不错的牌继续，而不是立即迫使整个筹码入池。', takeaway: '有效筹码仍支持较小价值加注时，锦标赛筹码并不要求直接全下。',
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
    .replaceAll('Two covered blinds', '两个被覆盖的盲注位')
    .replaceAll('Two larger blinds', '两个较大筹码的盲注位')
    .replaceAll('Button and blinds behind', '庄家位和盲注位在身后')
    .replaceAll('Button and both blinds', '庄家位和两个盲注位')
    .replaceAll('Small blind and big blind', '小盲和大盲')
    .replaceAll('Three players behind', '身后三名玩家')
    .replaceAll('Two limpers and both blinds', '两名跛入者和两个盲注位')
    .replaceAll('Cutoff and button', '关煞位和庄家位')
    .replaceAll('two blinds behind', '身后有两个盲注位')
    .replaceAll('Five players behind', '身后五名玩家')
    .replaceAll('Middle position', '中间位置')
    .replaceAll('Under the gun', '枪口位')
    .replaceAll('Small blind', '小盲')
    .replaceAll('Big blind', '大盲')
    .replaceAll('Button', '庄家位')
    .replaceAll('Cutoff', '关煞位')
    .replaceAll('six players', '六人桌')
    .replaceAll('three players', '三人桌')
    .replaceAll('chip leader', '筹码领先者')
    .replaceAll('shortest stack', '最短筹码')
    .replaceAll('frequent caller', '频繁跟注者')
    .replaceAll('frequent folder', '频繁弃牌者')
    .replaceAll('frequent aggressor', '频繁进攻者')
    .replaceAll('patient', '耐心型')
    .replaceAll('strong range', '强范围');
}

/**
 * Per-language scenario localization. Only languages with a complete authored
 * scenario catalog appear here; other locales render the English source spot
 * unchanged rather than borrowing another language's copy.
 */
const scenarioLocalizations: Partial<Record<AppLanguage, (scenario: ScenarioSpot) => ScenarioSpot>> = {
  'zh-Hans': localizeScenarioContentSimplified,
  'zh-Hant': localizeScenarioContentTraditional,
};

export function localizeScenarioContent(scenario: ScenarioSpot, language: AppLanguage): ScenarioSpot {
  if (language === 'en') return scenario;
  const localize = scenarioLocalizations[language];
  // Locales without an authored scenario catalog (es-419, pt-BR during their
  // Phase 19 slices) stay on the English source; a release gate rejects any
  // catalogComplete locale that still resolves here.
  return localize ? localize(scenario) : scenario;
}

function localizeScenarioContentSimplified(scenario: ScenarioSpot): ScenarioSpot {
  const copy = scenarioCopy(scenario);
  return {
    ...scenario,
    ...copy,
    position: translatePosition(scenario.position),
    opponentPosition: translatePosition(scenario.opponentPosition),
    choices: scenario.choices.map((choice) => ({
      ...choice,
      label: translatedAction(choice.label),
      feedback: choiceFeedback(scenario, choice),
    })),
  };
}

function localizeScenarioContentTraditional(scenario: ScenarioSpot): ScenarioSpot {
  return JSON.parse(toTraditionalChinese(JSON.stringify(localizeScenarioContentSimplified(scenario)))) as ScenarioSpot;
}
