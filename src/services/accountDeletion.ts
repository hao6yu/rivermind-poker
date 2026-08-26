import { clearAiCoachConsent } from './aiCoachConsent';
import { clearAppDiagnostics } from './betaFeedback';
import { clearChampionshipProgress } from './championshipProgress';
import { clearCachedDailyChallengeProgress } from './dailyChallengeProgress';
import { clearPendingHandHistory } from './handHistory';
import { clearLearningHistory } from './learningHistory';
import { clearLearningProfile } from './learningProfile';
import { clearCachedLearningProgress } from './learningProgress';
import { clearLearningReviewQueue } from './learningReviewQueue';
import { clearActiveMultiplayerRoom } from './multiplayerRecovery';
import { resetOnboarding } from './onboarding';
import { resetOpponentMemory } from './opponentMemory';
import { clearPlayerDisplayName } from './playerProfile';
import { clearRecommendedSession } from './recommendedSessionCheckpoint';
import { supabase } from './supabase';
import {
  clearDailyChallengeCheckpoint,
  clearSitAndGoCheckpoint,
} from './tournamentCheckpoint';

const ACCOUNT_DELETION_CONFIRMATION = 'delete-account';

interface AccountDeletionSession {
  access_token: string;
  user: { id: string };
}

export interface AccountDeletionClient {
  auth: {
    getSession(): Promise<{
      data: { session: AccountDeletionSession | null };
      error: unknown | null;
    }>;
    getUser(accessToken: string): Promise<{
      data: { user: { id: string } | null };
      error: unknown | null;
    }>;
    signOut(options: { scope: 'local' }): Promise<{ error: unknown | null }>;
  };
  functions: {
    invoke(
      functionName: 'delete-account',
      options: { body: { confirmation: typeof ACCOUNT_DELETION_CONFIRMATION } },
    ): Promise<{ data: unknown; error: unknown | null }>;
  };
}

function deletionSucceeded(value: unknown): value is { deleted: true } {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as Record<string, unknown>).deleted === true;
}

function userWasAlreadyDeleted(value: unknown): boolean {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as Record<string, unknown>).code === 'user_not_found';
}

/**
 * Removes account-bound device state while preserving device preferences such
 * as language, appearance, and haptics.
 */
export function clearLocalAccountData(): void {
  clearAiCoachConsent();
  clearPendingHandHistory();
  clearCachedLearningProgress();
  clearLearningHistory();
  clearLearningReviewQueue();
  clearLearningProfile();
  clearCachedDailyChallengeProgress();
  clearDailyChallengeCheckpoint();
  clearSitAndGoCheckpoint(3);
  clearSitAndGoCheckpoint(6);
  clearChampionshipProgress();
  resetOpponentMemory();
  clearActiveMultiplayerRoom();
  clearPlayerDisplayName();
  clearAppDiagnostics();
  clearRecommendedSession();
  resetOnboarding();
}

/**
 * Deletes the existing anonymous Supabase user without silently creating a
 * replacement account. Local data is cleared only after the server confirms
 * deletion, or immediately when no remote session/account exists.
 */
export async function deleteCurrentAccount(
  client: AccountDeletionClient | null = supabase as unknown as AccountDeletionClient | null,
): Promise<{ deletedRemoteAccount: boolean }> {
  if (!client) {
    clearLocalAccountData();
    return { deletedRemoteAccount: false };
  }

  const sessionResult = await client.auth.getSession();
  if (sessionResult.error) throw sessionResult.error;
  if (!sessionResult.data.session) {
    clearLocalAccountData();
    return { deletedRemoteAccount: false };
  }

  const result = await client.functions.invoke('delete-account', {
    body: { confirmation: ACCOUNT_DELETION_CONFIRMATION },
  });
  if (result.error || !deletionSucceeded(result.data)) {
    // The hard delete may have committed even if its HTTP response was lost.
    // A deleted JWT cannot call the function again, so verify the old user and
    // finish local cleanup only for Auth's explicit user_not_found response.
    const verification = await client.auth.getUser(sessionResult.data.session.access_token);
    if (verification.data.user || !userWasAlreadyDeleted(verification.error)) {
      if (result.error) throw result.error;
      throw new Error('The account deletion response could not be verified.');
    }
  }

  try {
    // Supabase ignores an expected 401/404 after admin deletion and still
    // removes the persisted access/refresh tokens from this device.
    await client.auth.signOut({ scope: 'local' });
  } catch {
    // The server deletion is authoritative; device data is still cleared and
    // the deleted session cannot be refreshed because its auth row is gone.
  }
  clearLocalAccountData();
  return { deletedRemoteAccount: true };
}
