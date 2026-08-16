const onboardingStorageKey = 'rivermind.onboarding.v1';
const completedValue = 'complete';

interface OnboardingStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

function deviceStorage(): OnboardingStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function shouldShowOnboarding(storage: OnboardingStorage | null = deviceStorage()): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(onboardingStorageKey) !== completedValue;
  } catch {
    return true;
  }
}

export function completeOnboarding(storage: OnboardingStorage | null = deviceStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(onboardingStorageKey, completedValue);
  } catch {
    // Dismissing still works for this session when device storage is unavailable.
  }
}

export function resetOnboarding(storage: OnboardingStorage | null = deviceStorage()): void {
  try {
    storage?.removeItem(onboardingStorageKey);
  } catch {
    // The caller still reopens onboarding for the current app session.
  }
}

export const onboardingStorageContract = {
  key: onboardingStorageKey,
  completedValue,
} as const;
