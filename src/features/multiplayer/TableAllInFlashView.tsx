import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { useLocalization } from '../../localization';
import type { AllInMomentTrigger } from './allInMoment';
import { playAllInMomentSound } from './tableMomentMedia';

/**
 * Felt-wide all-in flash (Slice 3.8C). Presents one trigger at a time for a
 * sub-900-millisecond window, driven ONLY by newly accepted all-in
 * transitions (see detectAllInMoments), with animation and sound fully
 * outside the poker engine and the settlement await chain. The overlay is
 * pointer-transparent and hidden from the accessibility tree: the action
 * bubble already announces the wager, so this is a visual accent only.
 */

export const ALL_IN_FLASH_DURATION_MS = 700;

interface TableAllInFlashViewProps {
  flashes: AllInMomentTrigger[];
  onPresented: (key: string) => void;
  reduceMotion: boolean;
}

export function TableAllInFlashView({
  flashes,
  onPresented,
  reduceMotion,
}: TableAllInFlashViewProps): React.JSX.Element | null {
  const { t } = useLocalization();
  const [visibleKey, setVisibleKey] = useState<string | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = flashes.find((candidate) => candidate.key === visibleKey) ?? flashes[0] ?? null;

  useEffect(() => {
    if (!trigger) {
      setVisibleKey(null);
      return;
    }
    if (trigger.key === visibleKey) return;
    setVisibleKey(trigger.key);
    // The flash's audio rides the same bundled, never-remote path as the
    // table moments, outside the engine and settlement chain.
    playAllInMomentSound();
    progress.setValue(0);
    const animation = reduceMotion
      ? null
      : Animated.timing(progress, {
        duration: ALL_IN_FLASH_DURATION_MS,
        toValue: 1,
        useNativeDriver: true,
      });
    animation?.start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onPresented(trigger.key);
    }, ALL_IN_FLASH_DURATION_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      animation?.stop();
    };
    // The key is the only identity; presenting is one-shot per trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger?.key]);

  if (!trigger) return null;

  const opacity = reduceMotion ? 1 : progress.interpolate({
    inputRange: [0, 0.15, 0.85, 1],
    outputRange: [0, 1, 1, 0],
  });
  const translateY = reduceMotion ? 0 : progress.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [-10, 0, -4],
  });

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.allInFlashWrap,
        { opacity, transform: [{ translateY }] },
      ]}
    >
      <View style={styles.allInFlashPill}>
        <Text maxFontSizeMultiplier={1.4} style={styles.allInFlashText}>
          {trigger.displayName}
        </Text>
        <Text maxFontSizeMultiplier={1.4} style={styles.allInFlashLabel}>
          {t('multiplayer.game.allIn')}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  allInFlashWrap: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: '38%',
    zIndex: 40,
  },
  allInFlashPill: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(10, 10, 14, 0.82)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    gap: 2,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  allInFlashText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  allInFlashLabel: {
    color: '#FFD166',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2,
  },
});
