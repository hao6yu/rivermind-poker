import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AiAvatar } from './AiAvatar';
import type { MultiwayAiIdentity } from '../domain/poker/multiwayAiProfiles';
import { personaDescriptionKey, personaLabelKey } from '../localization/aiPersonas';
import { localizedCharacterTitle } from '../localization/characterTitles';
import { useLocalization } from '../localization';
import { type ThemePalette, useAppTheme } from '../theme';

/**
 * An opponent at a size you can actually read them at. The table plaque has to
 * fit six of these around a phone screen; this is the same person with room to
 * breathe, so the roster and the tap-a-seat sheet can share one presentation.
 *
 * The large view (the sheet) carries the full authored character: the explicit
 * AI identity, the localized personality label, and the short authored
 * description. Deliberately shows only what a player is entitled to know about
 * an opponent before they have played them: who they are, not how they play —
 * no strategy weights, ranges, decision traces, or adaptation state.
 */
export function AiPlayerProfile({
  identity,
  size = 'large',
}: {
  identity: MultiwayAiIdentity;
  size?: 'large' | 'row' | 'tile';
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const large = size === 'large';
  const title = localizedCharacterTitle(identity, t);
  const styles = useMemo(() => createStyles(palette, size), [palette, size]);

  return (
    <View style={styles.container}>
      <AiAvatar name={identity.name} size={large ? 104 : size === 'tile' ? 62 : 46} />
      <View style={styles.copy}>
        <Text accessibilityRole={large ? 'header' : undefined} numberOfLines={1} style={styles.name}>{identity.name}</Text>
        {title ? (
          <Text numberOfLines={size === 'tile' ? 2 : undefined} style={styles.title}>{title}</Text>
        ) : null}
        {large ? (
          <Text
            maxFontSizeMultiplier={1.2}
            numberOfLines={1}
            style={styles.aiBadge}
          >
            {t('multiplayer.lobby.ai')}
          </Text>
        ) : null}
        {large ? (
          <>
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.persona}>{t(personaLabelKey(identity.style))}</Text>
            <Text maxFontSizeMultiplier={1.3} style={styles.description}>{t(personaDescriptionKey(identity.style))}</Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(palette: ThemePalette, size: 'large' | 'row' | 'tile') {
  const large = size === 'large';
  const tile = size === 'tile';
  return StyleSheet.create({
    container: large
      ? { alignItems: 'center', gap: 14, paddingVertical: 8 }
      : tile
        ? { alignItems: 'center', gap: 7 }
        : { alignItems: 'center', flexDirection: 'row', gap: 14 },
    copy: large || tile ? { alignItems: 'center', gap: tile ? 1 : 4 } : { flex: 1, gap: 2 },
    name: {
      color: palette.text,
      fontSize: large ? 26 : tile ? 13 : 16,
      fontWeight: '800',
      textAlign: large || tile ? 'center' : 'left',
    },
    title: {
      color: palette.muted,
      // Tile titles are jokes, so they wrap to a second line rather than
      // ellipsizing a punchline away; 2 lines is what a 3-across grid affords.
      fontSize: large ? 15 : tile ? 10 : 13,
      fontWeight: '600',
      lineHeight: tile ? 13 : undefined,
      textAlign: large || tile ? 'center' : 'left',
    },
    aiBadge: {
      color: palette.muted,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.6,
      marginTop: 4,
      overflow: 'hidden',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 7,
      backgroundColor: palette.soft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.border,
    },
    persona: {
      color: palette.primary,
      fontSize: 12,
      fontWeight: '800',
      marginTop: 6,
    },
    description: {
      color: palette.muted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
      textAlign: 'center',
    },
  });
}
