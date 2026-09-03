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
  // DRAFT: awaiting qualified native es-419 poker-language review
  // (docs/LOCALIZATION_ES_419_STYLE_GUIDE.md).
  'es-419': {
    eyebrow: 'IA DE TERCEROS',
    title: '¿Permitir Supabase y OpenAI?',
    introduction: 'Para generar una explicación con IA, RiverMind envía esta mano ya completada a OpenAI a través de Supabase. No se envía ninguna solicitud al coach de IA hasta que elijas Permitir.',
    sentHeading: 'Esta solicitud envía',
    sentItems: [
      'Tus dos cartas de mano, las cartas comunitarias repartidas y la fase de la mano.',
      'El historial público de acciones, incluidas tus decisiones y los montos apostados.',
      'La ciega grande; el bote, la apuesta actual, el costo de igualar, las pilas de ambos jugadores y las apuestas de cada fase; las acciones legales; los montos mínimo, máximo y sugerido para subir; y el idioma de tu app.',
      'Datos verificados por el motor de poker: tu mano hecha, la textura del tablero, tus proyectos y outs, las categorías posibles de las manos de los oponentes (no sus cartas), las probabilidades del bote, la equidad requerida, la pila efectiva, la relación pila-bote (SPR), la legalidad de las acciones y los límites del análisis.',
    ],
    providers: 'Supabase usa tu ID de cuenta anónima para la autenticación y la asignación diaria, y registra de forma agregada el resultado de las solicitudes, la latencia y los detalles de errores. Una revisión de IA exitosa se guarda con tu historial de manos. OpenAI recibe un identificador de seguridad con hash unidireccional derivado de ese ID, no el ID de la cuenta.',
    notSent: 'RiverMind no envía tu apodo, el código de sala, las cartas sin repartir ni las cartas ocultas de los oponentes. RiverMind establece store: false en la solicitud a OpenAI.',
    localReview: 'Si eliges No permitir o cancelas, la revisión determinista que ya aparece en esta pantalla sigue disponible.',
    cancel: 'Cancelar',
    decline: 'No permitir',
    allow: 'Permitir y pedir IA',
  },
  // DRAFT: awaiting qualified native pt-BR poker-language review
  // (docs/LOCALIZATION_PT_BR_STYLE_GUIDE.md).
  'pt-BR': {
    eyebrow: 'IA DE TERCEIROS',
    title: 'Permitir Supabase e OpenAI?',
    introduction: 'Para gerar uma explicação com IA, o RiverMind envia esta mão já concluída ao OpenAI pelo Supabase. Nenhuma solicitação ao coach de IA é enviada até você escolher Permitir.',
    sentHeading: 'Esta solicitação envia',
    sentItems: [
      'Suas duas cartas de mão, as cartas comunitárias distribuídas e a etapa da mão.',
      'O histórico público de ações, incluindo suas decisões e os valores apostados.',
      'O big blind; o pote, a aposta atual, o custo para pagar, os stacks dos dois jogadores e as apostas de cada etapa; as ações legais; os valores mínimo, máximo e sugerido de aumento; e o idioma do seu app.',
      'Fatos verificados pelo motor de pôquer: sua mão formada, a textura do board, seus draws e outs, as categorias possíveis das mãos dos oponentes (não as cartas), as odds do pote, a equidade necessária, o stack efetivo, a relação stack-pote (SPR), a legalidade das ações e os limites da análise.',
    ],
    providers: 'O Supabase usa seu ID de conta anônima para autenticação e para a concessão diária, e registra de forma agregada o resultado das solicitações, a latência e os detalhes de erros. Uma revisão de IA bem-sucedida é salva com seu histórico de mãos. O OpenAI recebe um identificador de segurança com hash unidirecional derivado desse ID, não o ID da conta.',
    notSent: 'O RiverMind não envia seu apelido, o código da sala, as cartas não distribuídas nem as cartas ocultas dos oponentes. O RiverMind define store: false na solicitação ao OpenAI.',
    localReview: 'Se você escolher Não permitir ou cancelar, a análise determinística já exibida nesta tela continua disponível.',
    cancel: 'Cancelar',
    decline: 'Não permitir',
    allow: 'Permitir e pedir IA',
  },
};

export function aiCoachConsentCopy(language: AppLanguage): AiCoachConsentCopy {
  return copy[language];
}
