import type { AppLanguage } from './core';

export interface AiCoachConsentCopy {
  eyebrow: string;
  title: string;
  introduction: string;
  sentHeading: string;
  sentItems: readonly string[];
  providers: string;
  notSent: string;
  localReview: string;
  cancel: string;
  decline: string;
  allow: string;
}

const copy: Record<AppLanguage, AiCoachConsentCopy> = {
  en: {
    eyebrow: 'THIRD-PARTY AI',
    title: 'Allow Supabase and OpenAI?',
    introduction: 'To generate an AI explanation, RiverMind sends this completed hand through Supabase to OpenAI. No AI-coach request is sent until you choose Allow.',
    sentHeading: 'This request sends',
    sentItems: [
      'Your two hole cards, dealt community cards, and hand street.',
      'The public action history, including your decisions and bet sizes.',
      'The big blind; pot, current-bet, call-cost, both players’ stack and street-bet values; legal actions; minimum, maximum, and suggested raise amounts; and your app language.',
      'Poker-engine facts: your made hand, board texture, draws and outs, possible opponent hand categories (not cards), pot odds, required equity, effective stack, stack-to-pot ratio (SPR), action legality, and analysis limits.',
    ],
    providers: 'Supabase uses your anonymous account ID for authentication and the daily allowance, and records aggregate request outcome, latency, and error details. A successful AI review is saved with your hand history. OpenAI receives a one-way hashed safety identifier derived from that ID, not the account ID itself.',
    notSent: 'RiverMind does not send your nickname, room code, undealt cards, or opponents’ hidden cards. RiverMind sets store: false on the OpenAI request.',
    localReview: 'If you decline or cancel, the deterministic review already on this screen stays available.',
    cancel: 'Cancel',
    decline: 'Don’t allow',
    allow: 'Allow & ask AI',
  },
  'zh-Hans': {
    eyebrow: '第三方 AI',
    title: '允许 Supabase 和 OpenAI？',
    introduction: '为了生成 AI 讲解，RiverMind 会通过 Supabase 将这手已结束的牌局发送给 OpenAI。只有你选择“允许”后，才会发送 AI 教练请求。',
    sentHeading: '这次请求会发送',
    sentItems: [
      '你的两张底牌、已发出的公共牌和牌局阶段。',
      '公开行动记录，包括你的决策和下注金额。',
      '大盲注、底池、当前下注额、跟注成本、双方的筹码量与各轮下注额、可选行动、最小/最大/建议加注额，以及应用语言。',
      '扑克引擎核验的事实：你的成牌、牌面结构、听牌与补牌、对手可能的牌型类别（不是底牌）、底池赔率、所需胜率、有效筹码、筹码底池比（SPR）、行动是否合法及分析限制。',
    ],
    providers: 'Supabase 会使用你的匿名账户 ID 进行身份验证和每日额度管理，并记录汇总后的请求结果、延迟和错误信息。成功生成的 AI 复盘会随手牌记录保存。OpenAI 只会收到由该 ID 生成的单向哈希安全标识，不会收到该账户 ID 本身。',
    notSent: 'RiverMind 不会发送你的昵称、房间码、未发出的牌或对手隐藏的底牌。RiverMind 会在 OpenAI 请求中设置 store: false。',
    localReview: '如果你选择不允许或取消，此页面上的确定性本地复盘仍可继续使用。',
    cancel: '取消',
    decline: '不允许',
    allow: '允许并请求 AI 讲解',
  },
  'zh-Hant': {
    eyebrow: '第三方 AI',
    title: '允許 Supabase 和 OpenAI？',
    introduction: '為了產生 AI 解讀，RiverMind 會透過 Supabase 將這手已結束的牌局傳送給 OpenAI。只有在你選擇「允許」後，才會傳送 AI 教練請求。',
    sentHeading: '這次請求會傳送',
    sentItems: [
      '你的兩張底牌、已發出的公開牌和牌局階段。',
      '公開行動紀錄，包括你的決策和下注金額。',
      '大盲注、底池、目前下注額、跟注成本、雙方的籌碼量與各輪下注額、可選行動、最小/最大/建議加注額，以及 App 語言。',
      '撲克引擎核驗的事實：你的成牌、牌面結構、聽牌與補牌、對手可能的牌型類別（不是底牌）、底池賠率、所需勝率、有效籌碼、籌碼底池比（SPR）、行動是否合法及分析限制。',
    ],
    providers: 'Supabase 會使用你的匿名帳號 ID 進行身分驗證和每日額度管理，並記錄彙總後的請求結果、延遲和錯誤資訊。成功產生的 AI 牌局回顧會隨手牌記錄儲存。OpenAI 只會收到由該 ID 產生的單向雜湊安全識別碼，不會收到該帳號 ID 本身。',
    notSent: 'RiverMind 不會傳送你的暱稱、房間代碼、未發出的牌或對手隱藏的底牌。RiverMind 會在 OpenAI 請求中設定 store: false。',
    localReview: '如果你選擇不允許或取消，此頁面上的確定性本機牌局回顧仍可繼續使用。',
    cancel: '取消',
    decline: '不允許',
    allow: '允許並請 AI 解讀',
  },
};

export function aiCoachConsentCopy(language: AppLanguage): AiCoachConsentCopy {
  return copy[language];
}
