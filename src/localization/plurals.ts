import type { MessageKey } from './messages';

/**
 * Count-aware message selection.
 *
 * Catalog templates carry the default (`other`) form; a plural entry adds the
 * forms a language needs on top. Selection is explicit and fixture-tested for
 * zero, one, two, and representative larger values — callers never encode
 * singular/plural grammar themselves.
 *
 * Rules (deliberately simple, documented per locale in the style guides):
 *   - count === 1        → `one` when present, else `other`;
 *   - count === 0        → `zero` when present, else `other`;
 *   - every other count  → `other`.
 *
 * Spanish and Portuguese follow CLDR: "one" applies to exactly 1, zero uses the
 * plural ("0 minutos"), so they provide no `zero` form. Chinese has no plural
 * distinction, but the graded-decision label rides a demonstrative that reads
 * best with an explicit one-form, so zh entries use identical `one`/`other`
 * word order rather than caller-side conditionals.
 */
export interface MessagePluralForms {
  /** Optional zero form. Omit when the language treats zero as `other`. */
  zero?: string;
  /** Exactly-one form when it differs from `other`. */
  one?: string;
  /** Default form for zero and every count >= 2. Matches the base catalog. */
  other: string;
}

export type MessagePluralCatalog = Partial<Record<MessageKey, MessagePluralForms>>;

