import { describe, expect, it } from 'vitest';
import { completeOnboarding, onboardingStorageContract } from './onboarding';
import { acknowledgeReleaseNotice, clearReleaseNotice, RELEASE_NOTICE_ID, RELEASE_NOTICE_STORAGE_KEY, releaseNoticeIsPending } from './releaseNotice';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe('release notice receipts', () => {
  it('distinguishes an existing installation from first-run onboarding', () => {
    const storage = memoryStorage();
    expect(releaseNoticeIsPending(storage)).toBe(false);
    completeOnboarding(storage);
    expect(releaseNoticeIsPending(storage)).toBe(true);
    // Merely reading/rendering eligibility never acknowledges the notice.
    expect(storage.getItem(RELEASE_NOTICE_STORAGE_KEY)).toBeNull();
  });

  it('keeps a fresh installation quiet on later launches after onboarding', () => {
    const storage = memoryStorage();
    completeOnboarding(storage);
    acknowledgeReleaseNotice(storage);
    expect(releaseNoticeIsPending(storage)).toBe(false);
  });

  it('uses a stable release receipt, with no progress or onboarding mutations', () => {
    const storage = memoryStorage();
    completeOnboarding(storage);
    storage.setItem('rivermind.championship.tour-1.2.progress.v2', 'new tour');
    storage.setItem('rivermind.tutorial.v1', 'completed');
    const before = [...storage.values];
    acknowledgeReleaseNotice(storage);
    acknowledgeReleaseNotice(storage);
    expect(storage.getItem(RELEASE_NOTICE_STORAGE_KEY)).toBe(RELEASE_NOTICE_ID);
    expect(releaseNoticeIsPending(storage)).toBe(false);
    clearReleaseNotice(storage);
    expect([...storage.values]).toEqual(before);
    expect(storage.getItem(onboardingStorageContract.key)).toBe(onboardingStorageContract.completedValue);
    expect(releaseNoticeIsPending(storage)).toBe(true);
  });

  it.each(['1.1', 'malformed'])('offers the release when its receipt is %s', (receipt) => {
    const storage = memoryStorage();
    completeOnboarding(storage);
    storage.setItem(RELEASE_NOTICE_STORAGE_KEY, receipt);
    expect(releaseNoticeIsPending(storage)).toBe(true);
  });

  it('does not block the app when storage is unavailable', () => {
    const storage = {
      getItem: () => { throw new Error('unavailable'); },
      setItem: () => { throw new Error('unavailable'); },
      removeItem: () => { throw new Error('unavailable'); },
    };
    expect(releaseNoticeIsPending(storage)).toBe(false);
    expect(releaseNoticeIsPending(null)).toBe(false);
    expect(() => acknowledgeReleaseNotice(storage)).not.toThrow();
    expect(() => clearReleaseNotice(storage)).not.toThrow();
  });
});
