import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalBackdrop } from '../../components/ModalBackdrop';
import { PlayingCard } from '../../components/PlayingCard';
import { SuitAwareText } from '../../components/SuitAwareText';
import { cardLabel } from '../../domain/poker/cards';
import { gradeHeadsUpHand } from '../../domain/poker/decisionGrading';
import { buildReplaySteps, replayStepForHeroDecision, type ReplayStep } from '../../domain/poker/replay';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import { MultiwayHandReplayModal } from './MultiwayHandReplayModal';
import { DecisionReviewCard } from './DecisionReviewCard';
import {
  isMultiwaySessionHandRecord,
  type HeadsUpSessionHandRecord,
  type SessionHandRecord,
} from './sessionModels';
import { localizedStreet, type GameplayTranslator } from './localizedGameplay';
import { formatChips } from '../../domain/poker/moneyFormat';

interface HandReplayModalProps {
  hand: SessionHandRecord | null;
  onClose: () => void;
}

export function HandReplayModal({ hand, onClose }: HandReplayModalProps) {
  if (hand && isMultiwaySessionHandRecord(hand)) {
    return <MultiwayHandReplayModal hand={hand} onClose={onClose} />;
  }
  return <HeadsUpHandReplayModal hand={hand} onClose={onClose} />;
}

