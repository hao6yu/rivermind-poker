import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderHandlers } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { HumanAvatar } from './HumanAvatar';
import { ModalSafeArea } from '../features/learn/ModalSafeArea';
import { humanAvatarAccessibilityLabel } from '../domain/avatar';
import {
  IDENTITY_ADJUSTMENT,
  type AvatarAdjustment,
} from '../domain/avatarProcessing';
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
import {
  client as avatarUploadClient,
  isAvatarCaptureAvailable,
  isAvatarUploadAvailable,
  pickProfileImage,
  readImageMagicBytes,
} from '../services/avatarUploadClient';
import {
  prepareAvatarSource,
  processAdjustedAvatar,
  type AvatarSourcePreparation,
  type PickedImage,
} from '../services/avatarUploadService';
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

/** The editor's two stages: the choice menu, then the crop/confirm surface. */
type EditorStage = 'menu' | 'adjust';

/** The confirmed, validated source awaiting the player's crop adjustment. */
type PreparedPhoto = Extract<AvatarSourcePreparation, { status: 'ok' }>;

/** Maximum zoom over the cover-fit, shared with the pure crop contract. */
const MAX_ADJUST_SCALE = 8;
/** Confirmation preview sizes: the Profile avatar and the table-seat avatar. */
const PROFILE_PREVIEW_SIZE = 88;
const SEAT_PREVIEW_SIZE = 24;

/**
 * The focused Profile avatar editor (Slice 3.11B): a bottom sheet containing
 * only the controls the task needs — current preview, authored choices,
 * photo selection/capture, initials fallback, and close — plus the adjust
 * stage for picked photos (pan/pinch square crop, two-size confirmation,
 * explicit Use photo). It carries no storage or sharing prose; the private
 * owner-scoped upload and room-authorized rendering rules are unchanged, and
 * the previous avatar stays active until the new artifact is durably
 * registered.
 *
 * The native pick path degrades to a localized "unavailable" alert when the
 * Expo image modules are absent, so the editor always renders.
 */
