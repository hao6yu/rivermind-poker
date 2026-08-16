import { describe, expect, it } from 'vitest';

import {
  accountDeletionEnglishMessages,
  accountDeletionMessage,
  accountDeletionSimplifiedMessages,
  accountDeletionTraditionalMessages,
} from './accountDeletionMessages';

describe('account deletion localization', () => {
  it('keeps exact key parity in all three release languages', () => {
    const keys = Object.keys(accountDeletionEnglishMessages).sort();
    expect(Object.keys(accountDeletionSimplifiedMessages).sort()).toEqual(keys);
    expect(Object.keys(accountDeletionTraditionalMessages).sort()).toEqual(keys);
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
