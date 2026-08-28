import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';

import type { TableMomentEnvelope } from '../../domain/multiplayer/tableMoments';
import type { TableMomentReactionId } from '../../domain/multiplayer/tableMoments';
import { useAppTheme } from '../../theme';
import { type MessageKey, useLocalization } from '../../localization';
import { TABLE_MOMENT_STICKER_BY_REACTION } from './tableMomentMedia';
import {
  advanceTableMomentLanes,
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
 * seconds, then disappears.
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
  preferences: TableMomentPreferences;
  reducedMotion: boolean;
}

export function TableMomentLanesView({
  incoming,
  onPresented,
  preferences,
  reducedMotion,
}: TableMomentLanesViewProps) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
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

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.lanes}
    >
      {lanes.map((lane) => (
        <LaneEntry
          key={lane.moment.id}
          motion={motion}
          moment={lane.moment}
          remainingMs={lane.visibleUntilMs - nowMs}
          phrase={t(phraseKeyByReaction[lane.moment.reactionId])}
          styles={styles}
        />
      ))}
    </View>
  );
}

function LaneEntry({
  motion,
  moment,
  phrase,
  remainingMs,
  styles,
}: {
  motion: boolean;
  moment: TableMomentEnvelope;
  phrase: string;
  remainingMs: number;
  styles: ReturnType<typeof createLaneStyles>;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!motion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      duration: Math.max(0, Math.min(remainingMs, TABLE_MOMENT_PRESENTATION_MS)),
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [motion, progress, remainingMs]);
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.85, 1],
    outputRange: [0, 1, 0.92],
  });
  return (
    <Animated.View style={[styles.laneEntry, { opacity, transform: [{ translateX }] }]}>
      <Image
        accessibilityIgnoresInvertColors
        source={TABLE_MOMENT_STICKER_BY_REACTION[moment.reactionId]}
        style={styles.sticker}
      />
      <Text maxFontSizeMultiplier={1.4} numberOfLines={1} style={styles.phrase}>
        {phrase}
      </Text>
      <View style={styles.laneDot} />
    </Animated.View>
  );
}

function createLaneStyles(border: string, accent: string, background: string, text: string) {
  return StyleSheet.create({
    laneDot: {
      backgroundColor: accent,
      borderRadius: 3,
      height: 6,
      marginLeft: 6,
      width: 6,
    },
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
      alignItems: 'center',
      alignSelf: 'center',
      gap: 5,
      left: 0,
      position: 'absolute',
      right: 0,
      top: 6,
      zIndex: 20,
    },
    phrase: {
      color: text,
      fontSize: 13,
      fontWeight: '700',
    },
    sticker: {
      height: 24,
      marginRight: 7,
      width: 24,
    },
  });
}

export type { TableMomentReactionId };
