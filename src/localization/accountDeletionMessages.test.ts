import { describe, expect, it } from 'vitest';

import {
  accountDeletionEnglishMessages,
  accountDeletionMessage,
  accountDeletionPortugueseMessages,
  accountDeletionSimplifiedMessages,
  accountDeletionSpanishMessages,
  accountDeletionTraditionalMessages,
} from './accountDeletionMessages';

describe('account deletion localization', () => {
  it('keeps exact key parity in all five release languages', () => {
    const keys = Object.keys(accountDeletionEnglishMessages).sort();
    expect(Object.keys(accountDeletionSimplifiedMessages).sort()).toEqual(keys);
    expect(Object.keys(accountDeletionTraditionalMessages).sort()).toEqual(keys);
    expect(Object.keys(accountDeletionSpanishMessages).sort()).toEqual(keys);
    expect(Object.keys(accountDeletionPortugueseMessages).sort()).toEqual(keys);
  });

  it('uses explicit, irreversible account wording in the Phase 19 locales', () => {
    expect(accountDeletionMessage('es-419', 'settings.deleteAccountMessage')).toContain('cuenta de invitado');
    expect(accountDeletionMessage('es-419', 'settings.deleteAccountMessage')).toContain('no se puede deshacer');
    expect(accountDeletionMessage('es-419', 'settings.deleteAccountMessage')).toContain('todos los participantes');
    expect(accountDeletionMessage('pt-BR', 'settings.deleteAccountMessage')).toContain('conta de convidado');
    expect(accountDeletionMessage('pt-BR', 'settings.deleteAccountMessage')).toContain('não pode ser desfeita');
    expect(accountDeletionMessage('pt-BR', 'settings.deleteAccountMessage')).toContain('todos os participantes');
  });

  it('uses explicit, irreversible account wording rather than history-only wording', () => {
    expect(accountDeletionMessage('en', 'settings.deleteAccountMessage')).toContain('guest account');
    expect(accountDeletionMessage('en', 'settings.deleteAccountMessage')).toContain('cannot be undone');
    expect(accountDeletionMessage('zh-Hans', 'settings.deleteAccountMessage')).toContain('账户');
    expect(accountDeletionMessage('zh-Hans', 'settings.deleteAccountMessage')).toContain('无法撤销');
    expect(accountDeletionMessage('zh-Hant', 'settings.deleteAccountMessage')).toContain('帳號');
    expect(accountDeletionMessage('zh-Hant', 'settings.deleteAccountMessage')).toContain('無法復原');
  });

  it('warns that shared active private tables close for every participant', () => {
    expect(accountDeletionMessage('en', 'settings.deleteAccountMessage')).toContain('close for everyone');
    expect(accountDeletionMessage('en', 'settings.deleteAccountMessage')).toContain('every participant’s saved history');
    expect(accountDeletionMessage('zh-Hans', 'settings.deleteAccountMessage')).toContain('所有玩家关闭');
    expect(accountDeletionMessage('zh-Hans', 'settings.deleteAccountMessage')).toContain('所有玩家的记录中删除');
    expect(accountDeletionMessage('zh-Hant', 'settings.deleteAccountMessage')).toContain('所有玩家關閉');
    expect(accountDeletionMessage('zh-Hant', 'settings.deleteAccountMessage')).toContain('所有玩家的記錄中刪除');
  });
});
