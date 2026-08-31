import { useMemo, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import type { MultiplayerViewerProjection } from '../../domain/multiplayer/contracts';
import { multiplayerStalledBetweenHands } from './multiplayerLifecycleUi';

/**
 * Own the host control OUTSIDE the result/between-hands early-return branches.
 * Whichever content those branches choose, they cannot hide the host escape.
 */
export function MultiplayerActionPanel({ room, busy, presentationReady, actionPending, children, onEndStalledSession }: {
  room: Pick<MultiplayerViewerProjection, 'status' | 'nextHandAtMs' | 'seats' | 'hostPlayerId' | 'viewerPlayerId'>;
  busy: boolean;
  presentationReady: boolean;
  actionPending: boolean;
  children: ReactNode;
  onEndStalledSession: () => void;
}) {
  const viewer = room.seats.find((seat) => seat.playerId === room.viewerPlayerId);
  const eligible = presentationReady && !actionPending
    && multiplayerStalledBetweenHands(room.status, room.nextHandAtMs, room.seats)
    && room.hostPlayerId === room.viewerPlayerId
    && viewer?.kind === 'human' && viewer.control === 'human'
    && viewer.connection === 'online' && viewer.participation !== 'left';
  return <>{children}{eligible ? <MultiplayerHostEndControl busy={busy} onEndStalledSession={onEndStalledSession} /> : null}</>;
}

/**
 * Q5 (Slice 3.11 follow-up): the host-only end-of-stalled-session control,
 * extracted so EVERY settled rendering path — the settled-hand result panel
 * and the plain between-hands panel — composes the exact same button and
 * localized confirmation. The original defect was structural: the result
 * panel branch returned before the between-hands controls could render, so
 * a host staring at a busted "Sit out" result never saw the end action even
 * though the projection said the session was stalled. Branch-local copies
 * of that affordance can drift or be bypassed again; one shared component
 * cannot be reachable in one branch and hidden in the other.
 *
 * The surrounding MultiplayerActionPanel owns eligibility independently of
 * which branch supplied its content. The server still authorizes the command.
 */
export function MultiplayerHostEndControl({
  busy,
  onEndStalledSession,
}: {
  busy: boolean;
  onEndStalledSession: () => void;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.hostEndBar}>
      <Pressable
        accessibilityLabel={t('multiplayer.game.hostEndSession')}
        accessibilityRole="button"
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={() => {
          // The confirmation is part of the control, not the caller: no
          // settled path can end a session without it, and the destructive
          // intent lives here rather than in an always-red button.
          Alert.alert(
            t('multiplayer.game.hostEndTitle'),
            t('multiplayer.game.hostEndDetail'),
            [
              { style: 'cancel', text: t('multiplayer.game.stay') },
              { onPress: onEndStalledSession, style: 'destructive', text: t('multiplayer.game.hostEndSession') },
            ],
          );
        }}
        style={({ pressed }) => [styles.hostEndButton, busy && styles.disabled, pressed && !busy && styles.pressed]}
      >
        {busy ? <ActivityIndicator color={palette.primaryText} size="small" /> : (
          <>
            <Text maxFontSizeMultiplier={1.2} style={styles.hostEndButtonText}>{t('multiplayer.game.hostEndSession')}</Text>
            <Ionicons color={palette.primaryText} name="arrow-forward" size={18} />
          </>
        )}
      </Pressable>
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    // Tokens match the modal's BottomAction strip so the control reads as
    // the same family in both branches and in both palettes.
    hostEndBar: { flexShrink: 0, gap: 7, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.background },
    hostEndButton: { width: '100%', maxWidth: 700, minHeight: 50, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18, borderRadius: 14, backgroundColor: palette.primary, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 2 },
    hostEndButtonText: { color: palette.primaryText, fontSize: 14, fontWeight: '800' },
    pressed: { opacity: 0.74, transform: [{ scale: 0.99 }] },
    disabled: { opacity: 0.42 },
  });
}
