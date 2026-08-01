import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LegalActions } from '../../domain/poker/types';
import { type ThemePalette, useAppTheme } from '../../theme';
import {
  buildBetSizeOptions,
  clampRaiseTarget,
  formatBb,
} from './gameplayPresentation';

interface BetSizingModalProps {
  bigBlind: number;
  currentBet: number;
  legal: LegalActions;
  onClose: () => void;
  onConfirm: (target: number) => void;
  playerStreetBet: number;
  pot: number;
  visible: boolean;
}

export function BetSizingModal({
  bigBlind,
  currentBet,
  legal,
  onClose,
  onConfirm,
  playerStreetBet,
  pot,
  visible,
}: BetSizingModalProps) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const insets = useSafeAreaInsets();
  const actionLabel = currentBet === 0 ? 'Bet' : 'Raise';
  const options = useMemo(() => buildBetSizeOptions({
    bigBlind,
    currentBet,
    legal,
    playerStreetBet,
    pot,
  }), [bigBlind, currentBet, legal, playerStreetBet, pot]);
  const [target, setTarget] = useState(() => clampRaiseTarget(legal.suggestedRaiseTo, legal));
  const step = Math.max(1, Math.round(bigBlind / 2));

  useEffect(() => {
    if (visible) setTarget(clampRaiseTarget(legal.suggestedRaiseTo, legal));
  }, [legal.maxRaiseTo, legal.minRaiseTo, legal.suggestedRaiseTo, visible]);

  const adjustTarget = (amount: number) => {
    setTarget((current) => clampRaiseTarget(current + amount, legal));
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.scrim}>
        <Pressable accessibilityLabel="Close bet sizing" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={[styles.sheet, { paddingBottom: Math.max(18, insets.bottom + 8) }]}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>Choose a legal size</Text>
              <Text style={styles.title}>{actionLabel} to</Text>
            </View>
            <Pressable accessibilityLabel="Close bet sizing" accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <Ionicons color={palette.text} name="close" size={20} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.scroll}>
            <View style={styles.contextRow}>
              <View style={styles.contextItem}>
                <Text style={styles.contextLabel}>Pot</Text>
                <Text style={styles.contextValue}>{formatBb(pot, bigBlind)}</Text>
              </View>
              <View style={styles.contextItem}>
                <Text style={styles.contextLabel}>Minimum</Text>
                <Text style={styles.contextValue}>{formatBb(legal.minRaiseTo, bigBlind)}</Text>
              </View>
              <View style={styles.contextItem}>
                <Text style={styles.contextLabel}>All-in</Text>
                <Text style={styles.contextValue}>{formatBb(legal.maxRaiseTo, bigBlind)}</Text>
              </View>
            </View>

            <View style={styles.options}>
              {options.map((option) => {
                const selected = target === option.target;
                return (
                  <Pressable
                    accessibilityLabel={`${option.label}, ${formatBb(option.target, bigBlind)}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={option.id}
                    onPress={() => setTarget(option.target)}
                    style={[styles.option, selected && styles.optionSelected]}
                  >
                    <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{option.label}</Text>
                    <Text style={[styles.optionAmount, selected && styles.optionAmountSelected]}>
                      {formatBb(option.target, bigBlind)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.customCard}>
              <View>
                <Text style={styles.customLabel}>Custom size</Text>
                <Text style={styles.customAmount}>{formatBb(target, bigBlind)}</Text>
              </View>
              <View style={styles.stepper}>
                <Pressable
                  accessibilityLabel={`Decrease by ${formatBb(step, bigBlind)}`}
                  accessibilityRole="button"
                  disabled={target <= legal.minRaiseTo}
                  onPress={() => adjustTarget(-step)}
                  style={[styles.stepButton, target <= legal.minRaiseTo && styles.stepButtonDisabled]}
                >
                  <Ionicons color={palette.text} name="remove" size={20} />
                </Pressable>
                <Pressable
                  accessibilityLabel={`Increase by ${formatBb(step, bigBlind)}`}
                  accessibilityRole="button"
                  disabled={target >= legal.maxRaiseTo}
                  onPress={() => adjustTarget(step)}
                  style={[styles.stepButton, target >= legal.maxRaiseTo && styles.stepButtonDisabled]}
                >
                  <Ionicons color={palette.text} name="add" size={20} />
                </Pressable>
              </View>
            </View>
          </ScrollView>

          <Pressable
            accessibilityLabel={`${actionLabel} to ${formatBb(target, bigBlind)}`}
            accessibilityRole="button"
            onPress={() => onConfirm(target)}
            style={styles.confirmButton}
          >
            <Text style={styles.confirmText}>{actionLabel} to {formatBb(target, bigBlind)}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: palette.scrim, padding: 12 },
    sheet: { maxHeight: '92%', gap: 16, paddingHorizontal: 18, paddingTop: 18, borderRadius: 25, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    eyebrow: { color: palette.primary, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 22, fontWeight: '700', marginTop: 3 },
    closeButton: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.soft },
    scroll: { flexShrink: 1 },
    content: { gap: 14 },
    contextRow: { flexDirection: 'row', gap: 8 },
    contextItem: { flex: 1, gap: 4, padding: 11, borderRadius: 13, backgroundColor: palette.soft },
    contextLabel: { color: palette.muted, fontSize: 9, fontWeight: '600' },
    contextValue: { color: palette.text, fontSize: 13, fontWeight: '700' },
    options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    option: { flexBasis: '47%', flexGrow: 1, maxWidth: '49%', minHeight: 60, justifyContent: 'center', gap: 3, paddingHorizontal: 13, borderRadius: 14, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    optionSelected: { backgroundColor: palette.accentSoft, borderColor: palette.primary },
    optionLabel: { color: palette.muted, fontSize: 10, fontWeight: '600' },
    optionLabelSelected: { color: palette.primary },
    optionAmount: { color: palette.text, fontSize: 15, fontWeight: '700' },
    optionAmountSelected: { color: palette.primary },
    customCard: { minHeight: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 13, borderRadius: 15, backgroundColor: palette.soft },
    customLabel: { color: palette.muted, fontSize: 10, fontWeight: '600' },
    customAmount: { color: palette.text, fontSize: 20, fontWeight: '700', marginTop: 3 },
    stepper: { flexDirection: 'row', gap: 8 },
    stepButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    stepButtonDisabled: { opacity: 0.35 },
    confirmButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.primary },
    confirmText: { color: palette.primaryText, fontSize: 14, fontWeight: '700' },
  });
}
