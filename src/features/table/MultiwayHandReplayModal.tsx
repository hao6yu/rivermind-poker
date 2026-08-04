import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalBackdrop } from '../../components/ModalBackdrop';
import { PlayingCard } from '../../components/PlayingCard';
import { gradeMultiwayHand } from '../../domain/poker/decisionGrading';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import {
  buildMultiwayReplaySteps,
  replayVisibleCards,
} from './multiwayGameplayPresentation';
import type { MultiwaySessionHandRecord } from './sessionModels';
import { DecisionReviewCard } from './DecisionReviewCard';
import {
  localizedMultiwayReplayDescription,
  localizedMultiwayReplayTitle,
  localizedStreet,
} from './localizedGameplay';
import { formatChips, formatChipsCompact } from '../../domain/poker/moneyFormat';

export function MultiwayHandReplayModal({
  hand,
  onClose,
}: {
  hand: MultiwaySessionHandRecord;
  onClose: () => void;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height < 720;
  const styles = useMemo(() => createStyles(palette, compact), [compact, palette]);
  const steps = useMemo(() => buildMultiwayReplaySteps(hand.game), [hand.game]);
  const decisionReport = useMemo(() => gradeMultiwayHand(hand.game), [hand.game]);
  const [stepIndex, setStepIndex] = useState(0);
  useEffect(() => setStepIndex(0), [hand.clientId]);
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
        <ModalBackdrop accessibilityLabel={t('replay.close')} onPress={onClose} />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(18, insets.bottom + 8) }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{t('replay.multiwayHeader', { count: hand.game.tablePlayerIds.length, hand: hand.game.handNumber })}</Text>
              <Text accessibilityRole="header" style={styles.title}>{localizedMultiwayReplayTitle(step, hand.game, t)}</Text>
            </View>
            <Pressable accessibilityLabel={t('replay.close')} accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <Ionicons color={palette.text} name="close" size={20} />
            </Pressable>
          </View>

          <View
            accessibilityLabel={t('replay.progressA11y', { current: stepIndex + 1, total: steps.length })}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 1, max: steps.length, now: stepIndex + 1 }}
            style={styles.progressRow}
          >
            <Text style={styles.progressText}>{t('replay.progressCompact', { current: stepIndex + 1, total: steps.length })}</Text>
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
                  <View accessible accessibilityLabel={`${player.name}, ${formatChipsCompact(step.stacks[playerId] ?? 0)}${folded ? `, ${t('multiway.state.folded')}` : ''}`} key={playerId} style={[styles.player, folded && styles.folded]}>
                    <Text numberOfLines={1} style={styles.playerName}>{player.name} · {player.position}</Text>
                    <View style={styles.cards}>
                      {Array.from({ length: 2 }, (_, index) => (
                        <PlayingCard card={visibleCards[index]} hidden={visibleCards.length === 0} key={`${playerId}-${index}`} mini />
                      ))}
                    </View>
                    <Text numberOfLines={1} style={styles.stack}>{formatChipsCompact(step.stacks[playerId] ?? 0)}{folded ? ` · ${t('multiway.state.folded')}` : ''}</Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.center}>
              <View style={styles.potPill}><Text style={styles.potText}>{t('table.pot', { amount: formatChips(step.pot) })}</Text></View>
              <View style={styles.board}>
                {Array.from({ length: 5 }, (_, index) => <PlayingCard card={step.board[index]} compact key={`replay-board-${index}`} />)}
              </View>
              <View style={styles.actionCard}>
                <Text style={styles.actionStreet}>{localizedStreet(step.street, t)}</Text>
                <Text style={styles.actionText}>{localizedMultiwayReplayDescription(step, hand.game, t)}</Text>
              </View>
            </View>

            <View style={styles.hero}>
              <View style={styles.cards}>
                {hand.game.players.hero?.holeCards.map((card, index) => <PlayingCard card={card} compact key={`hero-${index}`} />)}
              </View>
              <Text style={styles.heroName}>{t('common.you')} · {formatChips(step.stacks.hero ?? 0)}</Text>
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
              style={[styles.secondaryButton, atStart && styles.disabled]}
            >
              <Ionicons color={palette.text} name="chevron-back" size={18} />
              <Text style={styles.secondaryText}>{t('common.previous')}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={atEnd ? t('replay.finishA11y') : t('replay.nextA11y')}
              accessibilityRole="button"
              onPress={atEnd ? onClose : () => setStepIndex((current) => Math.min(steps.length - 1, current + 1))}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryText}>{atEnd ? t('common.done') : t('replay.next')}</Text>
              {!atEnd ? <Ionicons color={palette.primaryText} name="chevron-forward" size={18} /> : null}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
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
