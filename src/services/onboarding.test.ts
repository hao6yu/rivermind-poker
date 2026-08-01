import { describe, expect, it } from 'vitest';

import {
  completeOnboarding,
  onboardingStorageContract,
  shouldShowOnboarding,
} from './onboarding';

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(onboardingStorageContract.key, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('first-run onboarding state', () => {
  it('shows onboarding until the current version is completed', () => {
    expect(shouldShowOnboarding(memoryStorage())).toBe(true);
    expect(shouldShowOnboarding(memoryStorage('older-version'))).toBe(true);
  });

  it('stays dismissed after completion', () => {
    const storage = memoryStorage();
    completeOnboarding(storage);
    expect(shouldShowOnboarding(storage)).toBe(false);
  });

  it('fails open when storage cannot be read', () => {
    expect(shouldShowOnboarding({
      getItem: () => { throw new Error('unavailable'); },
      setItem: () => undefined,
    })).toBe(true);
  });
});
