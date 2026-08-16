import type { AppLanguage } from './core';

export const accountDeletionEnglishMessages = {
  'settings.deleteAccount': 'Delete account and data',
  'settings.deleteAccountDescription': 'Permanently remove your guest account and all saved data.',
  'settings.deleteAccountTitle': 'Delete your account?',
  'settings.deleteAccountMessage': 'This permanently deletes your guest account and all RiverMind data, including saved games, learning progress, and feedback. Private-table hands from tables you joined will be removed from every participant’s saved history, and any active table will close for everyone. This cannot be undone.',
  'settings.deleteAccountConfirm': 'Delete account',
  'settings.deleteAccountDeleting': 'Deleting account…',
  'settings.deleteAccountFailedTitle': 'Could not delete account',
  'settings.deleteAccountFailedMessage': 'Check your connection and try again. Your data has not been deleted.',
} as const;

export const accountDeletionSimplifiedMessages: Record<
  keyof typeof accountDeletionEnglishMessages,
  string
> = {
  'settings.deleteAccount': '删除账户和数据',
  'settings.deleteAccountDescription': '永久删除访客账户及所有已保存数据。',
  'settings.deleteAccountTitle': '删除账户？',
  'settings.deleteAccountMessage': '这将永久删除你的访客账户及所有 RiverMind 数据，包括牌局、学习进度和反馈。你参加过的私桌牌局会从所有玩家的记录中删除，进行中的私桌也会对所有玩家关闭。此操作无法撤销。',
  'settings.deleteAccountConfirm': '删除账户',
  'settings.deleteAccountDeleting': '正在删除账户…',
  'settings.deleteAccountFailedTitle': '无法删除账户',
  'settings.deleteAccountFailedMessage': '请检查网络连接后重试。你的数据尚未删除。',
};

export const accountDeletionTraditionalMessages: Record<
  keyof typeof accountDeletionEnglishMessages,
  string
> = {
  'settings.deleteAccount': '刪除帳號與資料',
  'settings.deleteAccountDescription': '永久刪除訪客帳號及所有已儲存資料。',
  'settings.deleteAccountTitle': '刪除帳號？',
  'settings.deleteAccountMessage': '這會永久刪除你的訪客帳號及所有 RiverMind 資料，包括牌局、學習進度與意見回饋。你參加過的私人牌桌牌局會從所有玩家的記錄中刪除，仍在進行的牌桌也會對所有玩家關閉。此操作無法復原。',
  'settings.deleteAccountConfirm': '刪除帳號',
  'settings.deleteAccountDeleting': '正在刪除帳號…',
  'settings.deleteAccountFailedTitle': '無法刪除帳號',
  'settings.deleteAccountFailedMessage': '請檢查網路連線後再試一次。你的資料尚未刪除。',
};

export type AccountDeletionMessageKey = keyof typeof accountDeletionEnglishMessages;

const accountDeletionCatalogs: Record<
  AppLanguage,
  Record<AccountDeletionMessageKey, string>
> = {
  en: accountDeletionEnglishMessages,
  'zh-Hans': accountDeletionSimplifiedMessages,
  'zh-Hant': accountDeletionTraditionalMessages,
};

export function accountDeletionMessage(
  language: AppLanguage,
  key: AccountDeletionMessageKey,
): string {
  return accountDeletionCatalogs[language][key];
}
