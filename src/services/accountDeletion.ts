import { clearAiCoachConsent } from './aiCoachConsent';
import { clearAppDiagnostics, recordAppDiagnostic } from './betaFeedback';
import {
  purgeUploadedAvatarArtifacts,
  resolveAvatarCleanupDeleters,
  sweepPendingAvatarCleanups,
  type UnretainedAvatarCleanup,
} from './avatarCleanup';
import {
  addAvatarCleanupTombstones,
  clearUploadedAvatars,
  enqueueAvatarCleanup,
  listUploadedAvatars,
  stripOwnerFromAvatarCleanupTombstones,
  stripOwnerFromPendingAvatarCleanups,
} from './avatarStorage';
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
import { clearSessionEvidence } from './recommendedSessionEvidence';
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
/**
 * Clear every account-bound piece of local device state.
 *
 * `preserveUploadedAvatars` keeps the uploaded-avatar registry key untouched.
 * The registry holds the only references to processed local files / hosted
 * objects, so the account-deletion path clears it only when every reference
 * has been confirmed deleted or durably re-queued; when storage is rejecting
 * writes, the key must stay put rather than be removed and unreliably
 * recreated (a delete-then-rewrite loses the references on a general
 * setItem/quota failure).
 */
export function clearLocalAccountData(options: { preserveUploadedAvatars?: boolean } = {}): void {
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
  clearSitAndGoCheckpoint(9);
  clearChampionshipProgress();
  resetOpponentMemory();
  clearActiveMultiplayerRoom();
  clearPlayerDisplayName();
  // The uploaded-avatar registry holds the only reference to any processed
  // local file or hosted object, so it is cleared here alongside the profile
  // unless the caller must preserve it. The local file and hosted object
  // themselves are purged separately by `purgeUploadedAvatarArtifacts` before
  // the account is deleted remotely.
  if (!options.preserveUploadedAvatars) clearUploadedAvatars();
  clearAppDiagnostics();
  clearRecommendedSession();
  // The recommended-session evidence store is account-bound learning data, so it
  // is cleared here alongside the plan checkpoint.
  clearSessionEvidence();
  resetOnboarding();
}

/**
 * Full, account-bound cleanup: purge the cached file and hosted object for every
 * uploaded avatar, drain the persisted cleanup queue (artifacts a failed
 * replacement/removal could not delete), then clear the rest of the
 * account-local device state. The file/hosted purges run over the async
 * deleters, which degrade gracefully when `expo-file-system` or the configured
 * Supabase client is unavailable.
 *
 * Fail-closed invariant: an avatar whose deletion is unconfirmed must keep a
 * durable reference. The purge queues every unconfirmed artifact; the sweep
 * then retries the queue; entries that STILL could not be confirmed AND could
 * not be durably queued (the queue rejected them while full, or storage
 * failed) are re-attempted once more after the sweep — which may have drained
 * room — and any that remain are MERGED into the CLEANUP TOMBSTONE store, a
 * device-global retry source the app-startup sweep processes (deleting the
 * artifacts or moving the references into the queue). The merge appends to
 * tombstones from earlier failures instead of replacing them. Tombstones are
 * deliberately NOT registry records: the registry is account data that
 * account deletion must clear, while tombstones are cleanup state with their
 * own consumer.
 *
 * If even the tombstone store rejects the write, the registry is PRESERVED
 * through the clear (never removed and recreated): clearing the key first and
 * rewriting it would lose the references again whenever storage is generally
 * unavailable or quota-exhausted.
 *
 * `serverConfirmedOwnerId` marks a confirmed remote account deletion: the
 * delete-account Edge function removes every object owned by that user before
 * deleting the auth user, after which this client can no longer authenticate
 * to verify them — so that user's hosted objects are treated as already gone
 * (queue/tombstone records become file-only) for the fresh purge, and any
 * EXISTING owner-scoped queue/tombstone records for the same user are
 * converted to file-only too, before the queue is swept.
 */
