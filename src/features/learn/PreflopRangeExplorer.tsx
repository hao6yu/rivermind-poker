import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { TablePosition } from '../../domain/poker/multiway';
import {
  PREFLOP_RANKS,
  buildPreflopPlan,
  preflopGridCards,
  rankLabel,
  type PreflopFacing,
  type PreflopRangeCategory,
} from '../../domain/poker/preflopStrategy';
import { type MessageKey, useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';

const tableOptions = [2, 3, 6] as const;
const stackOptions = [20, 40, 100] as const;

const tablePositions: Record<(typeof tableOptions)[number], TablePosition[]> = {
  2: ['BTN/SB', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  6: ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
};

function availablePositions(playerCount: (typeof tableOptions)[number], facing: PreflopFacing): TablePosition[] {
  const positions = tablePositions[playerCount];
  return facing === 'unopened' ? positions.filter((position) => position !== 'BB') : positions;
}

export function PreflopRangeExplorer() {
  const { palette } = useAppTheme();
  const { language, t } = useLocalization();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [playerCount, setPlayerCount] = useState<(typeof tableOptions)[number]>(6);
  const [stackBb, setStackBb] = useState<(typeof stackOptions)[number]>(100);
  const [facing, setFacing] = useState<PreflopFacing>('unopened');
  const [position, setPosition] = useState<TablePosition>('BTN');
  const [selectedKey, setSelectedKey] = useState('AKs');
  const positions = availablePositions(playerCount, facing);
  const activePosition = positions.includes(position) ? position : positions[0]!;
  const cellSize = Math.max(19, Math.min(24, Math.floor((width - 64) / 13)));
  const matrix = useMemo(() => PREFLOP_RANKS.map((row) => (
    PREFLOP_RANKS.map((column) => {
      const cards = preflopGridCards(row, column);
      return buildPreflopPlan({
        cards,
        effectiveStackBb: stackBb,
        facing,
        playerCount,
        position: activePosition,
        raiseSizeBb: facing === 'raised' ? 2.5 : undefined,
      });
    })
  )), [activePosition, facing, playerCount, stackBb]);
  const selected = matrix.flat().find((plan) => plan.hand.key === selectedKey) ?? matrix[0]![1]!;
  const categoryLabel = (category: PreflopRangeCategory) => t(`range.${category}` as MessageKey);
  const explanation = language === 'en'
    ? selected.explanation
    : t(`range.explanation.${selected.category}` as MessageKey, { hand: selected.hand.key });

  const categoryColors: Record<PreflopRangeCategory, { background: string; text: string }> = {
    raise: { background: palette.primary, text: palette.primaryText },
    continue: { background: palette.aqua, text: palette.onAqua },
    mix: { background: palette.amber, text: palette.amberText },
    fold: { background: palette.soft, text: palette.muted },
  };

  const chooseTable = (count: (typeof tableOptions)[number]) => {
    const nextPositions = availablePositions(count, facing);
    setPlayerCount(count);
    if (!nextPositions.includes(position)) setPosition(nextPositions[0]!);
  };
  const chooseFacing = (nextFacing: PreflopFacing) => {
    const nextPositions = availablePositions(playerCount, nextFacing);
    setFacing(nextFacing);
    if (!nextPositions.includes(position)) setPosition(nextPositions[0]!);
  };

  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>{t('range.eyebrow')}</Text>
          <Text style={styles.title}>{t('range.title')}</Text>
        </View>
        <View style={styles.depthPill}><Text style={styles.depthText}>{t('common.bigBlinds', { count: stackBb })}</Text></View>
      </View>

      <Control label={t('range.players')}>
        {tableOptions.map((count) => (
          <Choice key={count} label={String(count)} onPress={() => chooseTable(count)} selected={playerCount === count} />
        ))}
      </Control>
      <Control label={t('range.action')}>
        <Choice label={t('range.firstIn')} onPress={() => chooseFacing('unopened')} selected={facing === 'unopened'} wide />
        <Choice label={t('range.facingRaise')} onPress={() => chooseFacing('raised')} selected={facing === 'raised'} wide />
      </Control>
      <Control label={t('range.position')}>
        {positions.map((item) => (
          <Choice key={item} label={item} onPress={() => setPosition(item)} selected={activePosition === item} />
        ))}
      </Control>
      <Control label={t('range.stack')}>
        {stackOptions.map((depth) => (
          <Choice
            accessibilityLabel={t('common.bigBlinds', { count: depth })}
            key={depth}
            label={String(depth)}
            onPress={() => setStackBb(depth)}
            selected={stackBb === depth}
          />
        ))}
      </Control>

      <View style={styles.matrixWrap}>
        {matrix.map((row, rowIndex) => (
          <View key={PREFLOP_RANKS[rowIndex]} style={styles.matrixRow}>
            {row.map((plan, columnIndex) => {
              const colors = categoryColors[plan.category];
              const selectedCell = plan.hand.key === selected.hand.key;
              return (
                <Pressable
                  accessibilityLabel={`${plan.hand.key}: ${categoryLabel(plan.category)}`}
                  accessibilityRole="button"
                  key={`${PREFLOP_RANKS[rowIndex]}-${PREFLOP_RANKS[columnIndex]}`}
                  onPress={() => setSelectedKey(plan.hand.key)}
                  style={[
                    styles.cell,
                    {
                      backgroundColor: colors.background,
                      borderColor: selectedCell ? palette.text : palette.background,
                      height: cellSize,
                      width: cellSize,
                    },
                    selectedCell && styles.selectedCell,
                  ]}
                >
                  <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.cellText, { color: colors.text }]}>{plan.hand.key}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        {(['raise', 'continue', 'mix', 'fold'] as const).map((category) => (
          <View key={category} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: categoryColors[category].background }]} />
            <Text style={styles.legendText}>{categoryLabel(category)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.selectionCard}>
        <View style={styles.selectionHeading}>
          <Text style={styles.handKey}>{selected.hand.key}</Text>
          <Text style={[styles.actionPill, { backgroundColor: categoryColors[selected.category].background, color: categoryColors[selected.category].text }]}>
            {categoryLabel(selected.category)}
          </Text>
        </View>
        <Text style={styles.explanation}>{explanation}</Text>
        {selected.category === 'mix' ? (
          <Text style={styles.frequencies}>
            {t('range.frequencies', {
              call: Math.round(selected.frequencies.call * 100),
              check: Math.round(selected.frequencies.check * 100),
              fold: Math.round(selected.frequencies.fold * 100),
              raise: Math.round(selected.frequencies.raise * 100),
            })}
          </Text>
        ) : null}
      </View>

      <Text style={styles.axisNote}>{t('range.axisNote')}</Text>
    </View>
  );
}

function Control({ children, label }: { children: React.ReactNode; label: string }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.controlRow}>
      <Text style={styles.controlLabel}>{label}</Text>
      <View style={styles.choiceRow}>{children}</View>
    </View>
  );
}

function Choice({ accessibilityLabel, label, onPress, selected, wide = false }: { accessibilityLabel?: string; label: string; onPress: () => void; selected: boolean; wide?: boolean }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, wide && styles.choiceWide, selected && styles.choiceSelected, pressed && styles.pressed]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    card: { gap: 12, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    headingCopy: { flex: 1, minWidth: 0 },
    eyebrow: { color: palette.primary, fontSize: 9, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 18, fontWeight: '800', marginTop: 3 },
    depthPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: palette.accentSoft },
    depthText: { color: palette.primary, fontSize: 11, fontWeight: '800' },
    controlRow: { gap: 6 },
    controlLabel: { color: palette.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
    choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    choice: { minWidth: 40, minHeight: 31, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised },
    choiceWide: { minWidth: 76 },
    choiceSelected: { borderColor: palette.primary, backgroundColor: palette.accentSoft },
    choiceText: { flexShrink: 1, color: palette.muted, fontSize: 10, lineHeight: 14, fontWeight: '700', textAlign: 'center' },
    choiceTextSelected: { color: palette.primary },
    matrixWrap: { alignSelf: 'center', borderRadius: 6, overflow: 'hidden', backgroundColor: palette.background },
    matrixRow: { flexDirection: 'row' },
    cell: { alignItems: 'center', justifyContent: 'center', borderWidth: 0.5 },
    selectedCell: { borderWidth: 2 },
    cellText: { fontSize: 7, fontWeight: '800', letterSpacing: -0.3 },
    legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendDot: { width: 8, height: 8, borderRadius: 3 },
    legendText: { color: palette.muted, fontSize: 9, fontWeight: '700' },
    selectionCard: { gap: 7, padding: 12, borderRadius: 14, backgroundColor: palette.soft },
    selectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    handKey: { color: palette.text, fontSize: 20, fontWeight: '900' },
    actionPill: { overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
    explanation: { color: palette.text, fontSize: 11, lineHeight: 17 },
    frequencies: { color: palette.muted, fontSize: 10, lineHeight: 15, fontWeight: '700' },
    axisNote: { color: palette.muted, fontSize: 9, lineHeight: 14, textAlign: 'center' },
    pressed: { opacity: 0.74 },
  });
}
