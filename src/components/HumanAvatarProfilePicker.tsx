import { useMemo, useState } from 'react';
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
  resolveAvatarCleanupDeleters,
} from '../services/avatarCleanup';
import { pickProfileAvatar } from '../services/avatarUploadClient';
import {
  UploadedAvatar,
  getUploadedAvatar,
  persistUploadedAvatar,
  removeUploadedAvatar,
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
    // Delete the processed file and hosted object, then clear the registry so
    // nothing avatar-related survives a removal.
    const existing = getUploadedAvatar(avatar.avatarId);
    if (existing) await purgeUploadedAvatar(existing);
    removeUploadedAvatar(avatar.avatarId);
    resetToInitials();
  };

  const changePhoto = (): void => {
    setBusy(true);
    const previous = avatar;
    pickProfileAvatar()
      .then(async (outcome) => {
        setBusy(false);
        if (outcome.status === 'ok') {
          const ownerId = await ensureAnonymousSession();
          persistUploadedAvatar(toPersisted(outcome, ownerId));
          // Replacing an avatar orphans the previous one; purge its file +
          // object so the stale artifact does not linger on the device.
          if (previous.kind === 'uploaded') {
            const previousAvatar = getUploadedAvatar(previous.avatarId);
            if (previousAvatar) await purgeUploadedAvatar(previousAvatar);
          }
          // Host the picked avatar so roommates can resolve it through
          // avatar-access; degrades to "renders locally only" on failure.
          await uploadAvatarToBucket(ownerId, outcome.avatarId, outcome.uri, outcome.mimeType);
          const next: HumanAvatarReference = { kind: 'uploaded', avatarId: outcome.avatarId, version: outcome.version };
          apply(next);
        } else if (outcome.error !== 'cancelled') {
          Alert.alert(t('settings.avatarSection'), t(errorKey(outcome.error)));
        }
      })
      .catch(() => {
        setBusy(false);
        Alert.alert(t('settings.avatarSection'), t('settings.avatarPickFailed'));
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

/** Delete one uploaded avatar's cached file and hosted object, if they load. */
async function purgeUploadedAvatar(avatar: UploadedAvatar): Promise<void> {
  const clients = await resolveAvatarCleanupDeleters();
  if (clients) {
    await clearSingleUploadedAvatar(avatar, clients);
  }
}

/**
 * Host the picked avatar in the private `avatars` bucket so roommates can
 * resolve it through `avatar-access`. The object path is owner-scoped
 * (`${ownerId}/${avatarId}`), which is what the bucket's `auth.uid()` RLS
 * requires and what `avatar-access` verifies. A missing client (offline / not
 * configured) or a failed upload degrades to "renders locally only" — the
 * descriptor is still persisted, so the avatar renders on this device even
 * without the hosted copy.
 */
async function uploadAvatarToBucket(ownerId: string, avatarId: string, uri: string, mimeType: string): Promise<void> {
  if (!supabase) return;
  try {
    // Read the processed avatar bytes via the SDK 54 `File` API; the storage
    // client accepts the raw bytes directly.
    const { File } = await import('expo-file-system' as unknown as string);
    const bytes = await new File(uri).bytes();
    const { error } = await supabase.storage.from('avatars').upload(`${ownerId}/${avatarId}`, bytes, {
      contentType: mimeType,
      upsert: true,
    });
    if (error) console.warn('avatar upload to the private bucket failed:', error.message);
  } catch {
    // expo-file-system not loaded — the avatar still renders locally.
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
