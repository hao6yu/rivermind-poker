import { shouldShowOnboarding, type OnboardingStorage } from './onboarding';

// Editorial release ID, deliberately independent of build numbers and patches.
// Changing this receipt must never run a progress migration.
export const RELEASE_NOTICE_ID = '1.2';
export const RELEASE_NOTICE_STORAGE_KEY = 'rivermind.releaseNotice.v1';

function deviceStorage(): OnboardingStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function acknowledgeReleaseNotice(storage: OnboardingStorage | null = deviceStorage()): void {
  try {
    storage?.setItem(RELEASE_NOTICE_STORAGE_KEY, RELEASE_NOTICE_ID);
  } catch {
    // In-memory dismissal still works; a later launch may retry the notice.
  }
}

/** Fresh installs get onboarding, returning installations get release notes. */
export function releaseNoticeIsPending(storage: OnboardingStorage | null = deviceStorage()): boolean {
  if (!storage || shouldShowOnboarding(storage)) return false;
  try {
    return storage.getItem(RELEASE_NOTICE_STORAGE_KEY) !== RELEASE_NOTICE_ID;
  } catch {
    return false;
  }
}

export function clearReleaseNotice(storage: OnboardingStorage | null = deviceStorage()): void {
  try {
    storage?.removeItem(RELEASE_NOTICE_STORAGE_KEY);
  } catch {
    // Account deletion must continue when device storage is unavailable.
  }
}
