import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { TableMomentReactionId } from '../../domain/multiplayer/tableMoments';
import type { MessageKey } from '../../localization';
import { useLocalization } from '../../localization';
import { useAppTheme } from '../../theme';
import { TABLE_MOMENT_STICKER_BY_REACTION } from './tableMomentMedia';
import {
  createTableMomentTrayState,
  recordTableMomentAccepted,
  recordTableMomentCooldown,
  tableMomentTrayCanSend,
  tableMomentTrayCooldownRemainingMs,
  type TableMomentTrayState,
} from './tableMomentTray';

/**
 * The six-reaction tray for sending table moments.
 *
 * The server stays authoritative: this tray mirrors the cooldown and the
 * per-hand budget locally (pure module) so taps can be disabled instantly,
 * and only an accepted send advances the mirror. Refusals are silent — a
 * raced tap mirrors the cooldown without spending budget — and the owner
 * decides what, if anything, is surfaced for network/access errors. Every
 * control is a real accessibility element with a label, and stickers are
 * decorative (their meaning is carried by the phrase label).
 */

export type TableMomentSendOutcome = 'accepted' | 'error' | 'silent';

export interface TableMomentTrayViewProps {
  compact: boolean;
  /** Keep the launcher in the owning action rail; the expanded tray floats
   * above it instead of covering a primary poker control. */
  inline?: boolean;
  onSendMoment: (reactionId: TableMomentReactionId) => Promise<TableMomentSendOutcome>;
}

const TRAY_REACTION_ORDER: TableMomentReactionId[] = [
  'cheer',
  'surprised',
  'laugh',
  'niceHand',
  'thinking',
  'disappointed',
];

const reactionLabelKey: Record<TableMomentReactionId, MessageKey> = {
  cheer: 'multiplayer.moment.cheer',
  disappointed: 'multiplayer.moment.disappointed',
  laugh: 'multiplayer.moment.laugh',
  niceHand: 'multiplayer.moment.niceHand',
  surprised: 'multiplayer.moment.surprised',
  thinking: 'multiplayer.moment.thinking',
};

export function TableMomentTrayView({
  compact,
  inline = false,
  onSendMoment,
}: TableMomentTrayViewProps) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const [open, setOpen] = useState(false);
  const [tray, setTray] = useState<TableMomentTrayState>(() => createTableMomentTrayState());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const sendingRef = useRef(false);
  const styles = useMemo(
    () => createTrayStyles(palette.border, palette.primary, palette.surface, palette.text),
    [palette.border, palette.primary, palette.surface, palette.text],
  );
  const hint = t('multiplayer.moment.trayHint');

  // A second tick re-arms the tray when the mirrored cooldown expires.
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, []);

  const canSend = open && tableMomentTrayCanSend(tray, nowMs) && !sendingRef.current;

  const send = (reactionId: TableMomentReactionId): void => {
    if (!canSend || sendingRef.current) return;
    sendingRef.current = true;
    setNowMs(Date.now());
    void onSendMoment(reactionId).then((outcome) => {
      const now = Date.now();
      if (outcome === 'accepted') {
        setTray((current) => recordTableMomentAccepted(current, now));
      } else if (outcome === 'silent') {
        // A silent refusal mirrors the server cooldown without spending the
        // budget; an error outcome leaves the mirror untouched so the user
        // can retry after the owner surfaced the problem.
        setTray((current) => recordTableMomentCooldown(current, now));
      }
      sendingRef.current = false;
    }).catch(() => {
      // An unexpected rejection must never leave the tray permanently
      // disabled; the send path itself resolves every outcome, so this is
      // purely defensive.
      sendingRef.current = false;
    });
  };

  const cooldownMs = tableMomentTrayCooldownRemainingMs(tray, nowMs);

  if (!open) {
    return (
      <View style={[
        styles.anchor,
        inline ? styles.anchorInline : styles.anchorFloating,
        compact && !inline && styles.anchorCompact,
      ]}>
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
    <View style={[
      styles.anchor,
      inline ? styles.anchorInline : styles.anchorFloating,
      compact && !inline && styles.anchorCompact,
    ]}>
      <View style={[styles.tray, inline && styles.trayInline, { borderColor: palette.border }]}>
        <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.hint}>
          {hint}
        </Text>
        <View style={styles.buttons}>
          {TRAY_REACTION_ORDER.map((reactionId) => {
            const label = t(reactionLabelKey[reactionId]);
            return (
              <Pressable
                accessibilityLabel={label}
                accessibilityRole="button"
                disabled={!canSend}
                key={reactionId}
                onPress={() => send(reactionId)}
                style={({ pressed }) => [
                  styles.reaction,
                  !canSend && styles.reactionDisabled,
                  pressed && canSend && styles.pressed,
                ]}
              >
                <Image
                  accessibilityIgnoresInvertColors
                  source={TABLE_MOMENT_STICKER_BY_REACTION[reactionId]}
                  style={styles.sticker}
                />
              </Pressable>
            );
          })}
        </View>
        <View style={styles.footer}>
          {cooldownMs > 0 ? (
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.budget}>
              {Math.ceil(cooldownMs / 1000)}s
            </Text>
          ) : null}
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
    anchor: {
      alignItems: 'flex-end',
      zIndex: 30,
    },
    anchorFloating: {
      bottom: 8,
      position: 'absolute',
      right: 8,
    },
    anchorCompact: {
      bottom: 80,
    },
    anchorInline: {
      alignSelf: 'center',
      height: 44,
      justifyContent: 'center',
      position: 'relative',
      width: 44,
    },
    budget: {
      color: text,
      fontSize: 11,
      fontWeight: '600',
    },
    buttons: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 5,
    },
    closeButton: {
      alignItems: 'center',
      borderRadius: 10,
      height: 20,
      justifyContent: 'center',
      marginLeft: 8,
      width: 20,
    },
    footer: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      marginTop: 5,
    },
    hint: {
      color: primary,
      fontSize: 11,
      fontWeight: '700',
      marginBottom: 4,
    },
    launcher: {
      alignItems: 'center',
      backgroundColor: background,
      borderColor: border,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      height: 36,
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { height: 1, width: 0 },
      shadowOpacity: 0.18,
      shadowRadius: 3,
      width: 36,
    },
    pressed: {
      opacity: 0.6,
    },
    reaction: {
      alignItems: 'center',
      borderRadius: 16,
      height: 32,
      justifyContent: 'center',
      width: 32,
    },
    reactionDisabled: {
      opacity: 0.35,
    },
    sticker: {
      height: 28,
      width: 28,
    },
    tray: {
      backgroundColor: background,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 10,
      paddingVertical: 7,
      shadowColor: '#000',
      shadowOffset: { height: 2, width: 0 },
      shadowOpacity: 0.2,
      shadowRadius: 5,
    },
    trayInline: {
      bottom: 50,
      position: 'absolute',
      right: 0,
      width: 314,
    },
  });
}