function HeadsUpHandReplayModal({ hand, onClose }: { hand: HeadsUpSessionHandRecord | null; onClose: () => void }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height < 700;
  const styles = useMemo(() => createStyles(palette, compact), [compact, palette]);
  const steps = useMemo(() => hand ? buildReplaySteps(hand.game) : [], [hand]);
  const decisionReport = useMemo(() => hand ? gradeHeadsUpHand(hand.game) : null, [hand]);
  const focusDecision = decisionReport?.focusDecisionSequence ?? 0;
  const initialStep = useMemo(
    () => replayStepForHeroDecision(steps, focusDecision),
    [focusDecision, steps],
  );
  const [stepIndex, setStepIndex] = useState(initialStep);

  useEffect(() => setStepIndex(initialStep), [hand, initialStep]);
  if (!hand || steps.length === 0) return null;

  const step = steps[Math.min(stepIndex, steps.length - 1)] as ReplayStep;
  const comparison = step.heroDecisionSequence
    ? decisionReport?.decisions.find((decision) => decision.sequence === step.heroDecisionSequence) ?? null
    : null;
  const atStart = stepIndex === 0;
  const atEnd = stepIndex === steps.length - 1;

  return (
    <Modal animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} transparent visible={Boolean(hand)}>
      <View style={styles.scrim}>
        <ModalBackdrop accessibilityLabel={t('replay.close')} onPress={onClose} />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(18, insets.bottom + 8) }]}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>{t('replay.header', { hand: hand.game.handNumber })}</Text>
              <Text accessibilityRole="header" style={styles.title}>{stepTitle(step, t)}</Text>
            </View>
            <Pressable accessibilityLabel={t('replay.close')} accessibilityRole="button" onPress={onClose} style={styles.iconButton}>
              <Ionicons color={palette.text} name="close" size={20} />
            </Pressable>
          </View>

          <View
            accessibilityLabel={t('replay.progressA11y', { current: stepIndex + 1, total: steps.length })}
            accessibilityRole="progressbar"
            accessibilityValue={{ max: steps.length, min: 1, now: stepIndex + 1 }}
            style={styles.progressRow}
          >
            <Text style={styles.progressText}>{t('replay.progress', { current: stepIndex + 1, total: steps.length })}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${((stepIndex + 1) / steps.length) * 100}%` }]} />
            </View>
          </View>

          <View style={styles.table}>
            <View style={styles.playerZone}>
              <Text style={styles.playerName}>Mara · {formatChips(step.villainStack)}</Text>
              <View style={styles.cardsRow}>
                {Array.from({ length: 2 }, (_, index) => (
                  <PlayingCard
                    card={hand.game.players.villain.holeCards[index]}
                    compact
                    hidden={!step.revealVillain}
                    key={`villain-card-${index}`}
                  />
                ))}
              </View>
            </View>

            <View style={styles.centerZone}>
              <View style={styles.potPill}><Text style={styles.potText}>{t('table.pot', { amount: formatChips(step.pot) })}</Text></View>
              <View style={styles.boardRow}>
                {Array.from({ length: 5 }, (_, index) => (
                  <PlayingCard card={step.board[index]} compact key={`replay-board-${index}`} />
                ))}
              </View>
              <View style={styles.actionCard}>
                <Text style={styles.actionStreet}>{localizedStreet(step.street, t)}</Text>
                <SuitAwareText style={styles.actionText} text={stepDescription(step, hand, t)} />
              </View>
            </View>

            <View style={styles.playerZone}>
              <View style={styles.cardsRow}>
                {hand.game.players.hero.holeCards.map((card) => (
                  <PlayingCard card={card} compact key={cardLabel(card)} />
                ))}
              </View>
              <Text style={styles.playerName}>{t('common.you')} · {formatChips(step.heroStack)}</Text>
            </View>
          </View>

          {comparison ? <DecisionReviewCard compact comparison={comparison} /> : null}

          <View style={styles.controls}>
            <Pressable
              accessibilityLabel={t('replay.previousA11y')}
              accessibilityRole="button"
              accessibilityState={{ disabled: atStart }}
              disabled={atStart}
              onPress={() => setStepIndex((current) => Math.max(0, current - 1))}
              style={[styles.secondaryButton, atStart && styles.disabledButton]}
            >
              <Ionicons color={palette.text} name="chevron-back" size={18} />
              <Text style={styles.secondaryButtonText}>{t('common.previous')}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={atEnd ? t('replay.finishA11y') : t('replay.nextA11y')}
              accessibilityRole="button"
              onPress={atEnd ? onClose : () => setStepIndex((current) => Math.min(steps.length - 1, current + 1))}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>{atEnd ? t('common.done') : t('replay.next')}</Text>
              {!atEnd ? <Ionicons color={palette.primaryText} name="chevron-forward" size={18} /> : null}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function stepTitle(step: ReplayStep, t: GameplayTranslator): string {
  if (step.kind === 'start') return t('replay.cardsDealt');
  if (step.kind === 'deal') return t('replay.streetDealt', { street: localizedStreet(step.street, t) });
  if (step.kind === 'outcome') return t('table.handComplete');
  return step.actor === 'hero' ? t('replay.heroAction') : t('replay.playerAction', { player: 'Mara' });
}

function stepDescription(
  step: ReplayStep,
  hand: HeadsUpSessionHandRecord,
  t: GameplayTranslator,
): string {
  if (step.kind === 'start') return t('replay.startDescription');
  if (step.kind === 'deal') return `${localizedStreet(step.street, t)}: ${step.board.map(cardLabel).join(' ')}`;
  if (step.kind === 'outcome') return hand.game.outcome?.message ?? t('replay.completeDescription');
  const actor = step.actor === 'hero' ? t('common.you') : 'Mara';
  if (step.action === 'raise') {
    return t(step.currentBetBefore === 0 ? 'poker.latest.bet' : 'poker.latest.raise', { actor, amount: formatChips(step.amount) });
  }
  if (step.action === 'call') return t('poker.latest.call', { actor, amount: formatChips(step.amount) });
  if (step.action === 'check') return t('poker.latest.check', { actor });
  return t('poker.latest.fold', { actor });
}

function createStyles(palette: ThemePalette, compact = false) {
  return StyleSheet.create({
    scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: palette.scrim, padding: 12 },
    sheet: { height: compact ? '96%' : '92%', gap: compact ? 10 : 14, padding: compact ? 14 : 18, borderRadius: 24, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    eyebrow: { color: palette.primary, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 20, fontWeight: '700', marginTop: 3 },
    iconButton: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.soft },
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    progressText: { color: palette.muted, fontSize: 9, minWidth: 65 },
    progressTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: palette.soft },
    progressFill: { height: 4, borderRadius: 2, backgroundColor: palette.primary },
    table: { flex: 1, minHeight: 0, justifyContent: 'space-between', paddingVertical: compact ? 11 : 18, paddingHorizontal: 12, borderRadius: 30, backgroundColor: palette.table, borderWidth: 1, borderColor: palette.tableLine },
    playerZone: { alignItems: 'center', gap: compact ? 3 : 6 },
    playerName: { color: palette.tableText, fontSize: 10, fontWeight: '700' },
    cardsRow: { flexDirection: 'row', gap: 5 },
    centerZone: { alignItems: 'center', gap: compact ? 7 : 11 },
    potPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    potText: { color: palette.tableText, fontSize: 9, fontWeight: '700' },
    boardRow: { flexDirection: 'row', gap: 3 },
    actionCard: { minWidth: '72%', maxWidth: '90%', gap: 3, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    actionStreet: { color: palette.aqua, fontSize: 8, fontWeight: '700', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.6 },
    actionText: { color: palette.tableText, fontSize: 10, lineHeight: 14, textAlign: 'center' },
    controls: { flexDirection: 'row', gap: 8 },
    secondaryButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 13, backgroundColor: palette.soft },
    disabledButton: { opacity: 0.38 },
    secondaryButtonText: { color: palette.text, fontSize: 13, fontWeight: '700' },
    primaryButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 13, backgroundColor: palette.primary },
    primaryButtonText: { color: palette.primaryText, fontSize: 13, fontWeight: '700' },
  });
}
