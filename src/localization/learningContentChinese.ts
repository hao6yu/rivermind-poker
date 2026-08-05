interface LessonSectionCopy {
  body: string;
  bullets?: string[];
  example?: { detail: string; title: string };
  heading: string;
  takeaway?: string;
}

interface TrainerQuestionCopy {
  choices: Record<string, { feedback: string; label: string }>;
  context: string;
  explanation: string;
  prompt: string;
}

interface CheatSheetGroupCopy {
  rows: Array<{ detail: string; label: string }>;
  title: string;
}

export interface LearningContentCatalog {
  cheatSheets: Record<string, { groups: CheatSheetGroupCopy[]; note?: string }>;
  lessons: Record<string, { sections: LessonSectionCopy[] }>;
  trainers: Record<string, { questions: Record<string, TrainerQuestionCopy> }>;
}

export const simplifiedLearningContent: LearningContentCatalog = {
  lessons: {
    'lesson-hand-rankings': {
      sections: [
        {
          heading: '只使用最好的五张牌',
          body: '德州扑克中你共有七张可用牌：两张底牌和五张公共牌。最终牌型始终是其中最强的五张组合，可以使用两张、一张或不使用底牌。',
          takeaway: '不能用第六张牌打破平局，只计算最好的五张牌。',
          example: {
            title: '示例 · 皇家同花顺',
            detail: 'A♠ K♠ 加上 Q♠ J♠ 10♠ 组成 A 高同花顺。成对的 2 不影响结果。',
          },
        },
        {
          heading: '从最稀有到最常见排列牌型',
          body: '同花顺、四条、葫芦、同花、顺子、三条、两对、一对，最后是高牌。',
          bullets: ['同花大于顺子。', '葫芦大于同花。', 'A 可在 A-K-Q-J-10 中作高牌，也可在 A-2-3-4-5 中作低牌，但不能首尾环绕。'],
        },
        {
          heading: '按顺序比较平局',
          body: '先比较构成牌型的部分，再从高到低比较剩余踢脚牌。如果双方使用的五张牌完全相同，则平分底池。',
          takeaway: '一对牌型先比对子，再依次比最高踢脚牌和其余两张踢脚牌。',
        },
      ],
    },
    'lesson-position-blinds': {
      sections: [
        {
          heading: '盲注推动行动',
          body: '小盲和大盲是发牌前必须投入的强制注。在单挑中，庄家按钮位投小盲，并在翻牌前先行动。',
          example: {
            title: '示例 · 按钮位手牌',
            detail: '单挑按钮位持 A♠ J♠ 时，你投小盲且翻牌前先行动，但之后每条街都最后行动。',
          },
        },
        {
          heading: '翻牌后行动顺序反转',
          body: '翻牌后大盲先行动，按钮位后行动。后行动很有价值，因为你可以先看到对手的选择。',
          takeaway: '位置就是信息。在按钮位通常可以比不利位置玩更多手牌。',
        },
        {
          heading: '按钮每手轮换',
          body: '单挑中庄家按钮每手交替，因此双方会轮流投入两种盲注，也轮流获得位置优势。',
        },
      ],
    },
    'lesson-actions-order': {
      sections: [
        {
          heading: '尚无人下注时',
          body: '你可以过牌，不增加筹码地传递行动；也可以下注设定价格。所有未弃牌玩家都匹配同一注额且无人需继续行动时，该轮结束。',
        },
        {
          heading: '面对下注时',
          body: '你可以弃牌、跟注至当前价格，或加注到更高总额。普通无限注加注至少要与上一次完整下注或加注的增量相同。',
          bullets: ['弃牌会放弃争夺底池。', '跟注会匹配当前价格。', '加注会提高对手继续的价格。'],
          example: {
            title: '示例 · 对子加听牌',
            detail: 'Q♥ J♥ 在 J♠ 8♥ 2♥ 上拥有顶对和同花听牌。面对下注时，要比较弃牌、跟注和合法加注，而不只看手中的牌。',
          },
        },
        {
          heading: '全下只是筹码上限，不是特殊牌型',
          body: '玩家可投入所有剩余筹码。短码全下可能小于一次完整加注，因而不一定重新开放加注权。RiverMind 会为你计算合法范围。',
          takeaway: '选择行动前，先确认跟注价格、底池大小以及之后还有谁要行动。',
        },
      ],
    },
    'lesson-starting-hands': {
      sections: [
        {
          heading: '先看牌面质量',
          body: '口袋对可组成强一对或隐蔽三条。高牌能组成踢脚更强的顶对。同花和连张增加做成同花或顺子的途径，但这些加成往往比新手想象得小。',
          example: {
            title: '示例 · 优质结构',
            detail: 'A♠ K♠ 同时拥有两张高牌、同花和顺子连接性，每项特性都增加翻牌后继续的方式。',
          },
        },
        {
          heading: '位置会改变入池门槛',
          body: '单挑按钮位在翻牌后最后行动，因此可以用更多手牌盈利入池。在大盲位你已投入筹码，但翻牌后要先行动。',
          takeaway: '同一手牌在按钮位可能值得加注，但在不利位置面对强压力时可能应该弃牌。',
        },
        {
          heading: '带着目的加注',
          body: '翻牌前加注可以直接赢得盲注、用强牌构建价值，并避免暴露你的确切强度。先把起手牌表当作学习基准，再根据对手行为调整。',
        },
      ],
    },
    'lesson-outs-equity-odds': {
      sections: [
        {
          heading: '计算干净补牌',
          body: '补牌是尚未露面、且很可能让你提升为胜牌的牌。如果某张牌也可能让对手组成更强牌型，就不要把它当成干净补牌。',
          example: {
            title: '示例 · 坚果同花听牌',
            detail: 'A♥ 5♥ 在 K♥ 8♣ 2♥ 上已看到四张红心，还有九张未见红心能组成 A 高同花。',
          },
        },
        {
          heading: '快速估算',
          body: '只剩一张牌时，干净补牌数大约乘 2。翻牌后还有两张牌时，大约乘 4。补牌较多时“乘 4 法则”误差会变大，应把它当作桌上心算，而不是精确计算器。',
          bullets: ['9 张同花补牌：下一张约 19%。', '9 张同花补牌：到河牌约 35%。', '8 张顺子补牌：下一张约 17%。'],
        },
        {
          heading: '将胜率与价格比较',
          body: '跟注所需胜率 = 跟注额 ÷ 跟注后最终底池。跟注 50，而跟注后底池变成 200，在不考虑未来行动前需要 25% 胜率。',
          takeaway: '当实际胜率高于回本比例，且有足够空间覆盖不确定性和未来决策时再跟注。',
        },
      ],
    },
    'lesson-value-bluffs': {
      sections: [
        {
          heading: '价值下注要让更差的牌跟注',
          body: '当足够多更弱手牌会跟注时，价值下注才成立。最好的尺寸不一定是最大的；要选择那些更弱手牌真正愿意继续的尺寸。',
          example: {
            title: '示例 · 价值候选牌',
            detail: 'A♠ Q♦ 在 Q♣ 7♥ 3♠ 上可被更弱的 Q、7、其他对子和部分听牌跟注。选尺寸前先说出这些手牌。',
          },
        },
        {
          heading: '诈唬要让更好的牌弃牌',
          body: '诈唬需要弃牌率。优先选择能阻挡强跟注、不阻挡弃牌且几乎没有摊牌价值的手牌。面对跟注过多的玩家要少诈唬。',
          example: {
            title: '示例 · 未成听牌',
            detail: 'Q♣ 5♣ 在 K♠ 9♣ 4♣ 2♦ 2♥ 上未成牌。仅仅未成牌还不够；只有足够多更好手牌会弃牌时，它才是诈唬。',
          },
        },
        {
          heading: '很多优秀的过牌既不是价值下注也不是诈唬',
          body: '过牌可以保护中等强度手牌、实现听牌胜率，或避免让所有更差的牌都弃掉。只有进攻的目的与范围和牌面相符时，进攻才有用。',
          takeaway: '下注前，先说出会跟注的更弱手牌，或会弃牌的更强手牌。',
        },
      ],
    },
  },
  trainers: {
    'trainer-percentages': {
      questions: {
        'nine-outs-next-card': {
          prompt: '翻牌圈你有 9 张干净补牌。转牌命中的概率大约是多少？',
          context: '使用快速的单张估算，或计算 9 ÷ 47。',
          choices: {
            a: { label: '9%', feedback: '这相当于把每张补牌当成约 1%。只剩一张牌时，补牌数大约乘 2。' },
            b: { label: '19%', feedback: '正确：9 ÷ 47 约为 19%，“乘 2 法则”可快速估成 18%。' },
            c: { label: '36%', feedback: '这是还有两张牌时到河牌的粗略概率，不是仅下一张。' },
          },
          explanation: '47 张未知牌中有 9 张补牌：9 ÷ 47 ≈ 19%。“乘 2 法则”可快速估成 18%。',
        },
        'nine-outs-two-cards': {
          prompt: '翻牌圈有 9 张干净补牌，到河牌时命中的概率大约是多少？',
          context: '假设你会看到剩余两张公共牌。',
          choices: {
            a: { label: '19%', feedback: '这大约是只在转牌命中的概率。' },
            b: { label: '27%', feedback: '有两次机会命中九张补牌，这个数字偏低。' },
            c: { label: '35%', feedback: '正确：两张牌的精确概率约为 35%，“乘 4 法则”估算为 36%。' },
          },
          explanation: '精确概率约为 35%。“乘 4 法则”得到 36%，足以用于快速决策。',
        },
        'half-pot-call': {
          prompt: '底池为 100，对手下注 50。跟注要达到多少胜率才能回本？',
          context: '你跟注 50 后，最终底池变成 200。',
          choices: {
            a: { label: '20%', feedback: '这低估了价格，因为你跟注的 50 也必须计入最终底池。' },
            b: { label: '25%', feedback: '正确：跟注 50 会形成 200 的最终底池，50 ÷ 200 = 25%。' },
            c: { label: '33%', feedback: '这是面对一倍底池下注的价格，不是半池下注。' },
          },
          explanation: '跟注额 ÷ 最终底池 = 50 ÷ 200 = 25%。',
        },
        'three-quarter-pot-call': {
          prompt: '底池为 120，对手下注 90。跟注需要多少胜率？',
          context: '跟注 90 后，最终底池为 300。',
          choices: {
            a: { label: '25%', feedback: '这是面对半池下注的常见价格；本题注额更大。' },
            b: { label: '30%', feedback: '正确：跟注后最终底池是 300，90 ÷ 300 = 30%。' },
            c: { label: '43%', feedback: '这是将注额与跟注前的底池比较，而不是你可赢得的最终底池。' },
          },
          explanation: '90 ÷ 300 = 30%。不要只除以跟注前的底池。',
        },
        'eight-outs-river': {
          prompt: '转牌圈你有 8 张干净补牌。河牌命中的概率大约是多少？',
          context: '只剩一张牌，共有 46 张未知牌。',
          choices: {
            a: { label: '9%', feedback: '这更接近只剩一张牌时 4 张补牌的概率。' },
            b: { label: '17%', feedback: '正确：8 ÷ 46 约为 17%，“乘 2 法则”可快速估成 16%。' },
            c: { label: '32%', feedback: '这大致用了“乘 4 法则”，但现在只剩一张河牌。' },
          },
          explanation: '8 ÷ 46 ≈ 17%。补牌数乘 2 可快速估成 16%。',
        },
      },
    },
    'quiz-core-decisions': {
      questions: {
        'button-ace-jack': {
          prompt: '单挑、100 个大盲深。你在按钮位持 A♠ J♦，翻牌前轮到你行动。',
          context: '选择一条实用的新手基准。',
          choices: {
            a: { label: '弃牌', feedback: 'A-J 面对一个随机大盲范围强得多，不能弃牌。' },
            b: { label: '只跟注', feedback: '某些高级策略会混合跛入，但只跟注会放弃一次清晰简单的价值加注。' },
            c: { label: '加注', feedback: '正确：为价值加注，并保留翻牌后的位置优势。' },
          },
          explanation: 'A-J 明显领先随机大盲手牌。加注能构建价值并利用位置优势。强策略可混合部分跛入，但弃牌过紧。',
        },
        'river-bluff-catcher': {
          prompt: '河牌圈底池为 80，对手下注 80。你的抓诈牌约有 25% 概率获胜。',
          context: '跟注后不再有未来行动。',
          choices: {
            a: { label: '弃牌', feedback: '正确：25% 的获胜估计低于 33% 回本价格。' },
            b: { label: '跟注', feedback: '当给定胜率低于所需胜率时，跟注长期亏损。' },
            c: { label: '加注', feedback: '诈唬加注需要强有力的弃牌证据，价格本身并不提供这种证据。' },
          },
          explanation: '面对一倍底池下注，所需胜率是 80 ÷ 240 = 33%。诚实的 25% 估计低于回本点，因此应弃牌。',
        },
        'thin-river-value': {
          prompt: '对手在河牌过牌。你有顶对强踢脚，且多个更弱对子会跟注。',
          context: '对手范围中剩余的未成听牌很少。',
          choices: {
            a: { label: '自动过牌', feedback: '过牌很安全，但当多个更弱对子会跟注时，它会错失价值。' },
            b: { label: '小尺寸价值下注', feedback: '正确：选择能让已识别的更弱一对继续的尺寸。' },
            c: { label: '全下', feedback: '过大注额很可能让你希望跟注的更差手牌弃掉。' },
          },
          explanation: '较小的价值下注瞄准你已识别的更弱一对。过牌可以在部分情况混合，但自动放弃清晰的更差跟注会损失价值。',
        },
        'poor-bluff-candidate': {
          prompt: '你的低同花听牌在河牌未成。对手爱跟注，而你的牌没有阻挡强一对跟注。',
          context: '你几乎没有摊牌价值，但也缺乏对手会弃牌的证据。',
          choices: {
            a: { label: '过牌', feedback: '正确：对手跟注过多且你的阻挡牌很差时，应放弃诈唬。' },
            b: { label: '因为未成听牌而下注', feedback: '听牌未成不会自动变成诈唬；先找出足够多会弃牌的更好手牌。' },
            c: { label: '总是超额下注', feedback: '投入更多筹码无法修复过低的弃牌率和差阻挡效果。' },
          },
          explanation: '未成听牌不会自动成为诈唬。面对跟注过多的范围，又没有有用阻挡牌时，弃牌率太低。把诈唬留给更好的候选牌。',
        },
      },
    },
  },
  cheatSheets: {
    'sheet-hand-rankings': {
      groups: [
        {
          title: '从强到弱',
          rows: [
            { label: '同花顺', detail: '五张同一花色的连续牌' },
            { label: '四条', detail: '四张点数相同的牌' },
            { label: '葫芦', detail: '三条加一对' },
            { label: '同花', detail: '五张同一花色但不连续的牌' },
            { label: '顺子', detail: '五张花色不同的连续点数牌' },
            { label: '三条', detail: '三张点数相同的牌' },
            { label: '两对', detail: '两组不同点数的对子' },
            { label: '一对', detail: '两张点数相同的牌' },
            { label: '高牌', detail: '没有组成以上任何牌型' },
          ],
        },
        {
          title: '平局比较',
          rows: [
            { label: '相同牌型', detail: '先比较组成牌型的部分，再比较踢脚牌' },
            { label: '公共牌作最终牌型', detail: '双方使用同样的五张牌时平分底池' },
          ],
        },
      ],
      note: '这些比例是所有随机七张德州扑克牌最终牌型的近似分布，并非特定起手牌组成该牌型或赢下底池的概率。',
    },
    'sheet-position': {
      groups: [
        {
          title: '翻牌前',
          rows: [
            { label: '按钮位／小盲', detail: '投入小盲并先行动' },
            { label: '大盲', detail: '投入大盲并后行动' },
          ],
        },
        {
          title: '翻牌后',
          rows: [
            { label: '大盲', detail: '在翻牌、转牌和河牌圈先行动' },
            { label: '按钮位', detail: '后行动并拥有信息优势' },
          ],
        },
      ],
    },
    'sheet-percentages': {
      groups: [
        {
          title: '干净补牌',
          rows: [
            { label: '4 张补牌', detail: '下一张约 9% · 到河牌约 17%' },
            { label: '8 张补牌', detail: '下一张约 17% · 到河牌约 32%' },
            { label: '9 张补牌', detail: '下一张约 19% · 到河牌约 35%' },
            { label: '15 张补牌', detail: '下一张约 32% · 到河牌约 54%' },
          ],
        },
        {
          title: '面对下注',
          rows: [
            { label: '半池', detail: '跟注需要 25% 胜率' },
            { label: '三分之二池', detail: '跟注需要约 29% 胜率' },
            { label: '四分之三池', detail: '跟注需要 30% 胜率' },
            { label: '满池', detail: '跟注需要 33% 胜率' },
          ],
        },
      ],
      note: '这些估算假设补牌干净且之后没有更多下注。若某张补牌也可能让对手组成更强牌型，应降低补牌数。',
    },
    'sheet-preflop': {
      groups: [
        {
          title: '如何阅读范围表',
          rows: [
            { label: '口袋对子', detail: '从 AA 到 22 的对角线' },
            { label: '同花牌', detail: '对角线上方；两张牌花色相同' },
            { label: '不同花牌', detail: '对角线下方；两张牌花色不同' },
          ],
        },
        {
          title: '行动前的调整',
          rows: [
            { label: '位置越早，范围越紧', detail: '你身后有更多玩家可能拿到强牌。' },
            { label: '大盲防守更宽', detail: '你已经投入 1 个大盲，面对较小加注时价格更好。' },
            { label: '深筹码有利于同花连张', detail: '翻牌后可赢取更多筹码时，连张同花牌价值更高。' },
          ],
        },
      ],
      note: '这是可解释的新手基准，不是求解器范围表。对手倾向和加注尺寸仍然很重要。',
    },
  },
};

