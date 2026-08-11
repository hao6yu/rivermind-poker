export interface Phase7ScenarioCopy {
  focus: string;
  opponentAction: string;
  prompt: string;
  reasoning: string;
  takeaway: string;
}

export const phase7ScenarioChineseCopy: Record<string, Phase7ScenarioCopy> = {
  'bubble-medium-stack-calloff': {
    focus: '被覆盖筹码的跟注纪律',
    opponentAction: '前两名晋级。42 个大盲领先者从按钮位全下；你排名第二，仍有一个 6 个大盲短筹码。',
    prompt: '泡沫期风险应如何改变这个边缘跟注？',
    reasoning: '领先者覆盖你，而最短筹码即将承受盲注压力。这手牌对全下范围没有足够明显的优势，不值得为边缘筹码收益冒出局风险。',
    takeaway: '场上仍有明显更短筹码时，被覆盖的中筹码应收紧接近的全下跟注。',
  },
  'bubble-leader-pressure': {
    focus: '筹码领先者施压',
    opponentAction: '前两名晋级。你覆盖两个 14 个大盲的盲注位，行动弃到按钮位的你。',
    prompt: '哪种率先入池计划能利用生存压力，又不冒上全部领先筹码？',
    reasoning: '两个盲注位继续就会面对淘汰，因此可以高效开池。优势支持更频繁的小额施压，而不是冒险全下。',
    takeaway: '领先者应把覆盖优势转化为频繁的小额压力，而非鲁莽打光。',
  },
  'bubble-short-stack-action': {
    focus: '最短筹码主动出击',
    opponentAction: '前两名晋级。你是最短筹码，行动弃到按钮位；两个盲注位都能淘汰你。',
    prompt: '泡沫期恐惧应阻止这个率先入池机会吗？',
    reasoning: '最短筹码需要保护的生存价值较少，也不能依赖别人先出局。这手牌足以立即利用后位弃牌率。',
    takeaway: '泡沫期可收紧跟注，但不应消除优质短筹码率先全下。',
  },
  'bubble-premium-call': {
    focus: '压力下的顶级强牌',
    opponentAction: '前两名晋级。领先者从小盲全下，场上仍有一个 7 个大盲短筹码。',
    prompt: '风险溢价会让这手顶级强牌变成弃牌吗？',
    reasoning: '风险溢价真实存在，但不是无限大。这手牌对可宽范围施压的小盲全下仍有决定性胜率优势。',
    takeaway: '用 ICM 调整范围边界，不要弃掉远高于新门槛的强牌。',
  },
  'bubble-covering-call': {
    focus: '覆盖筹码的跟注',
    opponentAction: '前两名晋级。最短筹码从按钮位全下，小盲弃牌；即使输掉，你仍是领先筹码。',
    prompt: '覆盖对手应如何影响这手牌？',
    reasoning: '最短筹码可宽范围全下，也无法淘汰你。这手牌有足够直接胜率，而你的生存代价低于被覆盖的中筹码。',
    takeaway: '覆盖关系可支持更宽跟注，但手牌仍需领先足够多的全下范围。',
  },
  'bubble-ladder-discipline': {
    focus: '晋级压力下的纪律',
    opponentAction: '前两名晋级。4 个大盲按钮位弃牌，45 个大盲领先者在大盲等待。',
    prompt: '持边缘牌时最清晰的基准是什么？',
    reasoning: '这手牌接近普通开池边界，但当前筹码结构增加了明显生存成本。领先者覆盖你，而 4 个大盲玩家很快可能被迫全下。',
    takeaway: '泡沫期收紧时，要明确指出更短筹码与覆盖你的筹码。',
  },
  'read-small-sample': {
    focus: '小样本克制',
    opponentAction: '对手过牌。仅观察两手：一次跟注河牌下注，一次弃牌。',
    prompt: '这么小的样本应产生极端针对性调整吗？',
    reasoning: '样本结果相反，也没有重复的相似决策。应保留正常的范围与下注目的基准，而不是凭空制造阅读。',
    takeaway: '两手牌只是线索，不足以支持大型针对性调整。',
  },
  'read-sticky-thin-value': {
    focus: '面对跟注者的薄价值',
    opponentAction: '观察 16 手后，这位对手在八次相似小中尺寸河牌下注中跟注六次，现在对你过牌。',
    prompt: '哪种调整能从较弱范围取得价值，又不会只面对更强手牌？',
    reasoning: '样本已稳定且与河牌跟注直接相关。你能指出多个更弱目标，因此适度薄价值下注是有依据的调整。',
    takeaway: '面对重复跟注者，先扩大薄价值，再考虑极端尺寸。',
  },
  'read-sticky-bluff-restraint': {
    focus: '面对跟注者减少诈唬',
    opponentAction: '观察 18 手后，这位对手在九次相似河牌决策中只弃牌两次，现在过牌。',
    prompt: '这手牌是否有足够弃牌证据进行诈唬？',
    reasoning: '没有摊牌价值并不会自动创造诈唬。相关样本与差阻挡牌都表明弃牌率不足。',
    takeaway: '未成听牌只有在更好手牌会真实弃牌时才成为诈唬。',
  },
  'read-frequent-folder-pressure': {
    focus: '证据支持的压力',
    opponentAction: '观察 14 手后，这位对手在七个相似单加注底池中弃牌五次；跟注翻牌后在空白转牌过牌。',
    prompt: '哪种适度调整能同时利用听牌胜率与观察到的弃牌？',
    reasoning: '这手牌被跟注后可以改善，而且对手在同类底池反复弃牌。受控连续下注只调整频率，不会把阅读夸大成极端超额下注。',
    takeaway: '可靠弃牌证据可支持带胜率或实用阻挡牌的精选压力。',
  },
  'read-patient-raise': {
    focus: '尊重罕见进攻',
    opponentAction: '观察 17 手且仅一次加注后，对手在几乎没有自然未成听牌的河牌对你的下注过牌全下加注。',
    prompt: '稳定的罕见进攻阅读应如何影响这手强牌？',
    reasoning: '绝对牌力虽然强，但相关证据来自大型河牌加注：对手长期被动，牌路也缺乏可信诈唬。适度针对性调整是有纪律地弃牌。',
    takeaway: '面对已建立的耐心倾向，缺少诈唬的罕见大型进攻应得到更多尊重。',
  },
  'read-pressure-bluff-catch': {
    focus: '防守宽进攻范围',
    opponentAction: '观察 20 手后，按钮位在十三次翻牌后机会中下注或加注十次。多个听牌未成，对手在 40 个大盲底池下注 14。',
    prompt: '价格与宽进攻证据是否支持抓诈？',
    reasoning: '跟注 14 后最终底池为 68，需要约 21% 胜率。相关进攻样本和未成听牌支持跟注，但不支持把抓诈牌转成加注。',
    takeaway: '只有样本、牌路、阻挡牌和价格同向时才扩大抓诈范围。',
  },
  'math-implied-set-call': {
    focus: '隐含赔率目标',
    opponentAction: '强前位范围开到 3 个大盲，盲注位被动，身后仍有超过 60 个大盲。',
    prompt: '现实未来价值能支持小对子跟注吗？',
    reasoning: '翻成三条的直接概率低于当前价格，但深筹码、有位置且强高对子范围可能支付未来价值，使额外收益目标合理。',
    takeaway: '隐含赔率需要现实未来支付、足够后手筹码，并考虑身后玩家。',
  },
  'math-implied-short-fold': {
    focus: '隐含赔率上限',
    opponentAction: '强前位范围开到 3 个大盲；跟注后只剩约 12 个大盲。',
    prompt: '短有效筹码能提供足够未来价值吗？',
    reasoning: '小对子很少翻成三条，而有效筹码无法支付补足差距所需的额外价值。短筹码会限制隐含赔率。',
    takeaway: '未来价值不能超过有效筹码；筹码变短时，隐含赔率迅速消失。',
  },
  'math-reverse-flush': {
    focus: '反向隐含赔率',
    opponentAction: '紧的前位范围在两同花翻牌向 16 个大盲底池下注 8；范围中仍可能有更高同花牌。',
    prompt: '九张表面同花补牌都应被视为干净补牌吗？',
    reasoning: '直接价格为 25%，但低同花听牌面对包含更高同花牌的紧范围并没有九张干净胜牌，未来行动也会放大损失。',
    takeaway: '计算干净获胜补牌，而不是所有能组成某种牌型的牌。',
  },
  'math-half-pot-bluff': {
    focus: '半池诈唬门槛',
    opponentAction: '对手向受限一对范围过牌。你估计至少 40% 的范围会面对 10 个大盲下注弃牌。',
    prompt: '诈唬回本数学支持什么行动？',
    reasoning: '冒险 10 争夺 20，需要约 33% 弃牌率。给定的 40% 估计超过门槛，而且这手牌几乎没有摊牌价值。',
    takeaway: '所需弃牌率等于风险除以风险加可赢底池。',
  },
  'math-pot-bluff-fold': {
    focus: '满池诈唬门槛',
    opponentAction: '对手过牌。满池下注冒险 20 个大盲，但范围证据只支持约 35% 的更好手牌弃牌。',
    prompt: '满池诈唬是否盈利？',
    reasoning: '满池纯诈唬必须成功 20 ÷（20 + 20），即 50%。35% 的估计明显不足，而且这手牌被跟注后没有干净胜率弥补差距。',
    takeaway: '更大诈唬需要更多弃牌；额外风险不会自动创造弃牌。',
  },
  'math-semibluff-equity': {
    focus: '半诈唬胜率缓冲',
    opponentAction: '对手用包含一对的范围过牌。14 个大盲下注能获得部分弃牌，被跟注后听牌仍有干净河牌胜率。',
    prompt: '哪条路线能同时利用两种获胜方式？',
    reasoning: '与纯诈唬不同，这手牌被跟注后并非总输。干净听牌胜率降低了即时弃牌需求，适中尺寸也能向领先的一对施压。',
    takeaway: '只有被跟注后的胜率干净且可实现，半诈唬才需要少于纯诈唬的弃牌。',
  },
};
