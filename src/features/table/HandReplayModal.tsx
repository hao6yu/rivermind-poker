import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalBackdrop } from '../../components/ModalBackdrop';
import { PlayingCard } from '../../components/PlayingCard';
import { SuitAwareText } from '../../components/SuitAwareText';
import { cardLabel } from '../../domain/poker/cards';
import { buildReplaySteps, replayStepForHeroDecision, type ReplayStep } from '../../domain/poker/replay';
import { streetLabel } from '../../domain/poker/engine';
import { type ThemePalette, useAppTheme } from '../../theme';
import { MultiwayHandReplayModal } from './MultiwayHandReplayModal';
import {
  isMultiwaySessionHandRecord,
  type HeadsUpSessionHandRecord,
  type SessionHandRecord,
} from './sessionModels';

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
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height < 700;
  const styles = useMemo(() => createStyles(palette, compact), [compact, palette]);
  const steps = useMemo(() => hand ? buildReplaySteps(hand.game) : [], [hand]);
  const focusDecision = hand?.coachResult?.review.focusDecisionSequence ?? 0;
  const initialStep = useMemo(
    () => replayStepForHeroDecision(steps, focusDecision),
    [focusDecision, steps],
  );
  const [stepIndex, setStepIndex] = useState(initialStep);

  useEffect(() => setStepIndex(initialStep), [hand, initialStep]);
  if (!hand || steps.length === 0) return null;

  const step = steps[Math.min(stepIndex, steps.length - 1)] as ReplayStep;
  const isFocus = focusDecision > 0 && step.heroDecisionSequence === focusDecision;
  const atStart = stepIndex === 0;
  const atEnd = stepIndex === steps.length - 1;
  const toBb = (chips: number) => `${Math.round((chips / hand.game.bigBlind) * 10) / 10} BB`;

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={Boolean(hand)}>
      <View style={styles.scrim}>
        <ModalBackdrop accessibilityLabel="Close hand replay" onPress={onClose} />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(18, insets.bottom + 8) }]}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>Hand {hand.game.handNumber} · Replay</Text>
              <Text accessibilityRole="header" style={styles.title}>{stepTitle(step)}</Text>
            </View>
            <Pressable accessibilityLabel="Close hand replay" accessibilityRole="button" onPress={onClose} style={styles.iconButton}>
              <Ionicons color={palette.text} name="close" size={20} />
            </Pressable>
          </View>

          <View
            accessibilityLabel={`Replay step ${stepIndex + 1} of ${steps.length}`}
            accessibilityRole="progressbar"
            accessibilityValue={{ max: steps.length, min: 1, now: stepIndex + 1 }}
            style={styles.progressRow}
          >
            <Text style={styles.progressText}>Step {stepIndex + 1} of {steps.length}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${((stepIndex + 1) / steps.length) * 100}%` }]} />
            </View>
          </View>

          {isFocus ? (
            <View style={styles.focusBanner}>
              <Ionicons color={palette.primary} name="sparkles-outline" size={17} />
              <Text style={styles.focusText}>Coach focus · Review this decision carefully</Text>
            </View>
          ) : null}

          <View style={styles.table}>
            <View style={styles.playerZone}>
              <Text style={styles.playerName}>Mara · {toBb(step.villainStack)}</Text>
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
              <View style={styles.potPill}><Text style={styles.potText}>Pot · {toBb(step.pot)}</Text></View>
              <View style={styles.boardRow}>
                {Array.from({ length: 5 }, (_, index) => (
                  <PlayingCard card={step.board[index]} compact key={`replay-board-${index}`} />
                ))}
              </View>
              <View style={styles.actionCard}>
                <Text style={styles.actionStreet}>{streetLabel(step.street)}</Text>
                <SuitAwareText style={styles.actionText} text={stepDescription(step, hand, toBb)} />
              </View>
            </View>

            <View style={styles.playerZone}>
              <View style={styles.cardsRow}>
                {hand.game.players.hero.holeCards.map((card) => (
                  <PlayingCard card={card} compact key={cardLabel(card)} />
                ))}
              </View>
              <Text style={styles.playerName}>You · {toBb(step.heroStack)}</Text>
            </View>
          </View>

          <View style={styles.controls}>
            <Pressable
              accessibilityLabel="Previous replay step"
              accessibilityRole="button"
              accessibilityState={{ disabled: atStart }}
              disabled={atStart}
              onPress={() => setStepIndex((current) => Math.max(0, current - 1))}
              style={[styles.secondaryButton, atStart && styles.disabledButton]}
            >
              <Ionicons color={palette.text} name="chevron-back" size={18} />
              <Text style={styles.secondaryButtonText}>Previous</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={atEnd ? 'Finish hand replay' : 'Next replay step'}
              accessibilityRole="button"
              onPress={atEnd ? onClose : () => setStepIndex((current) => Math.min(steps.length - 1, current + 1))}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>{atEnd ? 'Done' : 'Next'}</Text>
              {!atEnd ? <Ionicons color={palette.primaryText} name="chevron-forward" size={18} /> : null}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function stepTitle(step: ReplayStep): string {
  if (step.kind === 'start') return 'Cards dealt';
  if (step.kind === 'deal') return `${streetLabel(step.street)} dealt`;
  if (step.kind === 'outcome') return 'Hand complete';
  return step.actor === 'hero' ? 'Your action' : 'Mara’s action';
}

function stepDescription(
  step: ReplayStep,
  hand: HeadsUpSessionHandRecord,
  toBb: (chips: number) => string,
): string {
  if (step.kind === 'start') return 'Blinds are posted. Review the starting stacks and your hole cards.';
  if (step.kind === 'deal') return `${streetLabel(step.street)}: ${step.board.map(cardLabel).join(' ')}`;
  if (step.kind === 'outcome') return hand.game.outcome?.message ?? 'The hand is complete.';
  const actor = step.actor === 'hero' ? 'You' : 'Mara';
  if (step.action === 'raise') {
    return `${actor} ${step.currentBetBefore === 0 ? 'bet' : 'raised'} to ${toBb(step.amount)}.`;
  }
  if (step.action === 'call') return `${actor} called ${toBb(step.amount)}.`;
  if (step.action === 'check') return `${actor} checked.`;
  return `${actor} folded.`;
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
    focusBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, backgroundColor: palette.accentSoft },
    focusText: { flex: 1, color: palette.text, fontSize: 10, fontWeight: '600' },
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