const simplifiedTraditionalPairs = '与與两兩个個为為么麼习習争爭于於亏虧仅僅从從价價优優会會传傳倾傾关關决決况況净淨几幾则則别別动動势勢单單压壓双雙发發变變后後吗嗎听聽响響围圍图圖坚堅处處复復够夠夺奪学學实實宽寬对對将將带帶干乾并並庄莊应應开開弃棄张張强強当當径徑总總愿願扑撲扩擴护護拥擁择擇挡擋损損换換据據摊攤数數无無时時显顯机機权權条條来來构構枪槍标標样樣槛檻没沒满滿点點爱愛环環现現盖蓋着著码碼确確离離种種稳穩筹籌简簡紧緊红紅约約级級纪紀线線组組终終经經结結绕繞给給绝絕继繼续續胜勝脚腳芦蘆范範获獲虑慮补補见見计計认認让讓设設证證识識诈詐诚誠该該误誤说說读讀谁誰调調质質费費赔賠赢贏转轉轮輪较較达達过過还還这這进進连連适適选選递遞释釋针針钮鈕钱錢错錯长長门門间間阅閱际際险險随隨隐隱难難顶頂项項顺順须須领領题題额額风風';

export function toTraditionalChinese(value: string): string {
  const characters = Array.from(simplifiedTraditionalPairs);
  const map = new Map<string, string>();
  for (let index = 0; index < characters.length; index += 2) {
    map.set(characters[index]!, characters[index + 1]!);
  }
  return Array.from(value).map((character) => map.get(character) ?? character).join('')
    .replaceAll('概率', '機率')
    .replaceAll('信息', '資訊');
}

function traditionalizeCatalog(catalog: LearningContentCatalog): LearningContentCatalog {
  return JSON.parse(toTraditionalChinese(JSON.stringify(catalog))) as LearningContentCatalog;
}

export const traditionalLearningContent = traditionalizeCatalog(simplifiedLearningContent);
