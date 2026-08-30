import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  TABLE_MOMENT_CATALOG,
  type TableMomentEnvelope,
} from '../../domain/multiplayer/tableMoments';
import { type MessageKey, useLocalization } from '../../localization';
import { useAppTheme } from '../../theme';
import { TABLE_MOMENT_STICKER_BY_REACTION } from './tableMomentMedia';
import {
  advanceTableMomentLanes,
  createTableMomentLaneState,
  nextTableMomentLaneExpiryMs,
  offerTableMoment,
  tableMomentTravelDurationMs,
  visibleTableMomentLanes,
  type TableMomentLane,
  type TableMomentLaneState,
} from './tableMomentLanes';
import type { TableMomentPreferences } from './tableMomentPreferences';
import { tableMomentMotionEnabled, tableMomentVisible } from './tableMomentPreferences';

export interface TableMomentLanesViewProps {
  incoming: TableMomentEnvelope[];
  playerNames: Readonly<Record<string, string>>;
  preferences: TableMomentPreferences;
  reducedMotion: boolean;
}

/** Stable three-track 弹幕. Entries retain their track and one native-driven
 * linear animation for their entire 6–9 second crossing. */
export function TableMomentLanesView({
  incoming,
  playerNames,
  preferences,
  reducedMotion,
}: TableMomentLanesViewProps) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const { width } = useWindowDimensions();
  const [state, setState] = useState<TableMomentLaneState>(() => createTableMomentLaneState());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const offeredIds = useRef(new Set<string>());
  const offeredOrder = useRef<string[]>([]);
  const announcedIds = useRef(new Set<string>());
  const announcementTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const motion = tableMomentMotionEnabled(preferences, reducedMotion);
  const totalTravelDistance = Math.max(720, width + 360);
  const durationMs = tableMomentTravelDurationMs(totalTravelDistance);

  useEffect(() => {
    const expiry = nextTableMomentLaneExpiryMs(state);
    if (expiry === null) return undefined;
    const timer = setTimeout(() => {
      const tick = Date.now();
      setNowMs(tick);
      setState((current) => advanceTableMomentLanes(current, tick));
    }, Math.max(0, expiry - Date.now()));
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    const fresh = incoming.filter((moment) => !offeredIds.current.has(moment.id));
    fresh.forEach((moment) => {
      offeredIds.current.add(moment.id);
      offeredOrder.current.push(moment.id);
    });
    while (offeredOrder.current.length > 96) {
      const oldest = offeredOrder.current.shift();
      if (oldest) offeredIds.current.delete(oldest);
    }
    const visible = fresh.filter((moment) => tableMomentVisible(preferences, moment));
    if (visible.length === 0) return;
    const tick = Date.now();
    setNowMs(tick);
    setState((current) => visible.reduce(
      (next, moment) => offerTableMoment(next, moment, tick, durationMs),
      current,
    ));
  }, [durationMs, incoming, preferences]);

  const lanes = useMemo(
    () => visibleTableMomentLanes(state, nowMs)
      .filter((lane) => tableMomentVisible(preferences, lane.moment)),
    [nowMs, preferences, state],
  );

  useEffect(() => {
    const order = new Map(state.recentIds.map((entry, index) => [entry.id, index]));
    const newLanes = lanes
      .filter((lane) => !announcedIds.current.has(lane.moment.id))
      .sort((left, right) => (order.get(left.moment.id) ?? 0) - (order.get(right.moment.id) ?? 0));
    newLanes.forEach((lane, index) => {
      announcedIds.current.add(lane.moment.id);
      while (announcedIds.current.size > 48) {
        const oldest = announcedIds.current.values().next().value as string | undefined;
        if (!oldest) break;
        announcedIds.current.delete(oldest);
      }
      const playerName = playerNames[lane.moment.playerId] ?? `#${lane.moment.seat + 1}`;
      const phrase = t(TABLE_MOMENT_CATALOG[lane.moment.reactionId].phraseKey as MessageKey);
      announcementTimers.current.push(setTimeout(() => {
        AccessibilityInfo.announceForAccessibility(`${playerName}: ${phrase}`);
      }, index * 350));
      while (announcementTimers.current.length > 48) {
        const oldest = announcementTimers.current.shift();
        if (oldest) clearTimeout(oldest);
      }
    });
  }, [lanes, playerNames, state.recentIds, t]);

  useEffect(() => () => {
    announcementTimers.current.forEach((timer) => clearTimeout(timer));
  }, []);

  if (lanes.length === 0) return null;

  const styles = createLaneStyles(palette.border, palette.primary, palette.surface, palette.text);
  const trackTop = ['12%', '43%', '72%'] as const;

  return (
    <View pointerEvents="none" style={styles.lanes}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
        {lanes.map((lane) => {
          const playerName = playerNames[lane.moment.playerId] ?? `#${lane.moment.seat + 1}`;
          const phrase = t(TABLE_MOMENT_CATALOG[lane.moment.reactionId].phraseKey as MessageKey);
          return (
            <View key={lane.moment.id} style={[styles.visualTrack, { top: trackTop[lane.lane] }]}>
              <LaneEntry
                lane={lane}
                motion={motion}
                phrase={phrase}
                playerName={playerName}
                styles={styles}
                travelExtent={totalTravelDistance / 2}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

function LaneEntry({
  lane,
  motion,
  phrase,
  playerName,
  styles,
  travelExtent,
}: {
  lane: TableMomentLane;
  motion: boolean;
  phrase: string;
  playerName: string;
  styles: ReturnType<typeof createLaneStyles>;
  travelExtent: number;
}) {
  const progress = useRef(new Animated.Value(motion ? 0 : 0.5)).current;
  useEffect(() => {
    if (!motion) {
      progress.setValue(0.5);
      return undefined;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      duration: lane.durationMs,
      easing: Easing.linear,
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [lane.durationMs, motion, progress]);
  const translateX = motion
    ? progress.interpolate({ inputRange: [0, 1], outputRange: [travelExtent, -travelExtent] })
    : 0;
  return (
    <Animated.View style={[styles.laneEntry, { transform: [{ translateX }] }]}>
      <Image
        accessibilityIgnoresInvertColors
        source={TABLE_MOMENT_STICKER_BY_REACTION[lane.moment.reactionId]}
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
      alignItems: 'center', alignSelf: 'center', backgroundColor: background, borderColor: border,
      borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', maxWidth: '82%',
      paddingHorizontal: 10, paddingVertical: 4,
    },
    lanes: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', zIndex: 20 },
    phrase: { color: text, fontSize: 13, fontWeight: '600' },
    playerName: { color: accent, fontWeight: '800' },
    sticker: { height: 24, marginRight: 7, width: 24 },
    visualTrack: { alignItems: 'center', left: 0, position: 'absolute', right: 0 },
  });
}
