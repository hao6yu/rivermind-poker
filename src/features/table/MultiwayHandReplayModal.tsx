import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalBackdrop } from '../../components/ModalBackdrop';
import { PlayingCard } from '../../components/PlayingCard';
import { gradeMultiwayHand } from '../../domain/poker/decisionGrading';
import { type ThemePalette, useAppTheme } from '../../theme';
import {
  buildMultiwayReplaySteps,
  multiwayReplayStepForHeroDecision,
  multiwayReplayStepDescription,
  multiwayReplayStepTitle,
  replayVisibleCards,
} from './multiwayGameplayPresentation';
import type { MultiwaySessionHandRecord } from './sessionModels';
import { DecisionReviewCard } from './DecisionReviewCard';

export function MultiwayHandReplayModal({
  hand,
  onClose,
}: {
  hand: MultiwaySessionHandRecord;
  onClose: () => void;
}) {
  const { palette } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height < 720;
  const styles = useMemo(() => createStyles(palette, compact), [compact, palette]);
  const steps = useMemo(() => buildMultiwayReplaySteps(hand.game), [hand.game]);
  const decisionReport = useMemo(() => gradeMultiwayHand(hand.game), [hand.game]);
  const initialStep = useMemo(
    () => decisionReport.decisions.length > 0
      ? multiwayReplayStepForHeroDecision(steps, decisionReport.focusDecisionSequence)
      : 0,
    [decisionReport.decisions.length, decisionReport.focusDecisionSequence, steps],
  );
  const [stepIndex, setStepIndex] = useState(initialStep);
  useEffect(() => setStepIndex(initialStep), [hand.clientId, initialStep]);
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  if (!step) return null;
  const comparison = step.heroDecisionSequence
    ? decisionReport.decisions.find((decision) => decision.sequence === step.heroDecisionSequence) ?? null
    : null;
  const atStart = stepIndex === 0;
  const atEnd = stepIndex === steps.length - 1;

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={styles.scrim}>
        <ModalBackdrop accessibilityLabel="Close multiway hand replay" onPress={onClose} />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(18, insets.bottom + 8) }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{hand.game.tablePlayerIds.length}-player · Hand {hand.game.handNumber}</Text>
              <Text accessibilityRole="header" style={styles.title}>{multiwayReplayStepTitle(step, hand.game)}</Text>
            </View>
            <Pressable accessibilityLabel="Close hand replay" accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <Ionicons color={palette.text} name="close" size={20} />
            </Pressable>
          </View>

          <View
            accessibilityLabel={`Replay step ${stepIndex + 1} of ${steps.length}`}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 1, max: steps.length, now: stepIndex + 1 }}
            style={styles.progressRow}
          >
            <Text style={styles.progressText}>Step {stepIndex + 1}/{steps.length}</Text>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${((stepIndex + 1) / steps.length) * 100}%` }]} /></View>
          </View>

          <View style={styles.table}>
            <View style={styles.opponents}>
              {hand.game.tablePlayerIds.filter((playerId) => playerId !== 'hero').map((playerId) => {
                const player = hand.game.players[playerId];
                if (!player) return null;
                const visibleCards = replayVisibleCards(player, step);
                const folded = step.foldedPlayerIds.includes(playerId);
                return (
                  <View accessible accessibilityLabel={`${player.name}, ${toBb(step.stacks[playerId] ?? 0, hand.game.bigBlind)}${folded ? ', folded' : ''}`} key={playerId} style={[styles.player, folded && styles.folded]}>
                    <Text numberOfLines={1} style={styles.playerName}>{player.name} · {player.position}</Text>
                    <View style={styles.cards}>
                      {Array.from({ length: 2 }, (_, index) => (
                        <PlayingCard card={visibleCards[index]} hidden={visibleCards.length === 0} key={`${playerId}-${index}`} mini />
                      ))}
                    </View>
                    <Text numberOfLines={1} style={styles.stack}>{toBb(step.stacks[playerId] ?? 0, hand.game.bigBlind)}{folded ? ' · Folded' : ''}</Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.center}>
              <View style={styles.potPill}><Text style={styles.potText}>Pot · {toBb(step.pot, hand.game.bigBlind)}</Text></View>
              <View style={styles.board}>
                {Array.from({ length: 5 }, (_, index) => <PlayingCard card={step.board[index]} key={`replay-board-${index}`} mini={compact} compact={!compact} />)}
              </View>
              <View style={styles.actionCard}>
                <Text style={styles.actionStreet}>{step.street}</Text>
                <Text style={styles.actionText}>{multiwayReplayStepDescription(step, hand.game)}</Text>
              </View>
            </View>

            <View style={styles.hero}>
              <View style={styles.cards}>
                {hand.game.players.hero?.holeCards.map((card, index) => <PlayingCard card={card} compact key={`hero-${index}`} />)}
              </View>
              <Text style={styles.heroName}>You · {toBb(step.stacks.hero ?? 0, hand.game.bigBlind)}</Text>
            </View>
          </View>

          {comparison ? <DecisionReviewCard compact comparison={comparison} /> : null}

          <View style={styles.controls}>
            <Pressable
              accessibilityLabel="Previous replay step"
              accessibilityRole="button"
              accessibilityState={{ disabled: atStart }}
              disabled={atStart}
              onPress={() => setStepIndex((current) => Math.max(0, current - 1))}
              style={[styles.secondaryButton, atStart && styles.disabled]}
            >
              <Ionicons color={palette.text} name="chevron-back" size={18} />
              <Text style={styles.secondaryText}>Previous</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={atEnd ? 'Finish hand replay' : 'Next replay step'}
              accessibilityRole="button"
              onPress={atEnd ? onClose : () => setStepIndex((current) => Math.min(steps.length - 1, current + 1))}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryText}>{atEnd ? 'Done' : 'Next'}</Text>
              {!atEnd ? <Ionicons color={palette.primaryText} name="chevron-forward" size={18} /> : null}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function toBb(chips: number, bigBlind: number): string {
  return `${Math.round((chips / bigBlind) * 10) / 10} BB`;
}

function createStyles(palette: ThemePalette, compact: boolean) {
  return StyleSheet.create({
    scrim: { flex: 1, justifyContent: 'flex-end', padding: 12, backgroundColor: palette.scrim },
    sheet: { height: compact ? '96%' : '92%', gap: compact ? 10 : 14, padding: compact ? 14 : 18, borderRadius: 24, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerCopy: { flex: 1 },
    eyebrow: { color: palette.primary, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 20, fontWeight: '700', marginTop: 3 },
    closeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.soft },
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    progressText: { minWidth: 62, color: palette.muted, fontSize: 9 },
    progressTrack: { flex: 1, height: 4, overflow: 'hidden', borderRadius: 2, backgroundColor: palette.soft },
    progressFill: { height: 4, borderRadius: 2, backgroundColor: palette.primary },
    table: { flex: 1, minHeight: 0, gap: compact ? 7 : 10, justifyContent: 'space-between', paddingVertical: compact ? 10 : 14, paddingHorizontal: 10, borderRadius: 24, backgroundColor: palette.table, borderWidth: 1, borderColor: palette.tableLine },
    opponents: { flexDirection: 'row', justifyContent: 'center', gap: compact ? 3 : 5, paddingHorizontal: 2 },
    player: { flex: 1, minWidth: 0, maxWidth: 82, alignItems: 'center', gap: 3, paddingHorizontal: 2, paddingVertical: compact ? 3 : 5, borderRadius: 11, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    folded: { opacity: 0.48 },
    playerName: { color: palette.tableText, fontSize: compact ? 7 : 7.5, fontWeight: '700' },
    cards: { flexDirection: 'row', gap: 3 },
    stack: { color: palette.tableText, fontSize: compact ? 6.5 : 7 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: compact ? 6 : 9 },
    potPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    potText: { color: palette.tableText, fontSize: 9, fontWeight: '700' },
    board: { flexDirection: 'row', gap: 3 },
    actionCard: { width: '90%', gap: 3, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 11, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    actionStreet: { color: palette.aqua, fontSize: 8, fontWeight: '700', textAlign: 'center', textTransform: 'uppercase' },
    actionText: { color: palette.tableText, fontSize: 9, lineHeight: 13, textAlign: 'center' },
    hero: { alignItems: 'center', gap: 3 },
    heroName: { color: palette.tableText, fontSize: 9, fontWeight: '700' },
    controls: { flexDirection: 'row', gap: 8 },
    secondaryButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 13, backgroundColor: palette.soft },
    secondaryText: { color: palette.text, fontSize: 13, fontWeight: '700' },
    primaryButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 13, backgroundColor: palette.primary },
    primaryText: { color: palette.primaryText, fontSize: 13, fontWeight: '700' },
    disabled: { opacity: 0.38 },
  });
}