export function HumanAvatarProfilePicker({
  displayName,
  onClose,
  onChange,
  t,
}: {
  displayName: string;
  /** Close the sheet; the avatar is persisted only after a confirmed change. */
  onClose: () => void;
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
  const [stage, setStage] = useState<EditorStage>('menu');
  const [prepared, setPrepared] = useState<PreparedPhoto | null>(null);
  const [adjustment, setAdjustment] = useState<AvatarAdjustment>(IDENTITY_ADJUSTMENT);
  const [viewport, setViewport] = useState(0);
  // Gesture handlers read the latest adjustment without re-binding the
  // PanResponder on every frame.
  const adjustmentRef = useRef(adjustment);
  adjustmentRef.current = adjustment;
  const gestureStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number; scale: number; distance: number | null } | null>(null);

  // Photo actions are offered only when the native engine is loadable, so an
  // unsupported device shows a quiet editor instead of failing actions.
  const [photoSupported, setPhotoSupported] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([isAvatarUploadAvailable(), isAvatarCaptureAvailable()])
      .then(([library, camera]) => {
        if (!active) return;
        setPhotoSupported(library);
        setCameraSupported(camera);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Startup sweep: retry every artifact recorded by a failed replacement or
  // removal, so a stale cached file or hosted object that could not be deleted
  // earlier is retried on the next editor visit. Best-effort — a missing
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

  // The removal shares the replacement lock: concurrent remove/change flows
  // could otherwise purge the same registry entry twice.
  const removePhoto = async (): Promise<void> => {
    if (busy) return;
    if (avatar.kind !== 'uploaded') return;
    setBusy(true);
    try {
      await performRemovePhoto();
    } finally {
      setBusy(false);
    }
  };

  const performRemovePhoto = async (): Promise<void> => {
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

  /** Stage one: pick from the library or camera, validate as a source, and
   * open the adjust surface. Nothing is processed or persisted yet. */
  const startPhotoFlow = (source: 'library' | 'camera'): void => {
    if (busy) return;
    setBusy(true);
    pickProfileImage(source)
      .then(async (picked) => {
        const preparation = await prepareAvatarSource(picked, { readMagicBytes: readImageMagicBytes });
        if (preparation.status === 'ok') {
          setPrepared(preparation);
          setAdjustment(IDENTITY_ADJUSTMENT);
          setStage('adjust');
          return;
        }
        if (preparation.status !== 'cancelled') {
          Alert.alert(t('settings.avatarSection'), t(sourceStatusKey(preparation.status)));
        }
      })
      .catch(() => {
        Alert.alert(t('settings.avatarSection'), t('settings.avatarPickFailed'));
      })
      .finally(() => setBusy(false));
  };

  /** Leave the adjust surface without creating any artifact: the source is
   * discarded, so Cancel before confirmation leaves zero files behind. */
  const cancelAdjustment = (): void => {
    if (busy) return;
    setPrepared(null);
    setAdjustment(IDENTITY_ADJUSTMENT);
    setStage('menu');
  };

  /** Stage two: process the confirmed adjustment into the canonical artifact
   * and run the atomic replacement pipeline. */
  const confirmPhoto = (): void => {
    if (busy || !prepared) return;
    setBusy(true);
    const previous = avatar;
    processAdjustedAvatar(avatarUploadClient, prepared, adjustmentRef.current)
      .then(async (outcome) => {
        if (outcome.status !== 'ok') {
          if (outcome.error !== 'cancelled') {
            Alert.alert(t('settings.avatarSection'), t(outcomeStatusKey(outcome.error)));
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
        // Replacing an avatar orphans the previous one. The entry is removed
        // only when the cleanup is CONFIRMED or durably queued.
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
        setPrepared(null);
        setStage('menu');
      })
      .catch(() => {
        Alert.alert(t('settings.avatarSection'), t('settings.avatarPickFailed'));
      })
      .finally(() => {
        // The editor stays locked until session acquisition, cleanup, upload,
        // and profile persistence all finish — for replacements here and for
        // removals in `removePhoto`, so neither flow can overlap the other.
        setBusy(false);
      });
  };

  /** Pan/pinch gesture handling on the adjust viewport. */
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      const touches = event.nativeEvent.touches;
      const state = adjustmentRef.current;
      gestureStart.current = {
        x: touches[0]?.pageX ?? 0,
        y: touches[0]?.pageY ?? 0,
        offsetX: state.offsetX,
        offsetY: state.offsetY,
        scale: state.scale,
        distance: touches.length >= 2 ? touchDistance(touches) : null,
      };
    },
    onPanResponderMove: (event) => {
      const start = gestureStart.current;
      if (!start || viewport <= 0) return;
      const touches = event.nativeEvent.touches;
      if (touches.length >= 2 && start.distance) {
        const distance = touchDistance(touches);
        const scale = clampScale(start.scale * (distance / start.distance));
        setAdjustment((current) => ({ ...current, scale }));
        return;
      }
      const touch = touches[0];
      if (!touch) return;
      const dx = (touch.pageX - start.x) / viewport;
      const dy = (touch.pageY - start.y) / viewport;
      setAdjustment((current) => ({
        ...current,
        // Dragging the image right moves the visible window left.
        offsetX: start.offsetX - dx,
        offsetY: start.offsetY - dy,
      }));
    },
    onPanResponderRelease: () => {
      gestureStart.current = null;
    },
  }), [viewport]);

  return (
    <Modal animationType="slide" onRequestClose={stage === 'adjust' ? cancelAdjustment : onClose} visible>
      <ModalSafeArea>
        <View accessibilityViewIsModal style={styles.screen}>
          {stage === 'adjust' && prepared ? (
            <AdjustStage
              adjustment={adjustment}
              busy={busy}
              onCancel={cancelAdjustment}
              onConfirm={confirmPhoto}
              onLayoutViewport={setViewport}
              onReset={() => setAdjustment(IDENTITY_ADJUSTMENT)}
              panHandlers={panResponder.panHandlers}
              prepared={prepared}
              styles={styles}
              t={t}
              viewport={viewport}
            />
          ) : (
            <>
              <View style={styles.header}>
                <Text accessibilityRole="header" style={styles.title}>{t('settings.avatarEditorTitle')}</Text>
                <Pressable
                  accessibilityLabel={t('common.close')}
                  accessibilityRole="button"
                  hitSlop={6}
                  onPress={onClose}
                  style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
                >
                  <Ionicons color={palette.text} name="close" size={20} />
                </Pressable>
              </View>
              <ScrollView bounces={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <View style={styles.previewRow}>
                  <HumanAvatar
                    avatar={avatar}
                    displayName={displayName}
                    size={88}
                    accessibilityLabel={humanAvatarAccessibilityLabel(avatar)}
                  />
                  <View style={styles.previewCopy}>
                    <Text style={styles.previewName}>{displayName}</Text>
                    <Text style={styles.previewHint}>{t('settings.avatarPreviewHint')}</Text>
                  </View>
                </View>

                {photoSupported ? (
                  <View style={styles.photoActions}>
                    <Pressable
                      accessibilityLabel={t('settings.avatarChoosePhoto')}
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => startPhotoFlow('library')}
                      style={({ pressed }) => [styles.photoAction, pressed && styles.pressed, busy && styles.disabled]}
                    >
                      <Ionicons color={palette.primary} name="images-outline" size={18} />
                      <Text style={styles.photoActionText}>{t('settings.avatarChoosePhoto')}</Text>
                    </Pressable>
                    {cameraSupported ? (
                      <Pressable
                        accessibilityLabel={t('settings.avatarTakePhoto')}
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={() => startPhotoFlow('camera')}
                        style={({ pressed }) => [styles.photoAction, pressed && styles.pressed, busy && styles.disabled]}
                      >
                        <Ionicons color={palette.primary} name="camera-outline" size={18} />
                        <Text style={styles.photoActionText}>{t('settings.avatarTakePhoto')}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                {avatar.kind === 'uploaded' ? (
                  <Pressable
                    accessibilityLabel={t('settings.avatarRemovePhoto')}
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void removePhoto()}
                    style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed, busy && styles.disabled]}
                  >
                    <Text style={styles.secondaryActionText}>{t('settings.avatarRemovePhoto')}</Text>
                  </Pressable>
                ) : avatar.kind !== 'initials' ? (
                  <Pressable
                    accessibilityLabel={t('settings.avatarUseInitials')}
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={resetToInitials}
                    style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed, busy && styles.disabled]}
                  >
                    <Text style={styles.secondaryActionText}>{t('settings.avatarUseInitials')}</Text>
                  </Pressable>
                ) : null}

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
                        onPress={() => selectAuthored(entry.id)}
                        style={({ pressed }) => [
                          styles.swatch,
                          selected && styles.swatchSelected,
                          pressed && styles.swatchPressed,
                        ]}
                      >
                        <HumanAvatar
                          avatar={{ kind: 'authored', id: entry.id }}
                          size={36}
                          accessibilityLabel={entry.id}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </>
          )}
        </View>
      </ModalSafeArea>
    </Modal>
  );
}

