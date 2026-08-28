import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { HumanAvatar } from './HumanAvatar';
import { humanAvatarAccessibilityLabel } from '../domain/avatar';
import {
  HUMAN_AVATAR_LIBRARY,
  DEFAULT_HUMAN_AVATAR,
  initialsFromName,
  type HumanAvatarId,
  type HumanAvatarReference,
} from '../domain/playerProfile';
import {
  clearSingleUploadedAvatar,
  deleteAvatarFileConfirmed,
  resolveAvatarCleanupDeleters,
  sweepPendingAvatarCleanups,
} from '../services/avatarCleanup';
import { pickProfileAvatar } from '../services/avatarUploadClient';
import {
  UploadedAvatar,
  enqueueAvatarCleanup,
  getUploadedAvatar,
  persistUploadedAvatarConfirmed,
  removeUploadedAvatar,
  retainAvatarCleanupReference,
} from '../services/avatarStorage';
import { ensureAnonymousSession, supabase } from '../services/supabase';
import { loadHumanAvatar, saveHumanAvatar } from '../services/playerProfile';
import type { MessageKey } from '../localization/messages';
import { type ThemePalette, useAppTheme } from '../theme';

/** A translator bound to the active app language. */
type Translator = (key: MessageKey, values?: Record<string, string | number>) => string;

/**
 * A self-contained identity editor for the Profile screen: the current avatar,
 * the authored library, and the ability to choose an uploaded photo or reset to
 * initials. It talks only to the persisted profile + registry (device storage),
 * so the Profile screen can own the name and stay in sync via `onChange`.
 *
 * The native pick path degrades to an on-screen "unavailable" message when the
 * Expo image modules are absent, so the editor always renders offline.
 */
