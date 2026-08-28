import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { TableMomentEnvelope } from '../../domain/multiplayer/tableMoments';
import type { TableMomentReactionId } from '../../domain/multiplayer/tableMoments';
import { useAppTheme } from '../../theme';
import { type MessageKey, useLocalization } from '../../localization';
import { TABLE_MOMENT_STICKER_BY_REACTION } from './tableMomentMedia';
import {
  advanceTableMomentLanes,
  assignTableMomentVisualTracks,
  createTableMomentLaneState,
  offerTableMoment,
  TABLE_MOMENT_PRESENTATION_MS,
  type TableMomentLaneState,
} from './tableMomentLanes';
import type { TableMomentPreferences } from './tableMomentPreferences';
import { tableMomentMotionEnabled } from './tableMomentPreferences';

/**
 * The two bounded bullet-screen lanes that present table moments on the felt.
 *
 * The component owns only scheduling: a quarter-second tick advances the pure
 * lane state and offers incoming envelopes; the pure module decides what is
 * visible when, who gets promoted, and what is dropped. Each moment fires
 * `onPresented` exactly once — when it first becomes visible — so the owner
 * can gate sound and haptics through the shared preference helpers. With the
 * OS Reduced Motion flag on, or the motion preference off, moments render
 * statically without animation. The overlay is pointer-transparent and never
 * removes poker information: it draws over the felt for at most three
 * seconds, then disappears. Animated entries make one uninterrupted pass
 * across the felt; the animation is intentionally not restarted by the lane
 * scheduler's quarter-second expiry tick.
 */

const LANE_TICK_MS = 250;

const phraseKeyByReaction: Record<TableMomentReactionId, MessageKey> = {
  cheer: 'multiplayer.moment.cheer',
  disappointed: 'multiplayer.moment.disappointed',
  laugh: 'multiplayer.moment.laugh',
  niceHand: 'multiplayer.moment.niceHand',
  surprised: 'multiplayer.moment.surprised',
  thinking: 'multiplayer.moment.thinking',
};

export interface TableMomentLanesViewProps {
  incoming: TableMomentEnvelope[];
  onPresented?: (moment: TableMomentEnvelope) => void;
  playerNames: Readonly<Record<string, string>>;
  preferences: TableMomentPreferences;
  reducedMotion: boolean;
}

export function TableMomentLanesView({
  incoming,
  onPresented,
  playerNames,
  preferences,
  reducedMotion,
}: TableMomentLanesViewProps) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const { width } = useWindowDimensions();
  const motion = tableMomentMotionEnabled(preferences, reducedMotion);
  const [state, setState] = useState<TableMomentLaneState>(() => createTableMomentLaneState());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const presentedIds = useRef(new Set<string>());
  const offeredIds = useRef(new Set<string>());
  const pendingCue = useRef<TableMomentEnvelope[]>([]);

  // The quarter-second tick advances expiry and FIFO promotion.
  useEffect(() => {
    const interval = setInterval(() => {
      const tick = Date.now();
      setNowMs(tick);
      setState((current) => advanceTableMomentLanes(current, tick));
    }, LANE_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  // Offer envelopes as they arrive; replays are deduplicated by the pure
  // recent-id window, and overflow beyond lanes + pending capacity is
  // decided by the pure module (newest dropped first), never here.
  useEffect(() => {
    const fresh = incoming.filter((moment) => !offeredIds.current.has(moment.id));
    for (const moment of fresh) offeredIds.current.add(moment.id);
    if (fresh.length === 0) return;
    const tick = Date.now();
    for (const moment of fresh) {
      setState((current) => offerTableMoment(current, moment, tick));
    }
  }, [incoming]);

  // Fire the one-shot present cue (sound/haptics) when a moment becomes
  // visible; deferred by one frame so the owner observes it after the state
  // that made it visible.
  useEffect(() => {
    for (const lane of state.lanes) {
      if (!lane || lane.visibleUntilMs <= nowMs) continue;
      if (presentedIds.current.has(lane.moment.id)) continue;
      presentedIds.current.add(lane.moment.id);
      pendingCue.current.push(lane.moment);
    }
    if (pendingCue.current.length === 0) return;
    const cues = pendingCue.current;
    pendingCue.current = [];
    const frame = requestAnimationFrame(() => {
      for (const cue of cues) onPresented?.(cue);
    });
    return () => cancelAnimationFrame(frame);
  }, [nowMs, onPresented, state]);

  const lanes = useMemo(
    () => state.lanes.filter(
      (lane): lane is NonNullable<typeof lane> => lane !== null && lane.visibleUntilMs > nowMs,
    ),
    [nowMs, state],
  );

  if (lanes.length === 0) return null;

  const styles = createLaneStyles(palette.border, palette.primary, palette.surface, palette.text);
  const visualTracks = assignTableMomentVisualTracks(lanes.map((lane) => lane.moment.id));
  const trackTop = ['12%', '43%', '72%'] as const;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.lanes}
    >
      {lanes.map((lane, index) => (
        <View
          key={lane.moment.id}
          style={[styles.visualTrack, { top: trackTop[visualTracks[index] ?? 0] }]}
        >
          <LaneEntry
            motion={motion}
            moment={lane.moment}
            lane={lane.lane}
            playerName={playerNames[lane.moment.playerId] ?? `#${lane.moment.seat + 1}`}
            remainingMs={lane.visibleUntilMs - nowMs}
            phrase={t(phraseKeyByReaction[lane.moment.reactionId])}
            styles={styles}
            travelDistance={Math.max(240, width * 0.82)}
          />
        </View>
      ))}
    </View>
  );
}