/** Distance between the first two active touches, for pinch-to-zoom. */
function touchDistance(touches: ReadonlyArray<{ pageX: number; pageY: number }>): number {
  const [a, b] = touches;
  if (!a || !b) return 1;
  return Math.max(1, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY));
}

function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.max(1, Math.min(MAX_ADJUST_SCALE, scale));
}

/**
 * The adjust surface: the measured square viewport with pan/pinch, the
 * circular mask as a presentation overlay, and the two-size confirmation
 * preview (Profile avatar and table-seat avatar). The exact square the app
 * saves is the viewport itself; the circle never crops a second time.
 */
function AdjustStage({
  adjustment,
  busy,
  onCancel,
  onConfirm,
  onLayoutViewport,
  onReset,
  panHandlers,
  prepared,
  styles,
  t,
  viewport,
}: {
  adjustment: AvatarAdjustment;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onLayoutViewport: (size: number) => void;
  onReset: () => void;
  panHandlers: GestureResponderHandlers;
  prepared: PreparedPhoto;
  styles: ReturnType<typeof createStyles>;
  t: Translator;
  viewport: number;
}) {
  const { palette } = useAppTheme();
  const source = prepared.source;
  const rotation = prepared.rotation;
  const swap = rotation === 90 || rotation === 270;
  const storedWidth = Math.max(1, source.width ?? 1);
  const storedHeight = Math.max(1, source.height ?? 1);

  /** One parameterized rendering of the adjusted source: the crop viewport,
   * the Profile preview, and the table-seat preview all reuse it, so the
   * previews show exactly what will be saved. */
  const renderAdjustedImage = (box: number) => {
    const coverScale = box / Math.min(swap ? storedHeight : storedWidth, swap ? storedWidth : storedHeight);
    const width = storedWidth * coverScale;
    const height = storedHeight * coverScale;
    return (
      <View style={{ width: box, height: box, borderRadius: box / 2, overflow: 'hidden', backgroundColor: palette.soft }}>
        <Image
          source={{ uri: source.uri }}
          style={{
            position: 'absolute',
            width,
            height,
            left: (box - width) / 2,
            top: (box - height) / 2,
            transform: [
              { translateX: -adjustment.offsetX * box },
              { translateY: -adjustment.offsetY * box },
              { scale: adjustment.scale },
              { rotate: `${rotation}deg` },
            ],
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: box,
            height: box,
            borderRadius: box / 2,
            borderWidth: 2,
            borderColor: palette.tableText,
            opacity: 0.9,
          }}
        />
      </View>
    );
  };

  return (
    <>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={t('common.back')}
          accessibilityRole="button"
          disabled={busy}
          onPress={onCancel}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed, busy && styles.disabled]}
        >
          <Ionicons color={palette.text} name="arrow-back" size={20} />
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, styles.adjustTitle]}>{t('settings.avatarAdjustTitle')}</Text>
        <View style={styles.closeButton} />
      </View>
      <ScrollView bounces={false} contentContainerStyle={styles.content}>
        <Text style={styles.previewHint}>{t('settings.avatarAdjustHint')}</Text>
        <View
          {...panHandlers}
          onLayout={(event) => {
            const size = Math.round(Math.min(event.nativeEvent.layout.width, 420));
            if (size > 0) onLayoutViewport(size);
          }}
          style={[styles.adjustViewport, viewport > 0 ? { height: viewport } : null]}
        >
          {viewport > 0 ? renderAdjustedImage(viewport) : null}
        </View>
        <View style={styles.confirmRow}>
          <View style={styles.confirmPreview}>
            {renderAdjustedImage(PROFILE_PREVIEW_SIZE)}
            <Text style={styles.confirmPreviewLabel}>{t('settings.avatarProfilePreview')}</Text>
          </View>
          <View style={styles.confirmPreview}>
            {renderAdjustedImage(SEAT_PREVIEW_SIZE)}
            <Text style={styles.confirmPreviewLabel}>{t('settings.avatarSeatPreview')}</Text>
          </View>
        </View>
        <Pressable
          accessibilityLabel={t('settings.avatarUsePhoto')}
          accessibilityRole="button"
          disabled={busy || viewport <= 0}
          onPress={onConfirm}
          style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed, (busy || viewport <= 0) && styles.disabled]}
        >
          <Text style={styles.primaryActionText}>{t('settings.avatarUsePhoto')}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={t('settings.avatarAdjustAgain')}
          accessibilityRole="button"
          disabled={busy}
          onPress={onReset}
          style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed, busy && styles.disabled]}
        >
          <Text style={styles.secondaryActionText}>{t('settings.avatarAdjustAgain')}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={t('common.cancel')}
          accessibilityRole="button"
          disabled={busy}
          onPress={onCancel}
          style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed, busy && styles.disabled]}
        >
          <Text style={styles.secondaryActionText}>{t('common.cancel')}</Text>
        </Pressable>
      </ScrollView>
    </>
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

