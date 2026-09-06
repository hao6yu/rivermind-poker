import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { championshipPalette as palette } from '../../themePalette';
import { SPACING } from '../../theme/designTokens';
import { championshipMapArtwork } from './championshipMapArtwork';
import { CHAMPIONSHIP_MAP_STOPS, CHAMPIONSHIP_SECRET_SPOT } from './championshipMapModel';
import type { ChampionshipMapSelection } from './ChampionshipMap';

/** Crop the same authored venue the marker points to, rather than showing
 * unrelated stock artwork in the event's dossier. */
export function ChampionshipVenuePreview({ selection }: { selection: ChampionshipMapSelection }) {
  const [width, setWidth] = useState(320);
  const venue = CHAMPIONSHIP_MAP_STOPS.find((stop) => stop.id === selection) ?? CHAMPIONSHIP_SECRET_SPOT;
  const imageWidth = width * 2;
  const imageHeight = imageWidth * 1.5;
  const height = SPACING.giga * 3;
  const left = -Math.max(0, Math.min(imageWidth - width, venue.venueX * imageWidth - width / 2));
  const top = -Math.max(0, Math.min(imageHeight - height, venue.venueY * imageHeight - height * 0.7));
  return <View accessible={false} style={styles.preview} onLayout={({ nativeEvent: { layout } }) => setWidth(layout.width)}>
    <Image accessible={false} source={championshipMapArtwork} resizeMode="stretch" style={{ position: 'absolute', width: imageWidth, height: imageHeight, left, top }} />
    <LinearGradient pointerEvents="none" colors={[`${palette.background}00`, palette.surface]} locations={[0.5, 1]} style={StyleSheet.absoluteFill} />
  </View>;
}

const styles = StyleSheet.create({
  preview: { height: SPACING.giga * 3, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.background },
});