/** English: singular/plural distinctions for count-bearing keys. */
export const englishPlurals: MessagePluralCatalog = {
  'common.bigBlinds': {
    one: '{{count}} big blind',
    other: '{{count}} big blinds',
  },
  'decision.handCount.ungradedSpot': {
    one: 'Not graded across 1 spot',
    other: 'Not graded across {{count}} spots',
  },
  'decision.handCount.closeSpot': {
    one: 'Close decision across 1 spot',
    other: 'Close decisions across {{count}} spots',
  },
  'decision.handCount.mistake': {
    one: 'Costly mistake across 1 decision',
    other: 'Costly mistakes across {{count}} decisions',
  },
  'decision.handCount.mixed': {
    one: 'Mixed with the baseline across 1 decision',
    other: 'Mixed with the baseline across {{count}} decisions',
  },
  'decision.handCount.match': {
    one: 'Strong baseline match across 1 decision',
    other: 'Strong baseline match across {{count}} decisions',
  },
  'learn.closingDecisions': {
    one: '1 decision reviewed',
    other: '{{count}} decisions reviewed',
  },
  'championship.bestRuns': {
    one: 'Best {{place}} · 1 run',
    other: 'Best {{place}} · {{count}} runs',
  },
  'opponentRead.eyebrow': {
    one: '1 hand · {{confidence}}',
    other: '{{count}} hands · {{confidence}}',
  },
  'setup.handCount': {
    one: '1 hand',
    other: '{{count}} hands',
  },
  'multiplayer.stats.rebuys': {
    one: '{{count}} rebuy',
    other: '{{count}} rebuys',
  },
  'multiway.coach.freeCheck': {
    one: 'You can check for free; 1 player can still act if you bet.',
    other: 'You can check for free; {{count}} players can still act if you bet.',
  },
  'multiplayer.moment.trayBudget': {
    one: '1 left this hand',
    other: '{{count}} left this hand',
  },
  'multiway.level': {
    one: 'Level {{level}} · 1 left · {{smallBlind}}/{{bigBlind}}',
    other: 'Level {{level}} · {{count}} left · {{smallBlind}}/{{bigBlind}}',
  },
  'multiway.dailyLevel': {
    one: '{{date}} · fixed {{difficulty}} AI · 1 left · {{smallBlind}}/{{bigBlind}}',
    other: '{{date}} · fixed {{difficulty}} AI · {{count}} left · {{smallBlind}}/{{bigBlind}}',
  },
  'coach.live.postflopFree': {
    one: "Estimated equity {{equity}}% against {{count}} live opponent. No call is required.",
    other: "Estimated equity {{equity}}% against {{count}} live opponents. No call is required.",
  },
  'coach.live.postflopPrice': {
    one: "Estimated equity {{equity}}% · required call equity {{required}}% · {{count}} live opponent.",
    other: "Estimated equity {{equity}}% · required call equity {{required}}% · {{count}} live opponents.",
  },
  'guided.card.checkpointDue': {
    one: "A progress checkpoint is ready after {{count}} learning activity.",
    other: "A progress checkpoint is ready after {{count}} learning activities.",
  },
  'guided.card.checkpointIn': {
    one: "Next progress check after {{count}} more activity.",
    other: "Next progress check after {{count}} more activities.",
  },
  'history.multiwayHand': {
    one: "Hand {{hand}} · {{count}} player",
    other: "Hand {{hand}} · {{count}} players",
  },
  'learn.afterLessons': {
    one: "After {{count}} lesson",
    other: "After {{count}} lessons",
  },
  'learn.closingStrengthSession': {
    one: "Strong {{concept}} play: {{count}} scored decision with no costly mistakes.",
    other: "Strong {{concept}} play: {{count}} scored decisions with no costly mistakes.",
  },
  'learn.daySessions': {
    one: "{{date}} · {{count}} learning session",
    other: "{{date}} · {{count}} learning sessions",
  },
  'learn.planReviewReason': {
    one: "{{count}} spaced decision is ready to revisit.",
    other: "{{count}} spaced decisions are ready to revisit.",
  },
  'learn.reviewDueCount': {
    one: "{{count}} due",
    other: "{{count}} due",
  },
  'learn.reviewReady': {
    one: "{{count}} decision ready · {{total}} still in your review queue",
    other: "{{count}} decisions ready · {{total}} still in your review queue",
  },
  'learn.reviewRecommendation': {
    one: "Review due · {{count}} decision",
    other: "Review due · {{count}} decisions",
  },
  'learn.reviewSpotsDue': {
    one: "{{count}} review spot due",
    other: "{{count}} review spots due",
  },
  'multiplayer.lobby.tableSummary': {
    one: "{{count}} seat · {{stack}} · {{hands}}",
    other: "{{count}} seats · {{stack}} · {{hands}}",
  },
  'multiplayer.option.hands': {
    one: "{{count}} hand",
    other: "{{count}} hands",
  },
  'multiplayer.session.reviewHandsCount': {
    one: "Review hands · {{count}} decision",
    other: "Review hands · {{count}} decisions",
  },
  'multiway.allFolded': {
    one: "The other player folded before the flop",
    other: "All {{count}} other players folded before the flop",
  },
  'multiway.hand.tournamentCompact': {
    one: "{{count}} player · Hand {{hand}}",
    other: "{{count}} players · Hand {{hand}}",
  },
  'multiway.outcome.allOpponentsFold': {
    one: "The opponent folds",
    other: "All {{count}} opponents fold",
  },
  'multiway.result.header': {
    one: "Hand {{hand}} · {{count}} player",
    other: "Hand {{hand}} · {{count}} players",
  },
  'opponentRead.learning.limitedDetail': {
    one: "Public actions from {{count}} hand are still a small sample, so adjustments remain very small.",
    other: "Public actions from {{count}} hands are still a small sample, so adjustments remain very small.",
  },
  'opponentTendencies.handsObserved': {
    one: "{{count}} hand observed",
    other: "{{count}} hands observed",
  },
  'roster.count': {
    one: "{{count}} player",
    other: "{{count}} players",
  },
  'scenario.effective': {
    one: "{{count}} big blind effective",
    other: "{{count}} big blinds effective",
  },
  'setup.footer': {
    one: "{{count}} player · {{stack}} chips · {{length}} · {{difficulty}} AI",
    other: "{{count}} players · {{stack}} chips · {{length}} · {{difficulty}} AI",
  },
  'setup.multiwayDescription': {
    one: "You face {{count}} distinct AI opponent on one private practice table.",
    other: "You face {{count}} distinct AI opponents on one private practice table.",
  },
  'setup.totalPlayersA11y': {
    one: "{{count}} total player",
    other: "{{count}} total players",
  },
  'stats.spots.hands': {
    one: "{{count}} hand seen",
    other: "{{count}} hands seen",
  },
  'table.review.factsSummary': {
    one: "{{hand}} · {{count}} decision",
    other: "{{hand}} · {{count}} decisions",
  },
  'trainer.correctCount': {
    one: "{{count}} correct",
    other: "{{count}} correct",
  },
};

