import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalBackdrop } from '../../components/ModalBackdrop';
import { PlayingCard } from '../../components/PlayingCard';
import { gradeMultiwayHand } from '../../domain/poker/decisionGrading';
import { useReducedMotion } from '../../hooks/useReducedMotion';
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
import { tableOverlayLayout, type TableOverlayLayout } from './tableOverlayLayout';

export function MultiwayHandReplayModal({
  hand,
  onClose,
}: {
  hand: MultiwaySessionHandRecord;
  onClose: () => void;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { fontScale, height, width } = useWindowDimensions();
  const layout = useMemo(
    () => tableOverlayLayout(width, height, fontScale),
    [fontScale, height, width],
  );
  const styles = useMemo(() => createStyles(palette, layout), [layout, palette]);
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
    <Modal animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} transparent visible>
      <View style={styles.scrim}>
        <ModalBackdrop accessibilityLabel={t('replay.close')} onPress={onClose} />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            layout.tablet && { height: Math.min(920, height - 48) },
            { paddingBottom: Math.max(layout.tablet ? 24 : 18, insets.bottom + 8) },
          ]}
        >
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

          <ScrollView
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            style={styles.body}
          >
            <View style={styles.table}>
              <View style={styles.opponents}>
                {hand.game.tablePlayerIds.filter((playerId) => playerId !== 'hero').map((playerId) => {
                const player = hand.game.players[playerId];
                if (!player) return null;
                const visibleCards = replayVisibleCards(player, step);
                const folded = step.foldedPlayerIds.includes(playerId);
                return (
                  <View accessible accessibilityLabel={`${player.name}, ${formatChipsCompact(step.stacks[playerId] ?? 0)}${folded ? `, ${t('multiway.state.folded')}` : ''}`} key={playerId} style={[styles.player, folded && styles.folded]}>
                    <Text numberOfLines={layout.tablet ? 2 : 1} style={styles.playerName}>{player.name} · {player.position}</Text>
                    <View style={styles.cards}>
                      {Array.from({ length: 2 }, (_, index) => (
                        <PlayingCard card={visibleCards[index]} compact={layout.tablet} hidden={visibleCards.length === 0} key={`${playerId}-${index}`} mini={!layout.tablet} />
                      ))}
                    </View>
                    <Text numberOfLines={layout.tablet ? 2 : 1} style={styles.stack}>{formatChipsCompact(step.stacks[playerId] ?? 0)}{folded ? ` · ${t('multiway.state.folded')}` : ''}</Text>
                  </View>
                );
                })}
              </View>

              <View style={styles.center}>
                <View style={styles.potPill}><Text style={styles.potText}>{t('table.pot', { amount: formatChips(step.pot) })}</Text></View>
                <View style={styles.board}>
                  {Array.from({ length: 5 }, (_, index) => <PlayingCard card={step.board[index]} compact={!layout.tablet} key={`replay-board-${index}`} />)}
                </View>
                <View style={styles.actionCard}>
                  <Text style={styles.actionStreet}>{localizedStreet(step.street, t)}</Text>
                  <Text style={styles.actionText}>{localizedMultiwayReplayDescription(step, hand.game, t)}</Text>
                </View>
              </View>

              <View style={styles.hero}>
                <View style={styles.cards}>
                  {hand.game.players.hero?.holeCards.map((card, index) => <PlayingCard card={card} compact={!layout.tablet} key={`hero-${index}`} />)}
                </View>
                <Text style={styles.heroName}>{t('common.you')} · {formatChips(step.stacks.hero ?? 0)}</Text>
              </View>
            </View>

            {comparison ? <DecisionReviewCard compact={!layout.tablet} comparison={comparison} tablet={layout.tablet} /> : null}
          </ScrollView>

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

