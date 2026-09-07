import type { AppLanguage } from './core';
const en = {
  title: 'Notifications',
  description:
    'Choose the occasional messages you would like from RiverMind. You can turn them off here at any time.',
  cadence:
    'After a few days away, at most three messages in any seven days across all categories, around 6 pm in your local time. Reminders pause after two without a return.',
  tips: 'Poker tips',
  tipsDescription: 'Short, practical ideas to try in your next session.',
  quickPlay: 'Play reminders',
  quickPlayDescription: 'An occasional invitation to play a few hands.',
  releases: 'Release news',
  releasesDescription:
    'Announcements about new RiverMind versions and features.',
  consent:
    'By saving enabled categories, you agree to receive those reminders and announcements. We store your notification token, choices, app version, language, time zone, and last app activity to deliver them.',
  save: 'Save preferences',
  saving: 'Saving…',
  done: 'Done',
  saved: 'Preferences saved.',
  pending:
    'Saved on this device. Connect to the internet and try saving again to update delivery.',
  denied:
    'Notifications are blocked in your phone settings. Allow RiverMind notifications there to receive these messages.',
  unsupported:
    'Notifications need an installed RiverMind build on a supported device or simulator.',
  failure: 'Could not save preferences. Please try again.',
};
type Copy = Record<keyof typeof en, string>;
const zh: Copy = {
  title: '通知',
  description: '选择你希望偶尔收到的 RiverMind 消息。你可以随时在这里关闭。',
  cadence:
    '离开几天后，所有类别合计任意七天最多三条，通常在当地时间傍晚六点左右发送。两次提醒后仍未返回，提醒会暂停。',
  tips: '扑克小贴士',
  tipsDescription: '下次对局可以尝试的简短实用思路。',
  quickPlay: '对局提醒',
  quickPlayDescription: '偶尔邀请你来玩几手牌。',
  releases: '版本消息',
  releasesDescription: 'RiverMind 新版本与新功能的公告。',
  consent:
    '保存已开启的类别，即表示你同意接收对应的提醒与公告。我们会保存通知令牌、所选类别、应用版本、语言、时区及上次使用时间，以便发送这些消息。',
  save: '保存偏好',
  saving: '正在保存…',
  done: '完成',
  saved: '偏好已保存。',
  pending: '已保存在此设备。请联网后再次保存，以更新消息发送设置。',
  denied:
    '手机设置已阻止通知。如需接收这些消息，请在系统设置中允许 RiverMind 通知。',
  unsupported: '通知需要在受支持的设备或模拟器上安装 RiverMind 应用。',
  failure: '无法保存偏好，请重试。',
};
const hant: Copy = {
  title: '通知',
  description: '選擇你希望偶爾收到的 RiverMind 訊息。你可以隨時在這裡關閉。',
  cadence:
    '離開幾天後，所有類別合計任意七天最多三則，通常在當地時間傍晚六點左右發送。兩次提醒後仍未返回，提醒會暫停。',
  tips: '撲克小提示',
  tipsDescription: '下次對局可以嘗試的簡短實用思路。',
  quickPlay: '對局提醒',
  quickPlayDescription: '偶爾邀請你來玩幾手牌。',
  releases: '版本消息',
  releasesDescription: 'RiverMind 新版本與新功能的公告。',
  consent:
    '儲存已開啟的類別，即表示你同意接收對應的提醒與公告。我們會儲存通知權杖、所選類別、應用程式版本、語言、時區及上次使用時間，以便發送這些訊息。',
  save: '儲存偏好',
  saving: '正在儲存…',
  done: '完成',
  saved: '偏好已儲存。',
  pending: '已儲存在此裝置。請連線後再次儲存，以更新訊息發送設定。',
  denied:
    '手機設定已封鎖通知。如需接收這些訊息，請在系統設定中允許 RiverMind 通知。',
  unsupported: '通知需要在支援的裝置或模擬器上安裝 RiverMind 應用程式。',
  failure: '無法儲存偏好，請重試。',
};
const es: Copy = {
  title: 'Notificaciones',
  description: 'Elige los mensajes ocasionales que quieres recibir de RiverMind. Puedes desactivarlos aquí cuando quieras.',
  cadence: 'Tras unos días sin abrir la app, recibirás como máximo tres mensajes en cualquier período de siete días, entre todas las categorías, cerca de las 6 p. m. de tu hora local. Se pausan tras dos recordatorios si no vuelves.',
  tips: 'Consejos de póker',
  tipsDescription: 'Ideas breves y prácticas para probar en tu próxima sesión.',
  quickPlay: 'Recordatorios para jugar',
  quickPlayDescription: 'Una invitación ocasional para jugar unas manos.',
  releases: 'Actualizaciones',
  releasesDescription: 'Anuncios sobre nuevas versiones y funciones de RiverMind.',
  consent: 'Al guardar categorías activadas, aceptas recibir esos recordatorios y anuncios. Guardamos tu token de notificaciones, preferencias, versión de la app, idioma, zona horaria y última actividad en la app para enviarlos.',
  save: 'Guardar preferencias',
  saving: 'Guardando…',
  done: 'Listo',
  saved: 'Preferencias guardadas.',
  pending: 'Guardado en este dispositivo. Conéctate a internet y vuelve a guardar para actualizar el envío de mensajes.',
  denied: 'Las notificaciones están bloqueadas en los ajustes de tu teléfono. Permite las notificaciones de RiverMind allí para recibir estos mensajes.',
  unsupported: 'Las notificaciones requieren una versión de RiverMind instalada en un dispositivo o simulador compatible.',
  failure: 'No se pudieron guardar las preferencias. Inténtalo de nuevo.',
};
const pt: Copy = {
  title: 'Notificações',
  description: 'Escolha as mensagens ocasionais que deseja receber do RiverMind. Você pode desativá-las aqui a qualquer momento.',
  cadence: 'Após alguns dias sem abrir o app, você receberá no máximo três mensagens em qualquer período de sete dias, somando todas as categorias, por volta das 18h no seu horário local. Os lembretes pausam após dois envios sem você voltar.',
  tips: 'Dicas de pôquer',
  tipsDescription: 'Ideias curtas e práticas para testar na sua próxima sessão.',
  quickPlay: 'Lembretes para jogar',
  quickPlayDescription: 'Um convite ocasional para jogar algumas mãos.',
  releases: 'Atualizações',
  releasesDescription: 'Avisos sobre novas versões e recursos do RiverMind.',
  consent: 'Ao salvar categorias ativadas, você concorda em receber esses lembretes e avisos. Guardamos seu token de notificações, preferências, versão do app, idioma, fuso horário e última atividade no app para enviá-los.',
  save: 'Salvar preferências',
  saving: 'Salvando…',
  done: 'Concluído',
  saved: 'Preferências salvas.',
  pending: 'Salvo neste dispositivo. Conecte-se à internet e salve novamente para atualizar o envio de mensagens.',
  denied: 'As notificações estão bloqueadas nas configurações do celular. Permita as notificações do RiverMind por lá para receber estas mensagens.',
  unsupported: 'As notificações precisam de uma versão do RiverMind instalada em um dispositivo ou simulador compatível.',
  failure: 'Não foi possível salvar as preferências. Tente novamente.',
};
const ja: Copy = {
  title: '通知',
  description: 'RiverMindからときどき届くメッセージを選べます。いつでもここでオフにできます。',
  cadence: '数日間アプリを利用していない場合、お住まいの地域の午後6時ごろに、全カテゴリ合計で直近7日間に最大3件お送りします。2回通知してもアプリに戻らなければ、通知を一時停止します。',
  tips: 'ポーカーのヒント',
  tipsDescription: '次のセッションで試せる、短く実用的なヒントです。',
  quickPlay: 'プレイのリマインダー',
  quickPlayDescription: '何ハンドかプレイするお誘いを、ときどきお届けします。',
  releases: 'アップデート情報',
  releasesDescription: 'RiverMindの新しいバージョンや機能をお知らせします。',
  consent: 'カテゴリをオンにして保存すると、そのリマインダーやお知らせの受信に同意したことになります。配信のため、通知トークン、通知設定、アプリのバージョン、言語、タイムゾーン、アプリの最終利用日時を保存します。',
  save: '設定を保存',
  saving: '保存中…',
  done: '完了',
  saved: '設定を保存しました。',
  pending: 'この端末に保存しました。配信設定を更新するには、インターネットに接続してもう一度保存してください。',
  denied: '端末の設定で通知がブロックされています。メッセージを受け取るには、端末の設定でRiverMindの通知を許可してください。',
  unsupported: '通知を利用するには、対応する端末またはシミュレータにRiverMindをインストールする必要があります。',
  failure: '設定を保存できませんでした。もう一度お試しください。',
};
const copies: Record<AppLanguage, Copy> = {
  en,
  'zh-Hans': zh,
  'zh-Hant': hant,
  'es-419': es,
  'pt-BR': pt,
  ja,
};
export function notificationMessages(language: AppLanguage): Copy {
  return copies[language];
}
