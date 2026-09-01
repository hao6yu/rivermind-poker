import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import {
  TABLE_MOMENT_CATALOG,
  TABLE_MOMENT_VISIBLE_REACTION_IDS,
  type TableMomentReactionId,
} from '../../domain/multiplayer/tableMoments';
import type { MessageKey } from '../../localization';
import { useLocalization } from '../../localization';
import { useAppTheme } from '../../theme';
import {
  createTableMomentOutboundQueue,
  enqueueTableMoment,
  nextTableMomentOutbound,
  settleTableMomentOutbound,
  type TableMomentOutboundQueue,
} from './tableMomentOutboundQueue';
import type { TableMomentSendOutcome } from './tableMomentSendOutcome';
import { tableMomentMenuLayout } from './tableMomentTrayLayout';

export interface TableMomentTrayViewProps {
  compact: boolean;
  inline?: boolean;
  onSendMoment: (reactionId: TableMomentReactionId, id: string) => Promise<TableMomentSendOutcome>;
  queueScope: string;
}

/**
 * The eight-phrase text reaction menu (scope 3.11E). One 44-point launcher
 * toggles an anchored menu of the approved localized phrases — no stickers,
 * no eye control, no close button. Selecting a phrase queues it immediately
 * and closes the menu immediately after a successful queue insertion; tapping
 * outside still closes it without sending. The
 * bounded serial queue, slow non-overlapping moment lanes, and silent
 * no-cooldown behavior are unchanged, and queued/busy/failed states are
 * announced through a live region instead of a permanent footer row.
 */
