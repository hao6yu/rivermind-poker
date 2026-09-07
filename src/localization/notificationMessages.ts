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
export function notificationMessages(language: AppLanguage): Copy {
  return language === 'zh-Hans' ? zh : language === 'zh-Hant' ? hant : en;
}