/** Simplified Chinese: no plural inflection; explicit one-form for the graded-decision label. */
export const simplifiedChinesePlurals: MessagePluralCatalog = {
  'decision.handCount.ungradedSpot': {
    one: '这 1 个决策',
    other: '这 {{count}} 个决策',
  },
  'decision.handCount.closeSpot': {
    one: '这 1 个决策',
    other: '这 {{count}} 个决策',
  },
  'decision.handCount.mistake': {
    one: '这 1 个决策',
    other: '这 {{count}} 个决策',
  },
  'decision.handCount.mixed': {
    one: '这 1 个决策',
    other: '这 {{count}} 个决策',
  },
  'decision.handCount.match': {
    one: '这 1 个决策',
    other: '这 {{count}} 个决策',
  },
};

/** Traditional Chinese: mirrors the Simplified entries in Traditional script. */
export const traditionalChinesePlurals: MessagePluralCatalog = {
  'decision.handCount.ungradedSpot': {
    one: '這 1 個決策',
    other: '這 {{count}} 個決策',
  },
  'decision.handCount.closeSpot': {
    one: '這 1 個決策',
    other: '這 {{count}} 個決策',
  },
  'decision.handCount.mistake': {
    one: '這 1 個決策',
    other: '這 {{count}} 個決策',
  },
  'decision.handCount.mixed': {
    one: '這 1 個決策',
    other: '這 {{count}} 個決策',
  },
  'decision.handCount.match': {
    one: '這 1 個決策',
    other: '這 {{count}} 個決策',
  },
};

/**
 * Spanish (Latin America): "one" applies to exactly 1; zero uses the plural
 * ("0 decisiones"). Forms mirror the es-419 catalog templates (see the es-419
 * style guide §6: never "(s)"; "{{count}} ciega grande"/"ciegas grandes").
 */