export function TableMomentTrayView({
  compact,
  inline = false,
  onSendMoment,
  queueScope,
}: TableMomentTrayViewProps) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const { height, width } = useWindowDimensions();
  const menuLayout = tableMomentMenuLayout(width, height);
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<TableMomentOutboundQueue>(() => createTableMomentOutboundQueue());
  const [status, setStatus] = useState<{ key: MessageKey; nonce: number } | null>(null);
  const queueRef = useRef(queue);
  const sendRef = useRef(onSendMoment);
  const scopeRef = useRef(queueScope);
  const pumpingRef = useRef(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusNonceRef = useRef(0);
  const pumpRef = useRef<() => Promise<void>>(async () => undefined);
  queueRef.current = queue;
  sendRef.current = onSendMoment;
  scopeRef.current = queueScope;
  const styles = useMemo(
    () => createTrayStyles(palette.border, palette.primary, palette.surface, palette.soft, palette.text),
    [palette.border, palette.primary, palette.surface, palette.soft, palette.text],
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
    if (next.item.scope !== scopeRef.current) {
      commitQueue(settleTableMomentOutbound(queueRef.current, next.item.id, { status: 'discarded' }, nowMs));
      schedulePump();
      return;
    }
    pumpingRef.current = true;
    let outcome: TableMomentSendOutcome = { status: 'error' };
    try {
      outcome = await sendRef.current(next.item.reactionId, next.item.id);
    } finally {
      const settledAtMs = Date.now();
      commitQueue(settleTableMomentOutbound(queueRef.current, next.item.id, outcome, settledAtMs));
      if (outcome.status === 'error' && mountedRef.current) {
        setStatus({ key: 'multiplayer.moment.notSent', nonce: ++statusNonceRef.current });
      }
      pumpingRef.current = false;
      schedulePump(outcome.status === 'retry' ? outcome.retryAfterMs : 0);
    }
  };

  useEffect(() => () => {
    mountedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    commitQueue(createTableMomentOutboundQueue());
    setStatus(null);
  }, [queueScope]);

  const send = (reactionId: TableMomentReactionId): void => {
    const queued = enqueueTableMoment(
      queueRef.current,
      { id: Crypto.randomUUID(), reactionId, scope: queueScope },
      Date.now(),
    );
    setStatus({
      key: queued.accepted ? 'multiplayer.moment.queued' : 'multiplayer.moment.busy',
      nonce: ++statusNonceRef.current,
    });
    if (!queued.accepted) return;
    commitQueue(queued.state);
    // The queue owns delivery after this point, so the menu can get out of the
    // player's way immediately without cancelling or delaying the reaction.
    setOpen(false);
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
        {status ? (
          <Text
            accessibilityLabel={t(status.key)}
            accessibilityLiveRegion="polite"
            key={status.nonce}
            style={styles.srOnly}
          >
            {t(status.key)}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.anchor, inline ? styles.anchorInline : styles.anchorFloating, compact && !inline && styles.anchorCompact]}>
      {/* Tapping anywhere outside the menu closes it; the backdrop is the
        single dismiss target while the menu is open. */}
      <Pressable
        accessibilityLabel={hint}
        accessibilityRole="button"
        onPress={() => setOpen(false)}
        style={styles.backdrop}
      />
      <View style={[styles.tray, inline && styles.trayInline, { borderColor: palette.border, width: menuLayout.width }]}>
        <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.hint}>{hint}</Text>
        <View style={styles.menu}>
          {TABLE_MOMENT_VISIBLE_REACTION_IDS.map((reactionId) => (
            <Pressable
              accessibilityLabel={t(TABLE_MOMENT_CATALOG[reactionId].accessibilityKey as MessageKey)}
              accessibilityRole="button"
              key={reactionId}
              onPress={() => send(reactionId)}
              style={({ pressed }) => [
                styles.row,
                menuLayout.columns === 2 && styles.rowHalf,
                { minHeight: menuLayout.rowHeight },
                pressed && styles.pressed,
              ]}
            >
              <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.rowText}>
                {t(TABLE_MOMENT_CATALOG[reactionId].phraseKey as MessageKey)}
              </Text>
            </Pressable>
          ))}
        </View>
        {status ? (
          <Text
            accessibilityLabel={t(status.key)}
            accessibilityLiveRegion="polite"
            key={status.nonce}
            style={styles.srOnly}
          >
            {t(status.key)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function createTrayStyles(border: string, primary: string, background: string, soft: string, text: string) {
  return StyleSheet.create({
    anchor: { alignItems: 'flex-end', zIndex: 30 },
    anchorFloating: { bottom: 8, position: 'absolute', right: 8 },
    anchorCompact: { bottom: 80 },
    anchorInline: { alignSelf: 'center', height: 44, justifyContent: 'center', position: 'relative', width: 44 },
    backdrop: {
      // Reaches beyond the anchor so any outside tap dismisses the menu.
      bottom: -4000,
      left: -4000,
      position: 'absolute',
      right: -4000,
      top: -4000,
    },
    hint: { color: primary, fontSize: 11, fontWeight: '700', marginBottom: 3 },
    launcher: {
      alignItems: 'center', backgroundColor: background, borderColor: border, borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth, height: 44, justifyContent: 'center', shadowColor: '#000',
      shadowOffset: { height: 1, width: 0 }, shadowOpacity: 0.18, shadowRadius: 3, width: 44,
    },
    menu: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
    pressed: { opacity: 0.55, transform: [{ scale: 0.97 }] },
    row: {
      alignItems: 'center', backgroundColor: soft, borderRadius: 12, justifyContent: 'center',
      paddingHorizontal: 10, width: '100%',
    },
    rowHalf: { width: '48.5%' },
    rowText: { color: text, fontSize: 13, fontWeight: '700' },
    // Invisible to sight, not to screen readers: the live region keeps an
    // explicit themed foreground to satisfy the no-default-foreground guard.
    srOnly: { color: text, height: 1, opacity: 0, position: 'absolute', width: 1 },
    tray: {
      backgroundColor: background, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
      maxWidth: 264, paddingHorizontal: 8, paddingVertical: 8, shadowColor: '#000',
      shadowOffset: { height: 2, width: 0 }, shadowOpacity: 0.2, shadowRadius: 5,
    },
    trayInline: { bottom: 52, position: 'absolute', right: 0 },
  });
}
