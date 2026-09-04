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

// DRAFT: awaiting qualified native es-419 poker-language review
// (docs/LOCALIZATION_ES_419_STYLE_GUIDE.md).
export const accountDeletionSpanishMessages: Record<
  keyof typeof accountDeletionEnglishMessages,
  string
> = {
  'settings.deleteAccount': 'Eliminar cuenta y datos',
  'settings.deleteAccountDescription': 'Elimina de forma permanente tu cuenta de invitado y todos los datos guardados.',
  'settings.deleteAccountTitle': '¿Eliminar tu cuenta?',
  'settings.deleteAccountMessage': 'Esto elimina de forma permanente tu cuenta de invitado y todos los datos de RiverMind, incluidas las partidas guardadas, el progreso de aprendizaje y los comentarios. Las manos de las mesas privadas a las que te uniste se eliminarán del historial guardado de todos los participantes, y cualquier mesa activa se cerrará para todos. Esta acción no se puede deshacer.',
  'settings.deleteAccountConfirm': 'Eliminar cuenta',
  'settings.deleteAccountDeleting': 'Eliminando cuenta…',
  'settings.deleteAccountFailedTitle': 'No se pudo eliminar la cuenta',
  'settings.deleteAccountFailedMessage': 'Verifica tu conexión e inténtalo de nuevo. Tus datos no se han eliminado.',
};

// DRAFT: awaiting qualified native pt-BR poker-language review
// (docs/LOCALIZATION_PT_BR_STYLE_GUIDE.md).
export const accountDeletionPortugueseMessages: Record<
  keyof typeof accountDeletionEnglishMessages,
  string
> = {
  'settings.deleteAccount': 'Excluir conta e dados',
  'settings.deleteAccountDescription': 'Exclui permanentemente sua conta de convidado e todos os dados salvos.',
  'settings.deleteAccountTitle': 'Excluir sua conta?',
  'settings.deleteAccountMessage': 'Isso exclui permanentemente sua conta de convidado e todos os dados do RiverMind, incluindo partidas salvas, progresso de aprendizado e feedback. As mãos das mesas privadas em que você entrou serão removidas do histórico salvo de todos os participantes, e qualquer mesa ativa será encerrada para todos. Esta ação não pode ser desfeita.',
  'settings.deleteAccountConfirm': 'Excluir conta',
  'settings.deleteAccountDeleting': 'Excluindo conta…',
  'settings.deleteAccountFailedTitle': 'Não foi possível excluir a conta',
  'settings.deleteAccountFailedMessage': 'Verifique sua conexão e tente novamente. Seus dados não foram excluídos.',
};

// DRAFT: awaiting qualified native ja poker-language review
// (docs/LOCALIZATION_JA_STYLE_GUIDE.md §13). Critical copy — complete
// sentences, nothing truncated; the destructive-action warning must stay
// explicit (元に戻せません).
export const accountDeletionJapaneseMessages: Record<
  keyof typeof accountDeletionEnglishMessages,
  string
> = {
  'settings.deleteAccount': 'アカウントとデータを削除',
  'settings.deleteAccountDescription': 'ゲストアカウントと保存されたすべてのデータを完全に削除します。',
  'settings.deleteAccountTitle': 'アカウントを削除しますか？',
  'settings.deleteAccountMessage': 'この操作により、ゲストアカウントとRiverMindのすべてのデータ（保存されたゲーム、学習進捗、フィードバックを含む）が完全に削除されます。参加したプライベートテーブルのハンドは全参加者の保存履歴から削除され、進行中のテーブルは全員に対してクローズされます。この操作は元に戻せません。',
  'settings.deleteAccountConfirm': 'アカウントを削除',
  'settings.deleteAccountDeleting': 'アカウントを削除中…',
  'settings.deleteAccountFailedTitle': 'アカウントを削除できませんでした',
  'settings.deleteAccountFailedMessage': 'ネットワーク接続を確認して、もう一度お試しください。データはまだ削除されていません。',
};

const accountDeletionCatalogs: Record<
  AppLanguage,
  Record<AccountDeletionMessageKey, string>
> = {
  en: accountDeletionEnglishMessages,
  'zh-Hans': accountDeletionSimplifiedMessages,
  'zh-Hant': accountDeletionTraditionalMessages,
  'es-419': accountDeletionSpanishMessages,
  'pt-BR': accountDeletionPortugueseMessages,
  ja: accountDeletionJapaneseMessages,
};

export function accountDeletionMessage(
  language: AppLanguage,
  key: AccountDeletionMessageKey,
): string {
  return accountDeletionCatalogs[language][key];
}