async function purgeLocalAccountData(serverConfirmedOwnerId?: string): Promise<void> {
  const serverConfirmedObjects = serverConfirmedOwnerId != null;
  const clients = await resolveAvatarCleanupDeleters();
  let unretained: UnretainedAvatarCleanup[] = [];
  if (clients) {
    const purge = await purgeUploadedAvatarArtifacts(undefined, clients, { serverConfirmedObjects });
    if (serverConfirmedOwnerId) {
      // The deleted user's objects are confirmed gone server-side; records
      // queued/tombstoned BEFORE this deletion must not retry them.
      stripOwnerFromPendingAvatarCleanups(serverConfirmedOwnerId, undefined);
      stripOwnerFromAvatarCleanupTombstones(serverConfirmedOwnerId, undefined);
    }
    await sweepPendingAvatarCleanups(undefined, clients);
    unretained = purge.unretained;
    if (unretained.length > 0) {
      // The sweep may have drained the queue; give each unretained artifact a
      // second, durable-queuing attempt before falling back to a tombstone.
      const stillUnretained: UnretainedAvatarCleanup[] = [];
      for (const item of unretained) {
        const queued = await enqueueAvatarCleanup(
          {
            avatarId: item.avatar.avatarId,
            uri: item.avatar.uri,
            ...(item.avatar.ownerId && item.objectUnconfirmed ? { ownerId: item.avatar.ownerId } : {}),
          },
          undefined,
        );
        if (!queued) stillUnretained.push(item);
      }
      unretained = stillUnretained;
    }
  } else {
    // No deleter could load: nothing is confirmable, so EVERY reference must
    // be preserved (a tombstone, or the registry if even that fails) instead
    // of being cleared with the registry.
    unretained = listUploadedAvatars(undefined).map((avatar) => ({
      avatar,
      objectUnconfirmed: Boolean(avatar.ownerId) && !serverConfirmedObjects,
    }));
  }
  let preserveRegistry = false;
  if (unretained.length > 0) {
    const tombstoned = unretained.map(({ avatar, objectUnconfirmed }) => ({
      avatarId: avatar.avatarId,
      uri: avatar.uri,
      ...(avatar.ownerId && objectUnconfirmed ? { ownerId: avatar.ownerId } : {}),
    }));
    // Append non-destructively: tombstones already stored from earlier
    // failures are merged and deduplicated, never overwritten.
    const secured = addAvatarCleanupTombstones(tombstoned, undefined);
    if (!secured) {
      // Neither the queue nor the tombstone store accepted these URIs (the
      // store rejected the write). Logging is not fail-closed: keep the
      // REGISTRY KEY in place through the clear — a delete-and-rewrite would
      // lose the references again on a general storage failure.
      preserveRegistry = true;
      // Diagnostic token only: the URIs themselves stay on the device.
      recordAppDiagnostic({ code: 'avatar-tombstone-persist-failed', retryable: true, source: 'account-deletion' });
      console.error(
        'avatar cleanup tombstones could not be persisted; preserving the avatar registry',
        tombstoned.map((tombstone) => tombstone.uri),
      );
    } else {
      recordAppDiagnostic({ code: 'avatar-cleanup-queued', retryable: true, source: 'account-deletion' });
      console.warn(
        'avatar cleanup could not be secured during account deletion; tombstoned for a later sweep',
        tombstoned.map((tombstone) => tombstone.uri),
      );
    }
  }
  clearLocalAccountData({ preserveUploadedAvatars: preserveRegistry });
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
    await purgeLocalAccountData();
    return { deletedRemoteAccount: false };
  }

  const sessionResult = await client.auth.getSession();
  if (sessionResult.error) throw sessionResult.error;
  if (!sessionResult.data.session) {
    await purgeLocalAccountData();
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
  // The remote deletion is confirmed (directly, or via the user_not_found
  // verification): the Edge function removed every object owned by this user
  // before deleting them, so local cleanup treats that owner's hosted objects
  // as server-confirmed — the deleted user id lets cleanup ALSO convert any
  // previously queued/tombstoned owner-scoped records for them to file-only,
  // since their object checks could no longer authenticate.
  await purgeLocalAccountData(sessionResult.data.session.user.id);
  return { deletedRemoteAccount: true };
}
