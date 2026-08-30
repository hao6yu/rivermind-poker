import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalBackdrop } from '../../components/ModalBackdrop';
import type { LegalActions } from '../../domain/poker/types';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import {
  buildBetSizeOptions,
  clampRaiseTarget,
} from './gameplayPresentation';
import {
  applyBetSizingKeypadKey,
  draftForCurrentAmount,
  normalizeBetSizingInput,
  submitBetSizingAmount,
  type BetSizingInputResult,
  type BetSizingKeypadKey,
} from './betSizingEntry';
import { formatChips } from '../../domain/poker/moneyFormat';
import { LIVE_TABLE_SUPPORTED_ORIENTATIONS } from './useTableOrientation';

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

const BET_SIZING_KEYPAD: readonly BetSizingKeypadKey[] = [
  '1', '2', '3',
  '4', '5', '6',
  '7', '8', '9',
  'clear', '0', 'backspace',
];

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
  const reduceMotion = useReducedMotion();
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => draftForCurrentAmount(target));
  const step = Math.max(1, Math.round(bigBlind / 2));

  useEffect(() => {
    if (visible) {
      setTarget(clampRaiseTarget(recommendation?.target ?? legal.suggestedRaiseTo, legal));
      setDraft('');
      setEditing(false);
    }
  }, [legal.maxRaiseTo, legal.minRaiseTo, legal.suggestedRaiseTo, recommendation?.target, visible]);

  // The field and sheet unmount whenever the modal is invisible (backdrop, close
  // button, Android back all route through the parent here). Reset the
  // in-progress editing so the sheet reopens on the last legal amount as a
  // closed tap target rather than a stale, pre-filled draft left over from the
  // field the player never committed to.
  useEffect(() => {
    if (visible) return;
    setEditing(false);
    setDraft(draftForCurrentAmount(target));
  }, [target, visible]);

  const adjustTarget = (amount: number) => {
    setEditing(false);
    setTarget((current) => clampRaiseTarget(current + amount, legal));
  };

  const hint = useMemo<BetSizingInputResult>(
    () => normalizeBetSizingInput(editing ? draft : '', legal, target),
    [draft, editing, legal, target],
  );
  // The legal raise-to range is always visible so a player reads the floor and
  // ceiling next to the amount, not only while the field is open.
  const boundsLabel = t('sizing.boundsHint', { min: formatChips(legal.minRaiseTo), max: formatChips(legal.maxRaiseTo) });

  const submit = useCallback(() => {
    onConfirm(submitBetSizingAmount(hint));
    onClose();
  }, [hint, onConfirm, onClose]);

  const keypadAmount = editing ? (draft.length > 0 ? draft : '0') : formatChips(target);
  const enterKey = (key: BetSizingKeypadKey) => {
    setDraft((current) => applyBetSizingKeypadKey(
      editing ? current : key === 'backspace' ? String(target) : '',
      key,
    ));
    setEditing(true);
  };

  return (
    <Modal animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} supportedOrientations={LIVE_TABLE_SUPPORTED_ORIENTATIONS} transparent visible={visible}>
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
              <View style={styles.coachHint}>
                <Ionicons color={palette.aqua} name="sparkles-outline" size={17} />
                <Text style={styles.coachHintText}>{t('sizing.coachPickAmount', { amount: formatChips(recommendation.target) })}</Text>
              </View>
            ) : null}
            <View style={styles.contextRow}>
              <View style={styles.potContext}>
                <Text style={styles.contextLabel}>{t('poker.action.pot')}</Text>
                <Text style={styles.contextValue}>{formatChips(pot)}</Text>
              </View>
              <Text accessibilityLabel={boundsLabel} numberOfLines={1} style={styles.boundsLabel}>{boundsLabel}</Text>
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
                    onPress={() => {
                      setEditing(false);
                      setTarget(option.target);
                    }}
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

            <View style={styles.amountRow}>
              <Pressable
                accessibilityLabel={t('sizing.decrease', { amount: formatChips(step) })}
                accessibilityRole="button"
                accessibilityState={{ disabled: target <= legal.minRaiseTo }}
                disabled={target <= legal.minRaiseTo}
                onPress={() => adjustTarget(-step)}
                style={[styles.stepButton, target <= legal.minRaiseTo && styles.stepButtonDisabled]}
              >
                <Ionicons color={palette.text} name="remove" size={20} />
                <Text style={styles.stepUnit}>{formatChips(step)}</Text>
              </Pressable>
              <View
                accessibilityLabel={[t('sizing.actionTo', { action: actionLabel }), keypadAmount].join(', ')}
                accessible
                style={[styles.amountTap, editing && styles.amountTapEditing]}
              >
                <Text style={styles.customLabel}>{t('sizing.custom')}</Text>
                <Text adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1} style={styles.amountValue}>{keypadAmount}</Text>
              </View>
              <Pressable
                accessibilityLabel={t('sizing.increase', { amount: formatChips(step) })}
                accessibilityRole="button"
                accessibilityState={{ disabled: target >= legal.maxRaiseTo }}
                disabled={target >= legal.maxRaiseTo}
                onPress={() => adjustTarget(step)}
                style={[styles.stepButton, target >= legal.maxRaiseTo && styles.stepButtonDisabled]}
              >
                <Ionicons color={palette.text} name="add" size={20} />
                <Text style={styles.stepUnit}>{formatChips(step)}</Text>
              </Pressable>
            </View>
            <View accessibilityLabel={t('sizing.editAmount')} style={styles.keypad}>
              {BET_SIZING_KEYPAD.map((key) => {
                const label = key === 'clear'
                  ? t('sizing.clearAmount')
                  : key === 'backspace' ? t('sizing.deleteDigit') : key;
                return (
                  <Pressable
                    accessibilityLabel={label}
                    accessibilityRole="button"
                    key={key}
                    onPress={() => enterKey(key)}
                    style={({ pressed }) => [styles.keypadButton, pressed && styles.keypadButtonPressed]}
                  >
                    {key === 'backspace' ? (
                      <Ionicons color={palette.text} name="backspace-outline" size={20} />
                    ) : (
                      <Text style={[styles.keypadText, key === 'clear' && styles.keypadUtilityText]}>
                        {key === 'clear' ? 'C' : key}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Pressable
            accessibilityLabel={t(currentBet === 0 ? 'poker.action.betAmount' : 'poker.action.raiseTo', { amount: formatChips(submitBetSizingAmount(hint)) })}
            accessibilityRole="button"
            onPress={submit}
            style={styles.confirmButton}
          >
            <Text style={styles.confirmText}>{t(currentBet === 0 ? 'poker.action.betAmount' : 'poker.action.raiseTo', { amount: formatChips(submitBetSizingAmount(hint)) })}</Text>
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
    scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: palette.scrim, padding: 10 },
    sheet: { maxHeight: '84%', gap: 11, paddingHorizontal: 14, paddingTop: 14, borderRadius: 22, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    eyebrow: { color: palette.primary, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 20, fontWeight: '700', marginTop: 2 },
    closeButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.soft },
    scroll: { flexShrink: 1 },
    content: { gap: 10 },
    coachHint: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 2 },
    coachHintText: { flex: 1, color: palette.aquaText, fontSize: 11, lineHeight: 15, fontWeight: '800' },
    contextRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2 },
    potContext: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
    contextLabel: { color: palette.muted, fontSize: 11, lineHeight: 15, fontWeight: '600' },
    contextValue: { color: palette.text, fontSize: 14, lineHeight: 18, fontWeight: '700' },
    options: { flexDirection: 'row', gap: 6 },
    option: { flex: 1, minWidth: 0, minHeight: 52, justifyContent: 'center', alignItems: 'center', gap: 2, paddingHorizontal: 5, borderRadius: 12, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    optionSelected: { backgroundColor: palette.accentSoft, borderColor: palette.primary },
    optionLabel: { color: palette.muted, fontSize: 9, fontWeight: '700', textAlign: 'center' },
    optionLabelSelected: { color: palette.primary },
    optionAmount: { color: palette.text, fontSize: 13, fontWeight: '800', textAlign: 'center' },
    optionAmountSelected: { color: palette.primary },
    recommendedLabel: { color: palette.aqua, fontSize: 8, lineHeight: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.2 },
    customLabel: { color: palette.muted, fontSize: 9, fontWeight: '700' },
    boundsLabel: { flexShrink: 1, color: palette.muted, fontSize: 9, fontWeight: '600', textAlign: 'right' },
    amountRow: { flexDirection: 'row', alignItems: 'stretch', gap: 7 },
    amountTap: { flex: 1, minWidth: 0, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 1, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised },
    amountTapEditing: { borderColor: palette.primary, backgroundColor: palette.accentSoft },
    amountValue: { maxWidth: '100%', color: palette.text, fontSize: 21, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
    stepButton: { width: 52, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    stepUnit: { color: palette.muted, fontSize: 8, fontWeight: '700', fontVariant: ['tabular-nums'] },
    stepButtonDisabled: { opacity: 0.35 },
    keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 7, borderRadius: 14, backgroundColor: palette.soft },
    keypadButton: { flexBasis: '31%', flexGrow: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised },
    keypadButtonPressed: { opacity: 0.7, backgroundColor: palette.accentSoft },
    keypadText: { color: palette.text, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
    keypadUtilityText: { color: palette.primary, fontSize: 15 },
    confirmButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.primary },
    confirmText: { color: palette.primaryText, fontSize: 14, fontWeight: '700' },
  });
}