function createStyles(palette: ThemePalette, layout: TableOverlayLayout) {
  const { compactHeight: compact, largeText, tablet } = layout;
  return StyleSheet.create({
    scrim: { flex: 1, alignItems: tablet ? 'center' : 'stretch', justifyContent: tablet ? 'center' : 'flex-end', padding: tablet ? 24 : 12, backgroundColor: palette.scrim },
    sheet: { width: '100%', maxWidth: tablet ? 840 : undefined, height: tablet ? undefined : compact ? '96%' : '92%', gap: tablet ? 17 : compact ? 10 : 14, padding: tablet ? 24 : compact ? 14 : 18, borderRadius: tablet ? 28 : 24, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerCopy: { flex: 1, minWidth: 0 },
    eyebrow: { color: palette.primary, fontSize: tablet ? 12 : 9, lineHeight: tablet ? 17 : 13, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: tablet ? 27 : 20, lineHeight: tablet ? 34 : 26, fontWeight: '700', marginTop: 3 },
    closeButton: { width: tablet ? 46 : 38, height: tablet ? 46 : 38, alignItems: 'center', justifyContent: 'center', borderRadius: tablet ? 15 : 13, backgroundColor: palette.soft },
    progressRow: { flexDirection: largeText && !tablet ? 'column' : 'row', alignItems: largeText && !tablet ? 'stretch' : 'center', gap: tablet ? 12 : 10 },
    progressText: { minWidth: tablet ? 80 : 62, color: palette.muted, fontSize: tablet ? 12 : 9, lineHeight: tablet ? 17 : 13 },
    progressTrack: { flex: 1, height: 4, overflow: 'hidden', borderRadius: 2, backgroundColor: palette.soft },
    progressFill: { height: 4, borderRadius: 2, backgroundColor: palette.primary },
    body: { flex: 1, minHeight: 0 },
    bodyContent: { flexGrow: 1, gap: tablet ? 14 : 10, paddingBottom: 2 },
    table: { minHeight: tablet ? 520 : compact ? 360 : 440, gap: tablet ? 14 : compact ? 7 : 10, justifyContent: 'space-between', paddingVertical: tablet ? 18 : compact ? 10 : 14, paddingHorizontal: tablet ? 14 : 10, borderRadius: tablet ? 28 : 24, backgroundColor: palette.table, borderWidth: 1, borderColor: palette.tableLine },
    opponents: { flexDirection: 'row', justifyContent: 'center', gap: tablet ? 7 : compact ? 3 : 5, paddingHorizontal: 2 },
    player: { flex: 1, minWidth: 0, maxWidth: tablet ? 128 : 82, alignItems: 'center', gap: tablet ? 5 : 3, paddingHorizontal: tablet ? 5 : 2, paddingVertical: tablet ? 7 : compact ? 3 : 5, borderRadius: tablet ? 14 : 11, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    folded: { opacity: 0.48 },
    playerName: { color: palette.tableText, fontSize: tablet ? 12 : compact ? 7 : 7.5, lineHeight: tablet ? 17 : 10, fontWeight: '700', textAlign: 'center' },
    cards: { flexDirection: 'row', gap: tablet ? 5 : 3 },
    stack: { color: palette.tableText, fontSize: tablet ? 10.5 : compact ? 6.5 : 7, lineHeight: tablet ? 15 : 10, textAlign: 'center' },
    center: { minHeight: tablet ? 240 : 190, alignItems: 'center', justifyContent: 'center', gap: tablet ? 12 : compact ? 6 : 9 },
    potPill: { paddingHorizontal: tablet ? 13 : 9, paddingVertical: tablet ? 6 : 4, borderRadius: tablet ? 11 : 9, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    potText: { color: palette.tableText, fontSize: tablet ? 12 : 9, lineHeight: tablet ? 17 : 13, fontWeight: '700' },
    board: { flexDirection: 'row', gap: tablet ? 5 : 3 },
    actionCard: { width: tablet ? '78%' : '90%', gap: tablet ? 5 : 3, paddingHorizontal: tablet ? 16 : 10, paddingVertical: tablet ? 11 : 7, borderRadius: tablet ? 14 : 11, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    actionStreet: { color: palette.aqua, fontSize: tablet ? 11 : 8, lineHeight: tablet ? 16 : 12, fontWeight: '700', textAlign: 'center', textTransform: 'uppercase' },
    actionText: { color: palette.tableText, fontSize: tablet ? 13 : 9, lineHeight: tablet ? 19 : 13, textAlign: 'center' },
    hero: { alignItems: 'center', gap: tablet ? 6 : 3 },
    heroName: { color: palette.tableText, fontSize: tablet ? 14 : 9, lineHeight: tablet ? 20 : 13, fontWeight: '700' },
    controls: { flexDirection: largeText && !tablet ? 'column' : 'row', gap: tablet ? 10 : 8 },
    secondaryButton: { flex: largeText && !tablet ? undefined : 1, minHeight: tablet ? 58 : 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tablet ? 6 : 4, paddingVertical: 8, borderRadius: tablet ? 15 : 13, backgroundColor: palette.soft },
    secondaryText: { color: palette.text, fontSize: tablet ? 15 : 13, fontWeight: '700' },
    primaryButton: { flex: largeText && !tablet ? undefined : 1, minHeight: tablet ? 58 : 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tablet ? 6 : 4, paddingVertical: 8, borderRadius: tablet ? 15 : 13, backgroundColor: palette.primary },
    primaryText: { color: palette.primaryText, fontSize: tablet ? 15 : 13, fontWeight: '700' },
    disabled: { opacity: 0.38 },
  });
}
