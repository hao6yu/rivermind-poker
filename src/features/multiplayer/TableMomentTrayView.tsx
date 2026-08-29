import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import {
  TABLE_MOMENT_CATALOG,
  TABLE_MOMENT_REACTION_IDS,
  type TableMomentReactionId,
} from '../../domain/multiplayer/tableMoments';
import type { MessageKey } from '../../localization';
import { useLocalization } from '../../localization';
import { useAppTheme } from '../../theme';
import { TABLE_MOMENT_STICKER_BY_REACTION } from './tableMomentMedia';
import {
  createTableMomentOutboundQueue,
  enqueueTableMoment,
  nextTableMomentOutbound,
  settleTableMomentOutbound,
  type TableMomentOutboundQueue,
} from './tableMomentOutboundQueue';
import { tableMomentTrayLayout } from './tableMomentTrayLayout';

export type TableMomentSendOutcome =
  | { status: 'accepted' | 'error' }
  | { retryAfterMs: number; status: 'retry' };

export interface TableMomentTrayViewProps {
  compact: boolean;
  inline?: boolean;
  muted: boolean;
  onSendMoment: (reactionId: TableMomentReactionId, id: string) => Promise<TableMomentSendOutcome>;
  onToggleMuted: () => void;
}

/**
 * Twelve always-available reaction choices backed by a bounded serial queue.
 * Each tap gets a new idempotency key and immediate local feedback. A retry
 * pauses only the queue head; the catalog stays interactive and no cooldown is
 * exposed. Queue state is deliberately memory-only and dies with the table.
 */