function LaneEntry({
  lane,
  motion,
  moment,
  playerName,
  phrase,
  remainingMs,
  styles,
  travelDistance,
}: {
  lane: number;
  motion: boolean;
  moment: TableMomentEnvelope;
  playerName: string;
  phrase: string;
  remainingMs: number;
  styles: ReturnType<typeof createLaneStyles>;
  travelDistance: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  // Capture the first visible duration. `remainingMs` changes every scheduler
  // tick; depending on it directly restarts the animation and looks like a
  // flash instead of a continuous bullet-screen pass.
  const durationMs = useRef(
    Math.max(0, Math.min(remainingMs, TABLE_MOMENT_PRESENTATION_MS)),
  ).current;
  useEffect(() => {
    if (!motion) {
      progress.setValue(0.5);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      duration: durationMs,
      easing: Easing.linear,
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [durationMs, motion, progress]);
  const fromX = lane === 0 ? travelDistance : -travelDistance;
  const toX = -fromX;
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [fromX, toX],
  });
  return (
    <Animated.View style={[styles.laneEntry, { transform: [{ translateX }] }]}>
      <Image
        accessibilityIgnoresInvertColors
        source={TABLE_MOMENT_STICKER_BY_REACTION[moment.reactionId]}
        style={styles.sticker}
      />
      <Text maxFontSizeMultiplier={1.4} numberOfLines={1} style={styles.phrase}>
        <Text style={styles.playerName}>{playerName}</Text>
        {`: “${phrase}”`}
      </Text>
    </Animated.View>
  );
}

function createLaneStyles(border: string, accent: string, background: string, text: string) {
  return StyleSheet.create({
    laneEntry: {
      alignItems: 'center',
      alignSelf: 'center',
      backgroundColor: background,
      borderColor: border,
      borderRadius: 15,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      maxWidth: '82%',
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    lanes: {
      ...StyleSheet.absoluteFillObject,
      overflow: 'hidden',
      zIndex: 20,
    },
    phrase: {
      color: text,
      fontSize: 13,
      fontWeight: '600',
    },
    playerName: {
      color: accent,
      fontWeight: '800',
    },
    sticker: {
      height: 24,
      marginRight: 7,
      width: 24,
    },
    visualTrack: {
      alignItems: 'center',
      left: 0,
      position: 'absolute',
      right: 0,
    },
  });
}

export type { TableMomentReactionId };