export const spanishPlurals: MessagePluralCatalog = {
  'common.bigBlinds': {
    one: '{{count}} ciega grande',
    other: '{{count}} ciegas grandes',
  },
  'common.minutes': {
    one: '{{count}} minuto',
    other: '{{count}} minutos',
  },
  'common.players': {
    one: '{{count}} jugador',
    other: '{{count}} jugadores',
  },
  'decision.handCount.ungradedSpot': {
    one: 'Sin calificar en 1 situación',
    other: 'Sin calificar en {{count}} situaciones',
  },
  'decision.handCount.closeSpot': {
    one: 'Decisión cercana en 1 situación',
    other: 'Decisiones cercanas en {{count}} situaciones',
  },
  'decision.handCount.mistake': {
    one: 'Error costoso en 1 decisión',
    other: 'Errores costosos en {{count}} decisiones',
  },
  'decision.handCount.mixed': {
    one: 'Resultado mixto con la referencia en 1 decisión',
    other: 'Resultados mixtos con la referencia en {{count}} decisiones',
  },
  'decision.handCount.match': {
    one: 'Gran coincidencia con la referencia en 1 decisión',
    other: 'Gran coincidencia con la referencia en {{count}} decisiones',
  },
  'learn.closingDecisions': {
    one: '1 decisión revisada',
    other: '{{count}} decisiones revisadas',
  },
  'championship.bestRuns': {
    one: 'Mejor {{place}} · 1 partida',
    other: 'Mejor {{place}} · {{count}} partidas',
  },
  'opponentRead.eyebrow': {
    one: '1 mano · {{confidence}}',
    other: '{{count}} manos · {{confidence}}',
  },
  'setup.handCount': {
    one: 'Manos: 1',
    other: 'Manos: {{count}}',
  },
  'multiway.coach.freeCheck': {
    one: 'Puedes pasar gratis; si apuestas, todavía puede actuar 1 jugador.',
    other: 'Puedes pasar gratis; si apuestas, todavía pueden actuar {{count}} jugadores.',
  },
  'multiplayer.moment.trayBudget': {
    one: 'Queda 1 en esta mano',
    other: 'Quedan {{count}} en esta mano',
  },
  'multiway.level': {
    one: 'Nivel {{level}} · queda 1 · {{smallBlind}}/{{bigBlind}}',
    other: 'Nivel {{level}} · quedan {{count}} · {{smallBlind}}/{{bigBlind}}',
  },
  'multiway.dailyLevel': {
    one: '{{date}} · IA {{difficulty}} fija · queda 1 · {{smallBlind}}/{{bigBlind}}',
    other: '{{date}} · IA {{difficulty}} fija · quedan {{count}} · {{smallBlind}}/{{bigBlind}}',
  },
  'alert.savedTournamentTitle': {
    one: "Sit & Go de {{count}} jugador guardado",
    other: "Sit & Go de {{count}} jugadores guardado",
  },
  'championship.eventMeta': {
    one: "Mesa de {{count}} jugador",
    other: "Mesa de {{count}} jugadores",
  },
  'coach.live.postflopFree': {
    one: "Equidad estimada {{equity}}% contra {{count}} oponente en vivo. No hace falta igualar.",
    other: "Equidad estimada {{equity}}% contra {{count}} oponentes en vivo. No hace falta igualar.",
  },
  'coach.live.postflopPrice': {
    one: "Equidad estimada {{equity}}% · equidad necesaria para igualar {{required}}% · {{count}} oponente en vivo.",
    other: "Equidad estimada {{equity}}% · equidad necesaria para igualar {{required}}% · {{count}} oponentes en vivo.",
  },
  'guided.card.checkpointDue': {
    one: "Un punto de control de progreso estará listo después de {{count}} actividad de aprendizaje.",
    other: "Un punto de control de progreso estará listo después de {{count}} actividades de aprendizaje.",
  },
  'guided.card.checkpointIn': {
    one: "Próxima verificación de progreso después de {{count}} actividad más.",
    other: "Próxima verificación de progreso después de {{count}} actividades más.",
  },
  'history.multiwayHand': {
    one: "Mano {{hand}} · {{count}} jugador",
    other: "Mano {{hand}} · {{count}} jugadores",
  },
  'home.continueSitAndGo': {
    one: "Tu Sit & Go de {{count}} jugador, en la mano {{hand}}.",
    other: "Tu Sit & Go de {{count}} jugadores, en la mano {{hand}}.",
  },
  'learn.afterLessons': {
    one: "Después de {{count}} lección",
    other: "Después de {{count}} lecciones",
  },
  'learn.closingStrengthSession': {
    one: "Juego fuerte en {{concept}}: {{count}} decisión calificada sin errores costosos.",
    other: "Juego fuerte en {{concept}}: {{count}} decisiones calificadas sin errores costosos.",
  },
  'learn.currentStreakValue': {
    one: "Racha de aprendizaje de {{count}} día",
    other: "Racha de aprendizaje de {{count}} días",
  },
  'learn.daySessions': {
    one: "{{date}} · {{count}} sesión de aprendizaje",
    other: "{{date}} · {{count}} sesiones de aprendizaje",
  },
  'learn.planReviewReason': {
    one: "{{count}} decisión espaciada está lista para repasar.",
    other: "{{count}} decisiones espaciadas están listas para repasar.",
  },
  'learn.reviewDueCount': {
    one: "{{count}} pendiente",
    other: "{{count}} pendientes",
  },
  'learn.reviewReady': {
    one: "{{count}} decisión lista · {{total}} siguen en tu cola de revisión",
    other: "{{count}} decisiones listas · {{total}} siguen en tu cola de revisión",
  },
  'learn.reviewRecommendation': {
    one: "Revisión pendiente · {{count}} decisión",
    other: "Revisión pendiente · {{count}} decisiones",
  },
  'learn.reviewSpotsDue': {
    one: "{{count}} situación de revisión pendiente",
    other: "{{count}} situaciones de revisión pendientes",
  },
  'mission.summaryEyebrow': {
    one: "Misión de {{count}} mano completada",
    other: "Misión de {{count}} manos completada",
  },
  'multiplayer.lobby.tableSummary': {
    one: "{{count}} asiento · {{stack}} · {{hands}}",
    other: "{{count}} asientos · {{stack}} · {{hands}}",
  },
  'multiplayer.option.hands': {
    one: "{{count}} mano",
    other: "{{count}} manos",
  },
  'multiplayer.session.reviewHandsCount': {
    one: "Repasar manos · {{count}} decisión",
    other: "Repasar manos · {{count}} decisiones",
  },
  'multiway.allFolded': {
    one: "El otro jugador se retiró antes del flop",
    other: "Todos los otros {{count}} jugadores se retiraron antes del flop",
  },
  'multiway.coach.preflop': {
    one: "La referencia preflop usa tu posición {{position}}, una mesa de {{count}} jugador, la pila efectiva y todas las acciones públicas antes de ti.",
    other: "La referencia preflop usa tu posición {{position}}, una mesa de {{count}} jugadores, la pila efectiva y todas las acciones públicas antes de ti.",
  },
  'multiway.hand.practiceOpen': {
    one: "Práctica de {{count}} jugador · Mano {{hand}}",
    other: "Práctica de {{count}} jugadores · Mano {{hand}}",
  },
  'multiway.hand.practiceTarget': {
    one: "Práctica de {{count}} jugador · Mano {{hand}}/{{target}}",
    other: "Práctica de {{count}} jugadores · Mano {{hand}}/{{target}}",
  },
  'multiway.hand.tournamentCompact': {
    one: "{{count}} jugador · Mano {{hand}}",
    other: "{{count}} jugadores · Mano {{hand}}",
  },
  'multiway.outcome.allOpponentsFold': {
    one: "El rival se retira",
    other: "Todos los {{count}} rivales se retiran",
  },
  'multiway.result.header': {
    one: "Mano {{hand}} · {{count}} jugador",
    other: "Mano {{hand}} · {{count}} jugadores",
  },
  'opponentRead.learning.limitedDetail': {
    one: "Las acciones públicas de {{count}} mano todavía son una muestra pequeña, así que los ajustes permanecen muy leves.",
    other: "Las acciones públicas de {{count}} manos todavía son una muestra pequeña, así que los ajustes permanecen muy leves.",
  },
  'opponentTendencies.handsObserved': {
    one: "{{count}} mano observada",
    other: "{{count}} manos observadas",
  },
  'play.quickSeatA11y': {
    one: "Comenzar una partida rápida de {{count}} jugador",
    other: "Comenzar una partida rápida de {{count}} jugadores",
  },
  'replay.multiwayHeader': {
    one: "{{count}} jugador · Mano {{hand}}",
    other: "{{count}} jugadores · Mano {{hand}}",
  },
  'roster.count': {
    one: "{{count}} jugador",
    other: "{{count}} jugadores",
  },
  'scenario.effective': {
    one: "{{count}} ciega grande efectiva",
    other: "{{count}} ciegas grandes efectivas",
  },
  'setup.footer': {
    one: "{{count}} jugador · {{stack}} fichas · {{length}} · IA {{difficulty}}",
    other: "{{count}} jugadores · {{stack}} fichas · {{length}} · IA {{difficulty}}",
  },
  'setup.multiway': {
    one: "Mesa de IA de {{count}} jugador",
    other: "Mesa de IA de {{count}} jugadores",
  },
  'setup.multiwayDescription': {
    one: "Te enfrentas a {{count}} rival de IA distinto en una mesa privada de práctica.",
    other: "Te enfrentas a {{count}} rivales de IA distintos en una mesa privada de práctica.",
  },
  'setup.totalPlayersA11y': {
    one: "{{count}} jugador en total",
    other: "{{count}} jugadores en total",
  },
  'stats.spots.hands': {
    one: "{{count}} mano vista",
    other: "{{count}} manos vistas",
  },
  'table.review.factsSummary': {
    one: "{{hand}} · {{count}} decisión",
    other: "{{hand}} · {{count}} decisiones",
  },
  'table.sessionHands': {
    one: "Abrir la mano completada de esta sesión",
    other: "Abrir las {{count}} manos completadas de esta sesión",
  },
  'tournament.continueA11y': {
    one: "Sit & Go de {{count}} jugador. Continuar en la mano {{hand}}",
    other: "Sit & Go de {{count}} jugadores. Continuar en la mano {{hand}}",
  },
  'tournament.continueDifficultyA11y': {
    one: "Sit & Go de {{count}} jugador. Continuar la mano {{hand}} contra IA {{difficulty}}",
    other: "Sit & Go de {{count}} jugadores. Continuar la mano {{hand}} contra IA {{difficulty}}",
  },
  'tournament.startA11y': {
    one: "Sit & Go de {{count}} jugador. Comenzar un torneo nuevo",
    other: "Sit & Go de {{count}} jugadores. Comenzar un torneo nuevo",
  },
  'tournament.startDifficultyA11y': {
    one: "Sit & Go de {{count}} jugador. Comenzar un torneo nuevo contra IA {{difficulty}}",
    other: "Sit & Go de {{count}} jugadores. Comenzar un torneo nuevo contra IA {{difficulty}}",
  },
  'trainer.correctCount': {
    one: "{{count}} correcta",
    other: "{{count}} correctas",
  },
};