export function TableMomentTrayView({
  compact,
  inline = false,
  muted,
  onSendMoment,
  onToggleMuted,
}: TableMomentTrayViewProps) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const { height, width } = useWindowDimensions();
  const layout = tableMomentTrayLayout(width, height);
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<TableMomentOutboundQueue>(() => createTableMomentOutboundQueue());
  const [status, setStatus] = useState<{ key: MessageKey; nonce: number } | null>(null);
  const queueRef = useRef(queue);
  const sendRef = useRef(onSendMoment);
  const pumpingRef = useRef(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusNonceRef = useRef(0);
  const pumpRef = useRef<() => Promise<void>>(async () => undefined);
  queueRef.current = queue;
  sendRef.current = onSendMoment;
  const styles = useMemo(
    () => createTrayStyles(palette.border, palette.primary, palette.surface, palette.text),
    [palette.border, palette.primary, palette.surface, palette.text],
  );
  const hint = t('multiplayer.moment.trayHint');

  const commitQueue = (next: TableMomentOutboundQueue): void => {
    queueRef.current = next;
    if (mountedRef.current) setQueue(next);
  };

  const schedulePump = (waitMs = 0): void => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void pumpRef.current(), Math.max(0, waitMs));
  };

  pumpRef.current = async (): Promise<void> => {
    if (pumpingRef.current || !mountedRef.current) return;
    const nowMs = Date.now();
    const next = nextTableMomentOutbound(queueRef.current, nowMs);
    if (!next.item) {
      if (next.waitMs > 0) schedulePump(next.waitMs);
      return;
    }
    pumpingRef.current = true;
    let outcome: TableMomentSendOutcome = { status: 'error' };
    try {
      outcome = await sendRef.current(next.item.reactionId, next.item.id);
    } finally {
      const settledAtMs = Date.now();
      commitQueue(settleTableMomentOutbound(queueRef.current, next.item.id, outcome, settledAtMs));
      pumpingRef.current = false;
      schedulePump(outcome.status === 'retry' ? outcome.retryAfterMs : 0);
    }
  };

  useEffect(() => () => {
    mountedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const send = (reactionId: TableMomentReactionId): void => {
    const queued = enqueueTableMoment(
      queueRef.current,
      { id: Crypto.randomUUID(), reactionId },
      Date.now(),
    );
    setStatus({
      key: queued.accepted ? 'multiplayer.moment.queued' : 'multiplayer.moment.busy',
      nonce: ++statusNonceRef.current,
    });
    if (!queued.accepted) return;
    commitQueue(queued.state);
    schedulePump();
  };

  if (!open) {
    return (
      <View style={[styles.anchor, inline ? styles.anchorInline : styles.anchorFloating, compact && !inline && styles.anchorCompact]}>
        <Pressable
          accessibilityLabel={hint}
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.launcher, pressed && styles.pressed]}
        >
          <Ionicons color={palette.primary} name="happy-outline" size={22} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.anchor, inline ? styles.anchorInline : styles.anchorFloating, compact && !inline && styles.anchorCompact]}>
      <View style={[
        styles.tray,
        inline && styles.trayInline,
        { borderColor: palette.border, width: layout.width },
      ]}>
        <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.hint}>{hint}</Text>
        <View style={styles.buttons}>
          {TABLE_MOMENT_REACTION_IDS.map((reactionId) => {
            const label = t(TABLE_MOMENT_CATALOG[reactionId].accessibilityKey as MessageKey);
            return (
              <Pressable
                accessibilityLabel={label}
                accessibilityRole="button"
                key={reactionId}
                onPress={() => send(reactionId)}
                style={({ pressed }) => [
                  styles.reaction,
                  { height: layout.buttonSize, width: layout.buttonSize },
                  pressed && styles.pressed,
                ]}
              >
                <Image
                  accessibilityIgnoresInvertColors
                  source={TABLE_MOMENT_STICKER_BY_REACTION[reactionId]}
                  style={[styles.sticker, { height: layout.stickerSize, width: layout.stickerSize }]}
                />
              </Pressable>
            );
          })}
        </View>
        <View style={styles.footer}>
          <Text
            accessibilityLabel={status ? t(status.key) : undefined}
            accessibilityLiveRegion="polite"
            key={status?.nonce ?? 0}
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
            style={styles.status}
          >
            {status ? t(status.key) : ' '}
          </Text>
          <Pressable
            accessibilityLabel={t(muted ? 'multiplayer.moment.trayUnmute' : 'multiplayer.moment.trayMute')}
            accessibilityRole="button"
            accessibilityState={{ checked: muted }}
            onPress={onToggleMuted}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Ionicons color={palette.muted} name={muted ? 'eye-off-outline' : 'eye-outline'} size={16} />
          </Pressable>
          <Pressable
            accessibilityLabel={hint}
            accessibilityRole="button"
            onPress={() => setOpen(false)}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Ionicons color={palette.muted} name="close" size={16} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function createTrayStyles(border: string, primary: string, background: string, text: string) {
  return StyleSheet.create({
    anchor: { alignItems: 'flex-end', zIndex: 30 },
    anchorFloating: { bottom: 8, position: 'absolute', right: 8 },
    anchorCompact: { bottom: 80 },
    anchorInline: { alignSelf: 'center', height: 44, justifyContent: 'center', position: 'relative', width: 44 },
    buttons: {
      alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 4,
      justifyContent: 'center', maxWidth: 224,
    },
    closeButton: { alignItems: 'center', borderRadius: 10, height: 20, justifyContent: 'center', marginLeft: 8, width: 20 },
    footer: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end', marginTop: 3 },
    hint: { color: primary, fontSize: 11, fontWeight: '700', marginBottom: 3 },
    launcher: {
      alignItems: 'center', backgroundColor: background, borderColor: border, borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth, height: 36, justifyContent: 'center', shadowColor: '#000',
      shadowOffset: { height: 1, width: 0 }, shadowOpacity: 0.18, shadowRadius: 3, width: 36,
    },
    pressed: { opacity: 0.55, transform: [{ scale: 0.94 }] },
    reaction: { alignItems: 'center', borderRadius: 15, height: 32, justifyContent: 'center', width: 32 },
    status: { color: text, flex: 1, fontSize: 10, fontWeight: '600', minHeight: 13 },
    sticker: { height: 27, width: 27 },
    tray: {
      backgroundColor: background, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
      maxWidth: 248, paddingHorizontal: 8, paddingVertical: 6, shadowColor: '#000',
      shadowOffset: { height: 2, width: 0 }, shadowOpacity: 0.2, shadowRadius: 5,
    },
    trayInline: { bottom: 48, position: 'absolute', right: 0 },
  });
}
