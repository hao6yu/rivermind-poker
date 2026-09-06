import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import {
  CHAMPIONSHIP_EVENTS, championshipEventIsUnlocked, championshipEventProgress,
  championshipInvitationIsUnlocked, type ChampionshipEventId, type ChampionshipProgress,
} from '../../domain/poker/championship';
import { useLocalization } from '../../localization';
import { championshipEventText } from '../../localization/championship';
import { CHAMPIONSHIP_MAP_STOPS, CHAMPIONSHIP_SECRET_SPOT, championshipMapLayout } from './championshipMapModel';
import { championshipMapArtwork } from './championshipMapArtwork';
import { championshipPalette as palette } from '../../themePalette';

export type ChampionshipMapSelection = ChampionshipEventId | 'private_room';

export function ChampionshipMap({ progress, currentId, selected, onSelect }: {
  progress: ChampionshipProgress;
  currentId: ChampionshipEventId;
  selected: ChampionshipMapSelection;
  onSelect: (selection: ChampionshipMapSelection) => void;
}) {
  const { t } = useLocalization();
  const scroll = useRef<ScrollView>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const mapHeight = championshipMapLayout(frame.width, frame.height).mapHeight;
  const roomUnlocked = championshipInvitationIsUnlocked(progress);
  const roomSelected = selected === 'private_room' || !CHAMPIONSHIP_MAP_STOPS.some((stop) => stop.id === selected);
  const focusId = roomSelected
    ? 'championship_final' : selected;

  useEffect(() => {
    if (!frame.width || !frame.height) return;
    const stop = CHAMPIONSHIP_MAP_STOPS.find((item) => item.id === focusId)!;
    scroll.current?.scrollTo({ y: Math.max(0, stop.y * mapHeight - frame.height * 0.5), animated: false });
  }, [focusId, frame, mapHeight]);

  return (
    <View style={styles.frame} testID="championship.map" onLayout={({ nativeEvent: { layout } }) => {
      setFrame((previous) => previous.width === layout.width && previous.height === layout.height
        ? previous : { width: layout.width, height: layout.height });
    }}>
      <ScrollView ref={scroll} style={styles.scroll} showsVerticalScrollIndicator contentContainerStyle={{ minHeight: mapHeight, paddingBottom: 64 }}>
        <View style={{ height: mapHeight, width: '100%' }}>
          <Image accessible={false} source={championshipMapArtwork} resizeMode="stretch" style={[StyleSheet.absoluteFill, { width: frame.width, height: mapHeight }]} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shade]} />
          <Svg accessible={false} pointerEvents="none" width={frame.width || 1} height={mapHeight} viewBox={`0 0 ${frame.width || 1} ${mapHeight}`} style={{ position: 'absolute', top: 0, left: 0 }}>
            {CHAMPIONSHIP_MAP_STOPS.slice(1).map((stop, index) => {
              const previous = CHAMPIONSHIP_MAP_STOPS[index]!;
              const x1 = previous.x * frame.width; const y1 = previous.y * mapHeight;
              const x2 = stop.x * frame.width; const y2 = stop.y * mapHeight;
              const d = `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;
              const unlocked = championshipEventIsUnlocked(progress, stop.id);
              return <Path key={stop.id} d={d} stroke={unlocked ? palette.aqua : palette.route} strokeWidth={unlocked ? 5 : 3} strokeDasharray={unlocked ? undefined : '5 7'} fill="none" opacity={unlocked ? 0.95 : 0.8} />;
            })}
            <Path d={`M ${frame.width * CHAMPIONSHIP_MAP_STOPS[9].x} ${mapHeight * CHAMPIONSHIP_MAP_STOPS[9].y} Q ${frame.width * 0.73} ${mapHeight * 0.25}, ${frame.width * CHAMPIONSHIP_SECRET_SPOT.x} ${mapHeight * CHAMPIONSHIP_SECRET_SPOT.y}`} stroke={roomUnlocked ? palette.primary : palette.muted} strokeWidth={3} strokeDasharray="4 7" fill="none" />
          </Svg>
          {CHAMPIONSHIP_MAP_STOPS.map((stop, index) => {
            const event = CHAMPIONSHIP_EVENTS[index]!;
            const qualified = Boolean(championshipEventProgress(progress, event.id)?.qualifiedAt);
            const unlocked = championshipEventIsUnlocked(progress, event.id);
            const active = selected === event.id;
            const current = currentId === event.id;
            return (
              <Pressable key={stop.id} testID={`championship.event.${stop.id}`}
                accessibilityRole="button" accessibilityState={{ selected: active }}
                accessibilityLabel={`${t('championship.map.stop', { number: index + 1 })}. ${championshipEventText(event, 'title', t)}. ${t(qualified ? 'championship.record.unlocked' : unlocked ? 'championship.currentStop' : 'championship.record.locked')}`}
                onPress={() => onSelect(event.id)}
                style={({ pressed }) => [styles.node, { left: frame.width * stop.x - 26, top: mapHeight * stop.y - 26 }, qualified && styles.qualified, active && styles.selected, pressed && styles.pressed]}>
                <Text maxFontSizeMultiplier={1.3} style={styles.number}>{index + 1}</Text>
                <View style={[styles.status, qualified && styles.qualified]}>
                  <Ionicons name={qualified ? 'checkmark' : !unlocked ? 'lock-closed' : index === 9 ? 'trophy' : 'ellipse'} color={qualified ? palette.aqua : palette.primary} size={12} />
                </View>
                {current && <View style={styles.currentDot} />}
              </Pressable>
            );
          })}
          <Pressable accessibilityRole="button" accessibilityState={{ selected: roomSelected }}
            accessibilityLabel={t(roomUnlocked ? 'championship.map.privateRoom' : 'championship.map.secret')}
            testID="championship.secret" onPress={() => onSelect('private_room')}
            style={({ pressed }) => [styles.node, styles.secret, { left: frame.width * CHAMPIONSHIP_SECRET_SPOT.x - 26, top: mapHeight * CHAMPIONSHIP_SECRET_SPOT.y - 26 }, roomUnlocked && styles.secretUnlocked, roomSelected && styles.selected, pressed && styles.pressed]}>
            {roomUnlocked ? <Ionicons name="key" color={palette.primary} size={25} /> : <Text style={styles.number}>?</Text>}
          </Pressable>
          {roomUnlocked && <Text pointerEvents="none" style={[styles.roomLabel, { top: mapHeight * CHAMPIONSHIP_SECRET_SPOT.y + 34 }]}>{t('championship.map.privateRoom')}</Text>}
        </View>
      </ScrollView>
      <Pressable accessibilityRole="button" testID="championship.current" onPress={() => {
        const stop = CHAMPIONSHIP_MAP_STOPS.find((item) => item.id === currentId) ?? CHAMPIONSHIP_MAP_STOPS[9];
        scroll.current?.scrollTo({ y: Math.max(0, stop.y * mapHeight - frame.height * 0.5), animated: false });
        onSelect(currentId);
      }} style={styles.currentButton}>
        <Ionicons name="navigate" color={palette.selectionRing} size={15} />
        <Text style={styles.currentText}>{t('championship.map.current')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, minWidth: 0, minHeight: 0, backgroundColor: palette.background, overflow: 'hidden' },
  scroll: { flex: 1 }, shade: { backgroundColor: palette.artShade, opacity: 0.2 },
  node: { position: 'absolute', width: 52, height: 52, borderRadius: 999, borderWidth: 2, borderColor: palette.route, backgroundColor: palette.node, alignItems: 'center', justifyContent: 'center', shadowColor: palette.shadow, shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  number: { color: palette.text, fontSize: 22, fontWeight: '800' },
  qualified: { backgroundColor: palette.completedNode, borderColor: palette.aqua },
  selected: { borderColor: palette.selectionRing, borderWidth: 3, backgroundColor: palette.selectedNode },
  status: { position: 'absolute', right: -3, bottom: -3, width: 22, height: 22, borderRadius: 999, backgroundColor: palette.node, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.route },
  currentDot: { position: 'absolute', top: -7, width: 11, height: 11, borderRadius: 999, backgroundColor: palette.selectionRing, borderColor: palette.surface, borderWidth: 2 },
  secret: { borderStyle: 'dashed', borderColor: palette.muted, backgroundColor: palette.node },
  secretUnlocked: { borderStyle: 'solid', borderColor: palette.primary },
  roomLabel: { position: 'absolute', right: '2%', width: '28%', textAlign: 'center', color: palette.primary, fontSize: 12, fontWeight: '800', backgroundColor: palette.regionOverlay, padding: 8, borderRadius: 8 },
  region: { position: 'absolute', padding: 8, borderRadius: 8, backgroundColor: palette.regionOverlay },
  regionText: { color: palette.text, fontWeight: '700', fontSize: 12 },
  currentButton: { position: 'absolute', right: 12, bottom: 12, minHeight: 44, maxWidth: '80%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: palette.regionOverlay, borderWidth: 1, borderColor: palette.selectionRing, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  currentText: { color: palette.text, fontWeight: '700', fontSize: 12, flexShrink: 1 },
  pressed: { opacity: 0.7 },
});