/**
 * Brazilian Portuguese: "one" applies to exactly 1; zero uses the plural
 * ("0 decisões"). The big-blind unit name stays "big blind(s)" per the pt-BR
 * style guide glossary decision.
 */
export const portuguesePlurals: MessagePluralCatalog = {
  'common.bigBlinds': {
    one: '{{count}} big blind',
    other: '{{count}} big blinds',
  },
  'common.minutes': {
    one: '{{count}} minuto',
    other: '{{count}} minutos',
  },
  'common.players': {
    one: '{{count}} jogador',
    other: '{{count}} jogadores',
  },
  'decision.handCount.ungradedSpot': {
    one: 'Sem avaliação em 1 situação',
    other: 'Sem avaliação em {{count}} situações',
  },
  'decision.handCount.closeSpot': {
    one: 'Decisão próxima em 1 situação',
    other: 'Decisões próximas em {{count}} situações',
  },
  'decision.handCount.mistake': {
    one: 'Erro caro em 1 decisão',
    other: 'Erros caros em {{count}} decisões',
  },
  'decision.handCount.mixed': {
    one: 'Resultado misto com a referência em 1 decisão',
    other: 'Resultados mistos com a referência em {{count}} decisões',
  },
  'decision.handCount.match': {
    one: 'Grande coincidência com a referência em 1 decisão',
    other: 'Grande coincidência com a referência em {{count}} decisões',
  },
  'learn.closingDecisions': {
    one: '1 decisão revisada',
    other: '{{count}} decisões revisadas',
  },
  'championship.bestRuns': {
    one: 'Melhor {{place}} · 1 partida',
    other: 'Melhor {{place}} · {{count}} partidas',
  },
  'opponentRead.eyebrow': {
    one: '1 mão · {{confidence}}',
    other: '{{count}} mãos · {{confidence}}',
  },
  'setup.handCount': {
    one: 'Mãos: 1',
    other: 'Mãos: {{count}}',
  },
  'multiway.coach.freeCheck': {
    one: 'Você pode passar de graça; se apostar, ainda pode agir 1 jogador.',
    other: 'Você pode passar de graça; se apostar, ainda podem agir {{count}} jogadores.',
  },
  'multiplayer.moment.trayBudget': {
    one: 'Resta 1 nesta mão',
    other: 'Restam {{count}} nesta mão',
  },
  'multiway.level': {
    one: 'Nível {{level}} · resta 1 · {{smallBlind}}/{{bigBlind}}',
    other: 'Nível {{level}} · restam {{count}} · {{smallBlind}}/{{bigBlind}}',
  },
  'multiway.dailyLevel': {
    one: '{{date}} · IA {{difficulty}} fixa · resta 1 · {{smallBlind}}/{{bigBlind}}',
    other: '{{date}} · IA {{difficulty}} fixa · restam {{count}} · {{smallBlind}}/{{bigBlind}}',
  },
  'alert.savedTournamentTitle': {
    one: "Sit & Go de {{count}} jogador salvo",
    other: "Sit & Go de {{count}} jogadores salvo",
  },
  'championship.eventMeta': {
    one: "Mesa de {{count}} jogador",
    other: "Mesa de {{count}} jogadores",
  },
  'coach.live.postflopFree': {
    one: "Equidade estimada {{equity}}% contra {{count}} oponente ao vivo. Não é necessário pagar.",
    other: "Equidade estimada {{equity}}% contra {{count}} oponentes ao vivo. Não é necessário pagar.",
  },
  'coach.live.postflopPrice': {
    one: "Equidade estimada {{equity}}% · equidade necessária para pagar {{required}}% · {{count}} oponente ao vivo.",
    other: "Equidade estimada {{equity}}% · equidade necessária para pagar {{required}}% · {{count}} oponentes ao vivo.",
  },
  'guided.card.checkpointDue': {
    one: "Um marco de progresso estará pronto após {{count}} atividade de aprendizado.",
    other: "Um marco de progresso estará pronto após {{count}} atividades de aprendizado.",
  },
  'guided.card.checkpointIn': {
    one: "Próxima verificación de progresso após mais {{count}} atividade.",
    other: "Próxima verificação de progresso após mais {{count}} atividades.",
  },
  'history.multiwayHand': {
    one: "Mão {{hand}} · {{count}} jogador",
    other: "Mão {{hand}} · {{count}} jogadores",
  },
  'home.continueSitAndGo': {
    one: "Seu Sit & Go de {{count}} jogador, na mão {{hand}}.",
    other: "Seu Sit & Go de {{count}} jogadores, na mão {{hand}}.",
  },
  'learn.afterLessons': {
    one: "Depois de {{count}} lição",
    other: "Depois de {{count}} lições",
  },
  'learn.closingStrengthSession': {
    one: "Jogo forte em {{concept}}: {{count}} decisão avaliada sem erros caros.",
    other: "Jogo forte em {{concept}}: {{count}} decisões avaliadas sem erros caros.",
  },
  'learn.currentStreakValue': {
    one: "Sequência de aprendizado de {{count}} dia",
    other: "Sequência de aprendizado de {{count}} dias",
  },
  'learn.daySessions': {
    one: "{{date}} · {{count}} sessão de aprendizado",
    other: "{{date}} · {{count}} sessões de aprendizado",
  },
  'learn.planReviewReason': {
    one: "{{count}} decisão espaçada está pronta para revisão.",
    other: "{{count}} decisões espaçadas estão prontas para revisão.",
  },
  'learn.reviewDueCount': {
    one: "{{count}} pendente",
    other: "{{count}} pendentes",
  },
  'learn.reviewReady': {
    one: "{{count}} decisão pronta · {{total}} ainda na sua fila de revisão",
    other: "{{count}} decisões prontas · {{total}} ainda na sua fila de revisão",
  },
  'learn.reviewRecommendation': {
    one: "Revisão pendente · {{count}} decisão",
    other: "Revisão pendente · {{count}} decisões",
  },
  'learn.reviewSpotsDue': {
    one: "{{count}} situação de revisão pendente",
    other: "{{count}} situações de revisão pendentes",
  },
  'mission.summaryEyebrow': {
    one: "Missão de {{count}} mão concluída",
    other: "Missão de {{count}} mãos concluída",
  },
  'multiplayer.lobby.tableSummary': {
    one: "{{count}} lugar · {{stack}} · {{hands}}",
    other: "{{count}} lugares · {{stack}} · {{hands}}",
  },
  'multiplayer.option.hands': {
    one: "{{count}} mão",
    other: "{{count}} mãos",
  },
  'multiplayer.session.reviewHandsCount': {
    one: "Revisar mãos · {{count}} decisão",
    other: "Revisar mãos · {{count}} decisões",
  },
  'multiway.allFolded': {
    one: "O outro jogador desistiu antes do flop",
    other: "Todos os outros {{count}} jogadores desistiram antes do flop",
  },
  'multiway.coach.preflop': {
    one: "A referência pré-flop usa sua posição {{position}}, uma mesa de {{count}} jogador, o stack efetivo e todas as ações públicas antes de você.",
    other: "A referência pré-flop usa sua posição {{position}}, uma mesa de {{count}} jogadores, o stack efetivo e todas as ações públicas antes de você.",
  },
  'multiway.hand.practiceOpen': {
    one: "Prática de {{count}} jogador · Mão {{hand}}",
    other: "Prática de {{count}} jogadores · Mão {{hand}}",
  },
  'multiway.hand.practiceTarget': {
    one: "Prática de {{count}} jogador · Mão {{hand}}/{{target}}",
    other: "Prática de {{count}} jogadores · Mão {{hand}}/{{target}}",
  },
  'multiway.hand.tournamentCompact': {
    one: "{{count}} jogador · Mão {{hand}}",
    other: "{{count}} jogadores · Mão {{hand}}",
  },
  'multiway.outcome.allOpponentsFold': {
    one: "O oponente desiste",
    other: "Todos os {{count}} oponentes desistem",
  },
  'multiway.result.header': {
    one: "Mão {{hand}} · {{count}} jogador",
    other: "Mão {{hand}} · {{count}} jogadores",
  },
  'opponentRead.learning.limitedDetail': {
    one: "As ações públicas de {{count}} mão ainda são uma amostra pequena, então os ajustes permanecem bem leves.",
    other: "As ações públicas de {{count}} mãos ainda são uma amostra pequena, então os ajustes permanecem bem leves.",
  },
  'opponentTendencies.handsObserved': {
    one: "{{count}} mão observada",
    other: "{{count}} mãos observadas",
  },
  'play.quickSeatA11y': {
    one: "Começar uma partida rápida de {{count}} jogador",
    other: "Começar uma partida rápida de {{count}} jogadores",
  },
  'replay.multiwayHeader': {
    one: "{{count}} jogador · Mão {{hand}}",
    other: "{{count}} jogadores · Mão {{hand}}",
  },
  'roster.count': {
    one: "{{count}} jogador",
    other: "{{count}} jogadores",
  },
  'scenario.effective': {
    one: "{{count}} big blind efetivo",
    other: "{{count}} big blinds efetivos",
  },
  'setup.footer': {
    one: "{{count}} jogador · {{stack}} fichas · {{length}} · IA {{difficulty}}",
    other: "{{count}} jogadores · {{stack}} fichas · {{length}} · IA {{difficulty}}",
  },
  'setup.multiway': {
    one: "Mesa de IA de {{count}} jogador",
    other: "Mesa de IA de {{count}} jogadores",
  },
  'setup.multiwayDescription': {
    one: "Você enfrenta {{count}} oponente de IA distinto em uma mesa privada de prática.",
    other: "Você enfrenta {{count}} oponentes de IA distintos em uma mesa privada de prática.",
  },
  'setup.totalPlayersA11y': {
    one: "{{count}} jogador no total",
    other: "{{count}} jogadores no total",
  },
  'stats.spots.hands': {
    one: "{{count}} mão vista",
    other: "{{count}} mãos vistas",
  },
  'table.review.factsSummary': {
    one: "{{hand}} · {{count}} decisão",
    other: "{{hand}} · {{count}} decisões",
  },
  'table.sessionHands': {
    one: "Abrir a mão concluída desta sessão",
    other: "Abrir as {{count}} mãos concluídas desta sessão",
  },
  'tournament.continueA11y': {
    one: "Sit & Go de {{count}} jogador. Continuar na mão {{hand}}",
    other: "Sit & Go de {{count}} jogadores. Continuar na mão {{hand}}",
  },
  'tournament.continueDifficultyA11y': {
    one: "Sit & Go de {{count}} jogador. Continuar a mão {{hand}} contra IA {{difficulty}}",
    other: "Sit & Go de {{count}} jogadores. Continuar a mão {{hand}} contra IA {{difficulty}}",
  },
  'tournament.startA11y': {
    one: "Sit & Go de {{count}} jogador. Começar um novo torneio",
    other: "Sit & Go de {{count}} jogadores. Começar um novo torneio",
  },
  'tournament.startDifficultyA11y': {
    one: "Sit & Go de {{count}} jogador. Começar um novo torneio contra IA {{difficulty}}",
    other: "Sit & Go de {{count}} jogadores. Começar um novo torneio contra IA {{difficulty}}",
  },
  'trainer.correctCount': {
    one: "{{count}} correta",
    other: "{{count}} corretas",
  },
};

/** Count-aware form selection. Exported for fixture tests. */
export function selectPluralForm(forms: MessagePluralForms, count: number): string {
  if (count === 1) return forms.one ?? forms.other;
  if (count === 0 && forms.zero !== undefined) return forms.zero;
  return forms.other;
}
