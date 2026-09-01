import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { cardLabel } from '../../domain/poker/cards';
import { TABLE_MOMENT_CATALOG } from '../../domain/multiplayer/tableMoments';
import { formatChips } from '../../domain/poker/moneyFormat';
import { type MessageKey, useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import { localizedStreet } from './localizedGameplay';
import { mergeTableActivityEvents, type TableActivityEvent } from './tableActivity';

export function TableActivityFeed({
  events,
  handKey,
  mode,
}: {
  events: readonly TableActivityEvent[];
  handKey: string;
  mode: 'disclosure' | 'rail';
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ events: TableActivityEvent[]; handKey: string }>(() => ({
    events: [...events],
    handKey,
  }));
  const scroll = useRef<ScrollView | null>(null);

  useEffect(() => {
    setState((current) => current.handKey === handKey
      ? { events: mergeTableActivityEvents(current.events, events), handKey }
      : { events: [...events], handKey });
  }, [events, handKey]);

  const panel = (
    <View style={[styles.panel, mode === 'rail' ? styles.panelRail : styles.panelSheet]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons color={palette.primary} name="list-outline" size={15} />
          <Text accessibilityRole="header" style={styles.title}>{t('table.feed.title')}</Text>
        </View>
        {mode === 'disclosure' ? (
          <Pressable accessibilityLabel={t('table.feed.close')} accessibilityRole="button" onPress={() => setOpen(false)} style={styles.close}>
            <Ionicons color={palette.muted} name="close" size={15} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        ref={scroll}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        {state.events.length === 0 ? (
          <Text style={styles.empty}>{t('table.feed.empty')}</Text>
        ) : state.events.map((event) => (
          <ActivityRow event={event} key={event.id} styles={styles} />
        ))}
      </ScrollView>
    </View>
  );

  if (mode === 'rail') return panel;
  return (
    <View style={styles.disclosure}>
      <Pressable
        accessibilityLabel={t('table.feed.open')}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.openButton, pressed && styles.pressed]}
      >
        <Ionicons color={palette.primary} name="list-outline" size={19} />
        {state.events.length > 0 ? <Text style={styles.count}>{state.events.length}</Text> : null}
      </Pressable>
      <Modal animationType="fade" onRequestClose={() => setOpen(false)} transparent visible={open}>
        <View style={styles.modalRoot}>
          <Pressable accessibilityLabel={t('table.feed.close')} accessibilityRole="button" onPress={() => setOpen(false)} style={StyleSheet.absoluteFill} />
          {panel}
        </View>
      </Modal>
    </View>
  );
}

function ActivityRow({
  event,
  styles,
}: {
  event: TableActivityEvent;
  styles: ReturnType<typeof createStyles>;
}) {
  const { t } = useLocalization();
  const label = activityLabel(event, t);
  const icon = event.kind === 'moment'
    ? 'happy-outline'
    : event.kind === 'award' || event.kind === 'result'
      ? 'trophy-outline'
      : event.kind === 'board' || event.kind === 'street'
        ? 'layers-outline'
        : event.allIn ? 'flame-outline' : 'radio-button-on-outline';
  return (
    <View style={styles.row}>
      <Ionicons color={event.allIn ? '#D45C5C' : '#6B8F9A'} name={icon} size={12} />
      <Text numberOfLines={2} style={styles.rowText}>{label}</Text>
    </View>
  );
}

function activityLabel(
  event: TableActivityEvent,
  t: ReturnType<typeof useLocalization>['t'],
): string {
  if (event.kind === 'street' && event.street) {
    return t('table.feed.street', { street: localizedStreet(event.street, t) });
  }
  if (event.kind === 'board' && event.street) {
    return t('table.feed.board', {
      cards: (event.cards ?? []).map(cardLabel).join(' '),
      street: localizedStreet(event.street, t),
    });
  }
  if (event.kind === 'moment' && event.reactionId) {
    const phraseKey = TABLE_MOMENT_CATALOG[event.reactionId].phraseKey as MessageKey;
    return t('table.feed.moment', { name: event.playerName ?? '', phrase: t(phraseKey) });
  }
  if (event.kind === 'award') {
    return t('table.feed.award', {
      amount: formatChips(event.amount ?? 0),
      names: event.winnerNames?.join(', ') ?? '',
    });
  }
  if (event.kind === 'result') {
    return (event.winnerNames?.length ?? 0) > 0
      ? t('table.feed.result', {
        amount: formatChips(event.amount ?? 0),
        names: event.winnerNames!.join(', '),
      })
      : t('table.feed.split', { amount: formatChips(event.amount ?? 0) });
  }
  const action = event.action === 'fold'
    ? t('poker.action.fold')
    : event.action === 'check'
      ? t('poker.action.check')
      : event.action === 'call'
        ? t('poker.action.callAmount', { amount: formatChips(event.amount ?? 0) })
        : t(event.aggression === 'bet' ? 'poker.action.betAmount' : 'poker.action.raiseTo', {
          amount: formatChips(event.amount ?? 0),
        });
  return event.allIn
    ? t('table.feed.playerAllIn', { action, name: event.playerName ?? '' })
    : t('table.feed.playerAction', { action, name: event.playerName ?? '' });
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    close: { alignItems: 'center', height: 28, justifyContent: 'center', width: 28 },
    content: { gap: 7, paddingBottom: 2 },
    count: { position: 'absolute', right: 2, top: 2, minWidth: 15, height: 15, paddingHorizontal: 3, borderRadius: 8, overflow: 'hidden', textAlign: 'center', color: palette.primaryText, backgroundColor: palette.primary, fontSize: 8, lineHeight: 15, fontWeight: '900' },
    disclosure: { flexShrink: 0 },
    empty: { color: palette.muted, fontSize: 10, lineHeight: 14, paddingVertical: 6 },
    header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    modalRoot: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 14, paddingBottom: 28, backgroundColor: 'rgba(0,0,0,0.46)' },
    openButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 12, borderWidth: 1, height: 44, width: 44 },
    panel: { backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 14, borderWidth: 1, gap: 7, maxHeight: 150, minHeight: 88, padding: 9 },
    panelRail: { flex: 1, maxHeight: undefined, minHeight: 72 },
    panelSheet: { maxHeight: 420, minHeight: 210, padding: 14 },
    pressed: { opacity: 0.68 },
    row: { alignItems: 'flex-start', flexDirection: 'row', gap: 6, minHeight: 20 },
    rowText: { color: palette.text, flex: 1, fontSize: 9.5, fontWeight: '600', lineHeight: 13 },
    scroll: { flex: 1 },
    title: { color: palette.text, fontSize: 11, fontWeight: '900' },
    titleRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  });
}
