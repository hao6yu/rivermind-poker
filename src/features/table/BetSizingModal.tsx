import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalBackdrop } from '../../components/ModalBackdrop';
import type { LegalActions } from '../../domain/poker/types';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import {
  buildBetSizeOptions,
  clampRaiseTarget,
} from './gameplayPresentation';
import { formatChips } from '../../domain/poker/moneyFormat';

interface BetSizingModalProps {
  bigBlind: number;
  currentBet: number;
  legal: LegalActions;
  onClose: () => void;
  onConfirm: (target: number) => void;
  playerStreetBet: number;
  pot: number;
  recommendation?: {
    detail: string;
    target: number;
  };
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
  recommendation,
  visible,
}: BetSizingModalProps) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const insets = useSafeAreaInsets();
  const actionLabel = t(currentBet === 0 ? 'poker.action.bet' : 'poker.action.raise');
  const options = useMemo(() => buildBetSizeOptions({
    bigBlind,
    currentBet,
    legal,
    playerStreetBet,
    pot,
  }), [bigBlind, currentBet, legal, playerStreetBet, pot]);
  const [target, setTarget] = useState(() => clampRaiseTarget(recommendation?.target ?? legal.suggestedRaiseTo, legal));
  const step = Math.max(1, Math.round(bigBlind / 2));

  useEffect(() => {
    if (visible) setTarget(clampRaiseTarget(recommendation?.target ?? legal.suggestedRaiseTo, legal));
  }, [legal.maxRaiseTo, legal.minRaiseTo, legal.suggestedRaiseTo, recommendation?.target, visible]);

  const adjustTarget = (amount: number) => {
    setTarget((current) => clampRaiseTarget(current + amount, legal));
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.scrim}>
        <ModalBackdrop accessibilityLabel={t('sizing.close')} onPress={onClose} />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(18, insets.bottom + 8) }]}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>{t('sizing.eyebrow')}</Text>
              <Text accessibilityRole="header" style={styles.title}>{t('sizing.actionTo', { action: actionLabel })}</Text>
            </View>
            <Pressable accessibilityLabel={t('sizing.close')} accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <Ionicons color={palette.text} name="close" size={20} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.scroll}>
            {recommendation ? (
              <View style={styles.recommendationCard}>
                <View style={styles.recommendationHeader}>
                  <Ionicons color={palette.aqua} name="sparkles-outline" size={18} />
                  <Text style={styles.recommendationTitle}>{t('sizing.coachPickAmount', { amount: formatChips(recommendation.target) })}</Text>
                </View>
                <Text style={styles.recommendationText}>{recommendation.detail}</Text>
              </View>
            ) : null}
            <View style={styles.contextRow}>
              <View style={styles.contextItem}>
                <Text style={styles.contextLabel}>{t('poker.action.pot')}</Text>
                <Text style={styles.contextValue}>{formatChips(pot)}</Text>
              </View>
              <View style={styles.contextItem}>
                <Text style={styles.contextLabel}>{t('poker.action.minimum')}</Text>
                <Text style={styles.contextValue}>{formatChips(legal.minRaiseTo)}</Text>
              </View>
              <View style={styles.contextItem}>
                <Text style={styles.contextLabel}>{t('poker.action.allIn')}</Text>
                <Text style={styles.contextValue}>{formatChips(legal.maxRaiseTo)}</Text>
              </View>
            </View>

            <View style={styles.options}>
              {options.map((option) => {
                const selected = target === option.target;
                const recommended = recommendation?.target === option.target;
                return (
                  <Pressable
                    accessibilityLabel={`${localizedOptionLabel(option.id, option.label, t)}, ${formatChips(option.target)}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={option.id}
                    onPress={() => setTarget(option.target)}
                    style={[styles.option, selected && styles.optionSelected]}
                  >
                    <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{localizedOptionLabel(option.id, option.label, t)}</Text>
                    <Text style={[styles.optionAmount, selected && styles.optionAmountSelected]}>
                      {formatChips(option.target)}
                    </Text>
                    {recommended ? <Text style={styles.recommendedLabel}>{t('sizing.coachPick')}</Text> : null}
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.customCard}>
              <View>
                <Text style={styles.customLabel}>{t('sizing.custom')}</Text>
                <Text style={styles.customAmount}>{formatChips(target)}</Text>
              </View>
              <View style={styles.stepper}>
                <Pressable
                  accessibilityLabel={t('sizing.decrease', { amount: formatChips(step) })}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: target <= legal.minRaiseTo }}
                  disabled={target <= legal.minRaiseTo}
                  onPress={() => adjustTarget(-step)}
                  style={[styles.stepButton, target <= legal.minRaiseTo && styles.stepButtonDisabled]}
                >
                  <Ionicons color={palette.text} name="remove" size={20} />
                </Pressable>
                <Pressable
                  accessibilityLabel={t('sizing.increase', { amount: formatChips(step) })}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: target >= legal.maxRaiseTo }}
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
            accessibilityLabel={t(currentBet === 0 ? 'poker.action.betAmount' : 'poker.action.raiseTo', { amount: formatChips(target) })}
            accessibilityRole="button"
            onPress={() => onConfirm(target)}
            style={styles.confirmButton}
          >
            <Text style={styles.confirmText}>{t(currentBet === 0 ? 'poker.action.betAmount' : 'poker.action.raiseTo', { amount: formatChips(target) })}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function localizedOptionLabel(
  id: string,
  fallback: string,
  t: ReturnType<typeof useLocalization>['t'],
): string {
  if (id === 'minimum') return t('poker.action.minimum');
  if (id === 'pot') return t('poker.action.pot');
  if (id === 'all-in') return t('poker.action.allIn');
  return fallback;
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
    recommendationCard: { gap: 5, padding: 13, borderRadius: 15, backgroundColor: palette.aquaSoft },
    recommendationHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    recommendationTitle: { color: palette.aquaText, fontSize: 12, fontWeight: '800' },
    recommendationText: { color: palette.aquaText, fontSize: 10, lineHeight: 15 },
    contextRow: { flexDirection: 'row', gap: 8 },
    contextItem: { flex: 1, gap: 4, padding: 11, borderRadius: 13, backgroundColor: palette.soft },
    contextLabel: { color: palette.muted, fontSize: 9, fontWeight: '600' },
    contextValue: { color: palette.text, fontSize: 13, fontWeight: '700' },
    options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    option: { flexBasis: '47%', flexGrow: 1, maxWidth: '49%', minHeight: 64, justifyContent: 'center', gap: 3, paddingHorizontal: 13, borderRadius: 14, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    optionSelected: { backgroundColor: palette.accentSoft, borderColor: palette.primary },
    optionLabel: { color: palette.muted, fontSize: 10, fontWeight: '600' },
    optionLabelSelected: { color: palette.primary },
    optionAmount: { color: palette.text, fontSize: 15, fontWeight: '700' },
    optionAmountSelected: { color: palette.primary },
    recommendedLabel: { color: palette.aqua, fontSize: 8, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
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