export function HumanAvatarProfilePicker({
  displayName,
  onChange,
  t,
}: {
  displayName: string;
  /** Called after the persisted avatar reference changes, so the profile can refresh. */
  onChange?: (avatar: HumanAvatarReference) => void;
  t: Translator;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [avatar, setAvatar] = useState<HumanAvatarReference>(
    () => loadHumanAvatar() ?? DEFAULT_HUMAN_AVATAR,
  );
  const [busy, setBusy] = useState(false);

  // Startup sweep: retry every artifact recorded by a failed replacement or
  // removal, so a stale cached file or hosted object that could not be deleted
  // earlier is retried on the next profile visit. Best-effort — a missing
  // deleter simply leaves the record queued for the next sweep.
  useEffect(() => {
    void sweepPendingAvatarCleanups().catch(() => undefined);
  }, []);

  const apply = (next: HumanAvatarReference): void => {
    const saved = saveHumanAvatar(next);
    if (saved) {
      setAvatar(next);
      onChange?.(next);
    }
  };

  const selectAuthored = (id: HumanAvatarId): void => apply({ kind: 'authored', id });

  const resetToInitials = (): void => apply({ kind: 'initials', initials: initialsFromName(displayName) });

  const removePhoto = async (): Promise<void> => {
    if (avatar.kind !== 'uploaded') return;
    const existing = getUploadedAvatar(avatar.avatarId);
    if (!existing) {
      removeUploadedAvatar(avatar.avatarId);
      resetToInitials();
      return;
    }
    // Delete the processed file and hosted object first. The entry is removed
    // only when its cleanup is CONFIRMED or durably queued. If the purge fails
    // AND the queue rejects the record (full even after a sweep, or storage
    // failure), hard-block: keep the old avatar active and do not reset the
    // profile — the entry's URI remains the only tracked reference.
    const purge = await purgeUploadedAvatar(existing);
    if (purge.fileConfirmed && purge.objectConfirmed) {
      removeUploadedAvatar(avatar.avatarId);
      void sweepPendingAvatarCleanups().catch(() => undefined);
      resetToInitials();
      return;
    }
    const queued = await enqueueAvatarCleanup({
      avatarId: existing.avatarId,
      uri: existing.uri,
      // The owner is recorded only while the object deletion itself is
      // unconfirmed: retrying a known-missing object can never drain.
      ...(existing.ownerId && !purge.objectConfirmed ? { ownerId: existing.ownerId } : {}),
    });
    if (queued) {
      removeUploadedAvatar(avatar.avatarId);
      void sweepPendingAvatarCleanups().catch(() => undefined);
      resetToInitials();
      return;
    }
    // Fail closed: neither deletion nor durable queuing succeeded — the
    // reference must not be discarded, so the removal does not happen.
    Alert.alert(t('settings.avatarSection'), t('settings.avatarCleanupRetryLater'));
  };

  const changePhoto = (): void => {
    if (busy) return;
    setBusy(true);
    const previous = avatar;
    pickProfileAvatar()
      .then(async (outcome) => {
        if (outcome.status !== 'ok') {
          if (outcome.error !== 'cancelled') {
            Alert.alert(t('settings.avatarSection'), t(errorKey(outcome.error)));
          }
          return;
        }
        const ownerId = await ensureAnonymousSession();
        // PHASE 1 — secure the NEW candidate before the previous avatar is
        // touched, so every abort below leaves the saved profile pointing at
        // a valid avatar. Register the fresh entry FIRST so its cached file is
        // tracked from the moment it exists.
        const persistedEntry = toPersisted(outcome, undefined);
        if (!persistUploadedAvatarConfirmed(persistedEntry)) {
          const retained = await secureDiscardedCacheFile(outcome.avatarId, outcome.uri);
          if (!retained) console.error('avatar cleanup retention failed; the discarded photo may be untracked', outcome.uri);
          Alert.alert(t('settings.avatarSection'), t('settings.avatarPickFailed'));
          return;
        }
        // Host the picked avatar so roommates can resolve it through
        // avatar-access; degrades to "renders locally only" on failure. The
        // ownership marker is stamped only after a CONFIRMED upload: cleanup
        // treats a hosted object as required exactly when one exists, so an
        // offline pick never leaves a phantom owner-scoped requirement behind.
        let hosted = false;
        hosted = await uploadAvatarToBucket(ownerId, outcome.avatarId, outcome.uri, outcome.mimeType);
        if (hosted) {
          const ownerRegistered = persistUploadedAvatarConfirmed({ ...persistedEntry, ownerId });
          if (!ownerRegistered) {
            // The object is hosted but its owner marker could not be durably
            // registered — local cleanup would treat the object as
            // nonexistent. Remove the object now; when that cannot be
            // confirmed either, unregister the fresh entry and retain an
            // owner-scoped cleanup reference (the fresh file is abandoned, so
            // a sweep may delete file and object together). The old avatar
            // stays active in every case.
            const removed = await deleteUploadedAvatarObject(ownerId, outcome.avatarId);
            if (!removed) {
              removeUploadedAvatar(outcome.avatarId);
              const retained = await retainAvatarCleanupReference({
                avatarId: outcome.avatarId,
                uri: outcome.uri,
                ownerId,
              });
              if (!retained) console.error('avatar cleanup retention failed; a hosted photo may be untracked', outcome.uri);
              Alert.alert(t('settings.avatarSection'), t('settings.avatarPickFailed'));
              return;
            }
          }
        }
        // PHASE 2 — the new candidate is durably registered (and its hosted
        // object, if any, is tracked): the previous avatar can now be retired.
        // Replacing an avatar orphans the previous one. Purge its cached file
        // and hosted object; the old entry is removed only when the cleanup is
        // CONFIRMED or durably queued.
        if (previous.kind === 'uploaded') {
          const previousAvatar = getUploadedAvatar(previous.avatarId);
          if (previousAvatar) {
            const purge = await purgeUploadedAvatar(previousAvatar);
            if (!(purge.fileConfirmed && purge.objectConfirmed)) {
              const queued = await enqueueAvatarCleanup({
                avatarId: previousAvatar.avatarId,
                uri: previousAvatar.uri,
                // The owner is recorded only while the object deletion itself
                // is unconfirmed: retrying a known-missing object never drains.
                ...(previousAvatar.ownerId && !purge.objectConfirmed ? { ownerId: previousAvatar.ownerId } : {}),
              });
              if (!queued) {
                // Hard block: the superseded artifact could be neither deleted
                // nor durably tracked. Keep the OLD avatar active — do not
                // apply — and unregister the fresh candidate, retaining its
                // artifacts (file-only, or owner-scoped when already hosted)
                // so nothing is untracked. The previous entry itself was never
                // removed, so the profile reference stays valid.
                removeUploadedAvatar(outcome.avatarId);
                const retained = await retainAvatarCleanupReference({
                  avatarId: outcome.avatarId,
                  uri: outcome.uri,
                  ...(hosted ? { ownerId } : {}),
                });
                if (!retained) console.error('avatar cleanup retention failed; the discarded photo may be untracked', outcome.uri);
                Alert.alert(t('settings.avatarSection'), t('settings.avatarCleanupRetryLater'));
                return;
              }
            }
            removeUploadedAvatar(previous.avatarId);
          }
        }
        void sweepPendingAvatarCleanups().catch(() => undefined);
        const next: HumanAvatarReference = { kind: 'uploaded', avatarId: outcome.avatarId, version: outcome.version };
        apply(next);
      })
      .catch(() => {
        Alert.alert(t('settings.avatarSection'), t('settings.avatarPickFailed'));
      })
      .finally(() => {
        // The editor stays locked until session acquisition, cleanup, upload,
        // and profile persistence all finish, so two replacements can never
        // overlap and purge each other's artifacts.
        setBusy(false);
      });
  };

  return (
    <View>
      <View style={styles.row}>
        <HumanAvatar
          avatar={avatar}
          displayName={displayName}
          size={72}
          accessibilityLabel={humanAvatarAccessibilityLabel(avatar)}
        />
        {avatar.kind === 'uploaded' && (
          <Pressable
            accessibilityLabel={t('settings.avatarResetToInitials')}
            accessibilityRole="button"
            hitSlop={10}
            onPress={removePhoto}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          >
            <Text style={styles.actionText}>{t('settings.avatarRemovePhoto')}</Text>
          </Pressable>
        )}
      </View>

      {avatar.kind === 'uploaded' && (
        <Text style={styles.privacyNote}>{t('settings.avatarPrivacyNote')}</Text>
      )}

      <Text style={styles.sectionLabel}>{t('settings.avatarChosen')}</Text>
      <View style={styles.library}>
        {HUMAN_AVATAR_LIBRARY.map((entry) => {
          const selected = avatar.kind === 'authored' && avatar.id === entry.id;
          return (
            <Pressable
              key={entry.id}
              accessibilityLabel={t('settings.avatarChosen')}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              disabled={busy}
              hitSlop={8}
              onPress={() => selectAuthored(entry.id)}
              style={({ pressed }) => [
                styles.swatch,
                selected && styles.swatchSelected,
                pressed && styles.swatchPressed,
              ]}
            >
              <HumanAvatar
                avatar={{ kind: 'authored', id: entry.id }}
                size={40}
                accessibilityLabel={entry.id}
              />
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityLabel={t('settings.avatarChangePhoto')}
        accessibilityRole="button"
        disabled={busy}
        hitSlop={10}
        onPress={changePhoto}
        style={({ pressed }) => [styles.changeButton, pressed && styles.changeButtonPressed]}
      >
        <Text style={styles.changeButtonText}>{t('settings.avatarChangePhoto')}</Text>
      </Pressable>
    </View>
  );
}

function toPersisted(
  outcome: { avatarId: string; version: number; uri: string; descriptor: UploadedAvatar['descriptor'] },
  ownerId: string | undefined,
): UploadedAvatar {
  return {
    avatarId: outcome.avatarId,
    version: outcome.version,
    ownerId,
    objectPath: `local:${outcome.avatarId}:${outcome.version}`,
    uri: outcome.uri,
    descriptor: outcome.descriptor,
    savedAtMs: Date.now(),
  };
}

/** Delete one uploaded avatar's cached file and hosted object, if they load.
 * Reports each artifact's confirmation separately; a missing deleter module
 * or a failed deletion is unconfirmed (false) so the caller can queue or
 * retain the reference for a later retry. */
async function purgeUploadedAvatar(
  avatar: UploadedAvatar,
): Promise<{ fileConfirmed: boolean; objectConfirmed: boolean }> {
  const clients = await resolveAvatarCleanupDeleters();
  if (!clients) return { fileConfirmed: false, objectConfirmed: !avatar.ownerId };
  return clearSingleUploadedAvatar(avatar, clients);
}

/** Best-effort removal of a just-hosted object (compensates an unregistered
 * owner marker). Reports confirmation; a missing client or a failed removal
 * returns false. */
async function deleteUploadedAvatarObject(ownerId: string, avatarId: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.storage.from('avatars').remove([`${ownerId}/${avatarId}`]);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Dispose of a freshly written cache file that the blocked replacement will
 * not reference. `true` only when the file is confirmed gone; otherwise the
 * uri is durably retained (cleanup queue, then the tombstone store) so the
 * discarded photo is never untracked.
 */
async function secureDiscardedCacheFile(avatarId: string, uri: string): Promise<boolean> {
  const clients = await resolveAvatarCleanupDeleters();
  if (clients?.files) {
    const confirmed = await deleteAvatarFileConfirmed(clients.files, uri);
    if (confirmed) return true;
  }
  return retainAvatarCleanupReference({ avatarId, uri });
}

/**
 * Host the picked avatar in the private `avatars` bucket so roommates can
 * resolve it through `avatar-access`. The object path is owner-scoped
 * (`${ownerId}/${avatarId}`), which is what the bucket's `auth.uid()` RLS
 * requires and what `avatar-access` verifies. Returns `true` ONLY when the
 * upload is confirmed; a missing client (offline / not configured) or a
 * failed upload degrades to "renders locally only" and returns `false` — the
 * caller must not stamp the ownership marker without a hosted object.
 */
async function uploadAvatarToBucket(ownerId: string, avatarId: string, uri: string, mimeType: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    // Read the processed avatar bytes via the SDK 54 `File` API; the storage
    // client accepts the raw bytes directly.
    const { File } = await import('expo-file-system' as unknown as string);
    const bytes = await new File(uri).bytes();
    const { error } = await supabase.storage.from('avatars').upload(`${ownerId}/${avatarId}`, bytes, {
      contentType: mimeType,
      upsert: true,
    });
    if (error) {
      console.warn('avatar upload to the private bucket failed:', error.message);
      return false;
    }
    return true;
  } catch {
    // expo-file-system not loaded — the avatar still renders locally.
    return false;
  }
}

/** Map a failed outcome to the localized settings key. */
function errorKey(error: string): MessageKey {
  switch (error) {
    case 'unavailable':
      return 'settings.avatarPickUnavailable';
    case 'unsupported-mime':
      return 'settings.avatarUnsupportedFormat';
    case 'too-large':
      return 'settings.avatarTooLarge';
    default:
      return 'settings.avatarPickFailed';
  }
}

function createStyles(palette: ThemePalette) {
  const common = { width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: palette.border } as const;
  return StyleSheet.create({
    row: { alignItems: 'center', gap: 14, flexDirection: 'row' },
    action: {
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
    },
    actionPressed: { opacity: 0.7 },
    actionText: { color: palette.text, fontSize: 13, fontWeight: '800' },
    privacyNote: { color: palette.muted, fontSize: 11, marginTop: 10, lineHeight: 15 },
    sectionLabel: { color: palette.text, fontSize: 12, fontWeight: '800', marginTop: 18, marginBottom: 8 },
    library: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: -6 },
    swatch: { borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    swatchSelected: { borderColor: palette.primary, backgroundColor: palette.primary },
    swatchPressed: { opacity: 0.7 },
    changeButton: { marginTop: 16, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, backgroundColor: palette.primary },
    changeButtonPressed: { opacity: 0.8 },
    changeButtonText: { color: palette.primaryText, fontSize: 14, fontWeight: '800' },
  });
}