/** Map a source-stage rejection to its localized settings key. */
function sourceStatusKey(status: Exclude<AvatarSourcePreparation['status'], 'ok' | 'cancelled'>): MessageKey {
  switch (status) {
    case 'unsupported-source':
      return 'settings.avatarUnsupportedFormat';
    case 'source-too-large':
      return 'settings.avatarSourceTooLarge';
    case 'source-pixels-too-large':
      return 'settings.avatarPixelLimit';
    default:
      return 'settings.avatarPickFailed';
  }
}

/** Map a processing-stage rejection to its localized settings key. */
function outcomeStatusKey(error: string): MessageKey {
  switch (error) {
    case 'unavailable':
      return 'settings.avatarPickUnavailable';
    case 'unsupported-mime':
      return 'settings.avatarUnsupportedFormat';
    case 'not-an-image':
      return 'settings.avatarImageCorrupt';
    case 'output-too-large':
    case 'output-too-large-dimensions':
      return 'settings.avatarProcessedTooLarge';
    case 'source-too-large':
      return 'settings.avatarSourceTooLarge';
    case 'source-pixels-too-large':
      return 'settings.avatarPixelLimit';
    case 'unsupported-source':
      return 'settings.avatarUnsupportedFormat';
    default:
      return 'settings.avatarPickFailed';
  }
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      backgroundColor: palette.surface,
    },
    title: { color: palette.text, fontSize: 17, fontWeight: '800', flex: 1 },
    adjustTitle: { textAlign: 'center' },
    closeButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 13,
      backgroundColor: palette.soft,
    },
    pressed: { opacity: 0.7 },
    disabled: { opacity: 0.5 },
    content: { padding: 16, gap: 14 },
    previewRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 },
    previewCopy: { flex: 1, gap: 4 },
    previewName: { color: palette.text, fontSize: 17, fontWeight: '800' },
    previewHint: { color: palette.muted, fontSize: 12, lineHeight: 17, fontWeight: '600' },
    photoActions: { gap: 10 },
    photoAction: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    photoActionText: { color: palette.primary, fontSize: 14, fontWeight: '800' },
    primaryAction: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      backgroundColor: palette.primary,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    primaryActionText: { color: palette.primaryText, fontSize: 15, fontWeight: '800' },
    secondaryAction: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    secondaryActionText: { color: palette.text, fontSize: 13, fontWeight: '700' },
    sectionLabel: { color: palette.text, fontSize: 12, fontWeight: '800', marginTop: 4 },
    library: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    swatch: {
      width: 52,
      height: 52,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    swatchSelected: { borderColor: palette.primary, borderWidth: 2 },
    swatchPressed: { opacity: 0.7 },
    adjustViewport: {
      width: '100%',
      maxWidth: 420,
      alignSelf: 'center',
      borderRadius: 16,
      backgroundColor: palette.soft,
      overflow: 'hidden',
    },
    confirmRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, paddingVertical: 4 },
    confirmPreview: { alignItems: 'center', gap: 6 },
    confirmPreviewLabel: { color: palette.muted, fontSize: 10, fontWeight: '700' },
  });
}
