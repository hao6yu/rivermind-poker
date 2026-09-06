import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import {
  CHAMPIONSHIP_EVENTS, CHAMPIONSHIP_INVITATION_EVENTS, championshipCurrentEvent,
  championshipEvent, championshipEventIsUnlocked, championshipEventProgress,
  championshipInvitationIsUnlocked, championshipLineupCounts, championshipQualifiedCount,
  type ChampionshipCheckpoint, type ChampionshipEvent, type ChampionshipProgress,
} from '../../domain/poker/championship';
import { formatChips } from '../../domain/poker/moneyFormat';
import { SIT_AND_GO_INITIAL_BIG_BLIND, SIT_AND_GO_STRUCTURES } from '../../domain/poker/tournament';
import { championshipEventText, championshipStageText } from '../../localization/championship';
import { useLocalization } from '../../localization';
import { type ThemePalette, championshipPalette } from '../../themePalette';
import { ChampionshipVenuePreview } from './ChampionshipVenuePreview';
import { ModalSafeArea } from '../learn/ModalSafeArea';
import { ChampionshipRecordView } from './ChampionshipRecordModal';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { ChampionshipMap, type ChampionshipMapSelection } from './ChampionshipMap';
import { championshipMapLayout, championshipVisibleEvents } from './championshipMapModel';
import { useChampionshipOrientation } from './useChampionshipOrientation';

interface ChampionshipModalProps {
  checkpoint: ChampionshipCheckpoint | null;
  onClose: () => void;
  onCloseRecord: () => void;
  onOpenRecord: () => void;
  onSelectEvent: (event: ChampionshipEvent) => void;
  progress: ChampionshipProgress;
  recordVisible: boolean;
  visible: boolean;
}

export function ChampionshipModal(props: ChampionshipModalProps) {
  const reduceMotion = useReducedMotion();
  useChampionshipOrientation(props.visible);
  const backAction = useRef<(() => void) | null>(null);
  return (
    <Modal supportedOrientations={['portrait', 'landscape-left', 'landscape-right']} animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={() => {
      if (props.recordVisible) props.onCloseRecord();
      else if (backAction.current) backAction.current();
      else props.onClose();
    }} visible={props.visible}>
      <ModalSafeArea backgroundColor={championshipPalette.background}>
        {props.visible && <StatusBar style="light" />}
        {props.recordVisible ? <ChampionshipRecordView onClose={props.onCloseRecord} progress={props.progress} />
          : props.visible ? <ChampionshipJourney {...props} backAction={backAction} /> : null}
      </ModalSafeArea>
    </Modal>
  );
}

export function ChampionshipJourney({ checkpoint, onClose, onOpenRecord, onSelectEvent, progress, backAction }: ChampionshipModalProps & { backAction?: RefObject<(() => void) | null> }) {
  const palette = championshipPalette;
  const { t, tCount } = useLocalization();
  const { width, height } = useWindowDimensions();
  const compact = width > height && height < 500;
  const styles = useMemo(() => createStyles(palette, compact), [palette, compact]);
  const current = championshipCurrentEvent(progress);
  const [selected, setSelected] = useState<ChampionshipMapSelection>(() => checkpoint && championshipEventIsUnlocked(progress, checkpoint.eventId) ? checkpoint.eventId : current.id);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [list, setList] = useState(false);
  const side = championshipMapLayout(width, height).sidePanel;
  const roomUnlocked = championshipInvitationIsUnlocked(progress);
  const events = championshipVisibleEvents(progress);
  // If progress is reset externally, never keep a formerly revealed invitation on screen.
  const safeSelection = selected === 'private_room' || events.some((event) => event.id === selected) ? selected : current.id;
  const event = safeSelection === 'private_room' ? null : championshipEvent(safeSelection);
  const qualified = championshipQualifiedCount(progress);
  const choose = (selection: ChampionshipMapSelection) => { setSelected(selection); setDetailsOpen(true); };
  useEffect(() => { if (side) setDetailsOpen(false); }, [side]);
  useEffect(() => {
    if (!backAction) return;
    backAction.current = !side && detailsOpen ? () => setDetailsOpen(false) : null;
    return () => { backAction.current = null; };
  }, [backAction, detailsOpen, side]);
  const selectedTitle = event ? championshipEventText(event, 'title', t) : t(roomUnlocked ? 'championship.map.privateRoom' : 'championship.map.secret');
  const closeDetails = () => setDetailsOpen(false);

  const details = (
    <View style={[styles.details, side ? styles.sideDetails : styles.sheet]} testID="championship.details" accessibilityViewIsModal={!side}>
      <View style={styles.detailsHeader}>
        <Text accessibilityRole="header" style={styles.eyebrow}>{t(event ? 'championship.map.details' : roomUnlocked ? 'championship.invitation' : 'championship.map.secret')}</Text>
        {!side && <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={closeDetails} style={styles.iconButton} testID="championship.details.close"><Ionicons name="close" color={palette.text} size={22} /></Pressable>}
      </View>
      <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator>
        {!compact && <ChampionshipVenuePreview selection={safeSelection} />}
        {event && <Text style={styles.eyebrow}>{event.invitational ? t('championship.map.privateRoom') : t('championship.map.stop', { number: CHAMPIONSHIP_EVENTS.findIndex((item) => item.id === event.id) + 1 })}</Text>}
        <Text accessibilityRole="header" style={styles.eventTitle}>{selectedTitle}</Text>
        {event ? <EventDetails event={event} checkpoint={checkpoint} progress={progress} /> : <>
          <Text style={styles.description}>{t(roomUnlocked ? 'championship.map.invitation' : 'championship.map.secretHint')}</Text>
          {roomUnlocked && <>
            <Text style={styles.status}>{t('championship.map.secretProgress', { count: CHAMPIONSHIP_INVITATION_EVENTS.filter((item) => championshipEventProgress(progress, item.id)?.qualifiedAt).length, total: CHAMPIONSHIP_INVITATION_EVENTS.length })}</Text>
            {events.filter((item) => item.invitational).map((invitation) => <Pressable key={invitation.id} testID={`championship.invitation.${invitation.id}`} accessibilityRole="button" onPress={() => choose(invitation.id)} style={styles.listCard}>
              <View style={styles.grow}><Text style={styles.cardTitle}>{championshipEventText(invitation, 'title', t)}</Text><Text style={styles.description}>{tCount('common.players', invitation.playerCount)}</Text></View>
              <Ionicons name="chevron-forward" size={20} color={palette.primary} />
            </Pressable>)}
          </>}
        </>}
      </ScrollView>
      {event && <EventAction event={event} checkpoint={checkpoint} progress={progress} onSelectEvent={onSelectEvent} />}
    </View>
  );

  return (
    <View accessibilityViewIsModal style={styles.screen} onAccessibilityEscape={detailsOpen ? closeDetails : onClose}>
      <View style={styles.screen} accessibilityElementsHidden={!side && detailsOpen} importantForAccessibility={!side && detailsOpen ? 'no-hide-descendants' : 'auto'}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('championship.close')} onPress={onClose} style={styles.iconButton}><Ionicons name="arrow-back" color={palette.text} size={22} /></Pressable>
          <View style={styles.headerCopy}><Text numberOfLines={1} style={styles.eyebrow}>{t('championship.map.road')}</Text><Text accessibilityRole="header" numberOfLines={2} style={styles.title}>{t('championship.title')}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('championship.viewRecord')} onPress={onOpenRecord} style={styles.iconButton}><Ionicons name="ribbon-outline" color={palette.primary} size={22} /></Pressable>
        </View>
        <View style={styles.toolbar}>
          <Text accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 10, now: qualified }} accessibilityLabel={t('championship.progressA11y', { qualified, total: 10 })} style={styles.progress}>{qualified}/10 · {t(qualified === 10 ? 'championship.tourComplete' : 'championship.journey')}</Text>
          <View style={styles.toggle}>{([false, true] as const).map((isList) => <Pressable key={String(isList)} testID={`championship.view.${isList ? 'list' : 'map'}`} accessibilityRole="button" accessibilityState={{ selected: list === isList }} accessibilityLabel={t(isList ? 'championship.map.list' : 'championship.map.map')} onPress={() => setList(isList)} style={[styles.toggleButton, list === isList && styles.toggleSelected]}><Ionicons name={isList ? 'list' : 'map-outline'} size={20} color={list === isList ? palette.primary : palette.muted} /></Pressable>)}</View>
        </View>
        <View style={[styles.body, side && styles.bodySide]}>
          {list ? <ScrollView style={styles.mapPane} contentContainerStyle={styles.listContent}>
            {events.filter((item) => !item.invitational).map((item, index) => {
              const unlocked = championshipEventIsUnlocked(progress, item.id);
              const cleared = Boolean(championshipEventProgress(progress, item.id)?.qualifiedAt);
              return <Pressable key={item.id} testID={`championship.event.${item.id}`} accessibilityRole="button" accessibilityState={{ selected: selected === item.id }} onPress={() => choose(item.id)} style={[styles.listCard, selected === item.id && styles.selectedCard]}>
                <Text style={styles.listNumber}>{index + 1}</Text><View style={styles.grow}><Text style={styles.cardTitle}>{championshipEventText(item, 'title', t)}</Text><Text style={styles.description}>{t(cleared ? 'championship.circuit.cleared' : unlocked ? 'championship.currentStop' : 'championship.previousStop')}</Text></View><Ionicons name={cleared ? 'checkmark-circle' : unlocked ? 'chevron-forward' : 'lock-closed-outline'} size={20} color={palette.primary} />
              </Pressable>;
            })}
            <Pressable testID="championship.secret" accessibilityRole="button" onPress={() => choose('private_room')} style={styles.listCard}><Ionicons name={roomUnlocked ? 'key-outline' : 'help-circle-outline'} color={palette.primary} size={25} /><Text style={styles.cardTitle}>{t(roomUnlocked ? 'championship.map.privateRoom' : 'championship.map.secret')}</Text></Pressable>
          </ScrollView> : <ChampionshipMap progress={progress} currentId={current.id} selected={safeSelection} onSelect={choose} />}
          {side && details}
        </View>
        {!side && <Pressable accessibilityRole="button" accessibilityLabel={`${selectedTitle}. ${t('championship.map.details')}`} testID="championship.details.open" style={styles.selectionBar} onPress={() => setDetailsOpen(true)}><Ionicons name={event ? 'location-outline' : 'help-circle-outline'} size={24} color={palette.primary} /><View style={styles.grow}><Text style={styles.eyebrow}>{t('championship.map.details')}</Text><Text numberOfLines={2} style={styles.cardTitle}>{selectedTitle}</Text></View><Ionicons name="chevron-up" size={22} color={palette.primary} /></Pressable>}
      </View>
      {!side && detailsOpen && <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={closeDetails} style={styles.scrim} />
        {details}
      </View>}
    </View>
  );
}

function EventDetails({ event, checkpoint, progress }: { event: ChampionshipEvent; checkpoint: ChampionshipCheckpoint | null; progress: ChampionshipProgress }) {
  const palette = championshipPalette;
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { t, tCount } = useLocalization();
  const result = championshipEventProgress(progress, event.id);
  const saved = checkpoint?.eventId === event.id;
  const unlocked = championshipEventIsUnlocked(progress, event.id);
  const previous = CHAMPIONSHIP_EVENTS[CHAMPIONSHIP_EVENTS.findIndex((item) => item.id === event.id) - 1];
  const lineup = championshipLineupCounts(event).map(({ count, difficulty }) => t('championship.lineupTier', { count, difficulty: t(`difficulty.${difficulty}`) })).join(' · ');
  const chips = formatChips(SIT_AND_GO_STRUCTURES[event.structureId].startingStackBb * SIT_AND_GO_INITIAL_BIG_BLIND);
  return <>
    <Text style={styles.location}>{event.invitational ? t('championship.map.privateRoom') : event.stage === 'final' ? t('championship.map.vegas') : championshipStageText(event.stage, 'title', t)}</Text>
    <Text style={styles.description}>{championshipEventText(event, 'description', t)}</Text>
    <View style={styles.facts}><Text style={styles.cardTitle}>{tCount('common.players', event.playerCount)}</Text><Text style={styles.description}>{t('setup.startingStackA11y', { stack: chips })}</Text>{event.turnClockSeconds && <Text style={styles.description}>{t('championship.map.turnClock', { seconds: event.turnClockSeconds })}</Text>}</View>
    <Text style={styles.eyebrow}>{t('championship.lineup')}</Text><Text style={styles.description}>{lineup}</Text>
    <Text style={styles.status}>{t(event.invitational ? 'championship.invitationStatus' : 'championship.qualifyStatus', { place: t('summary.placeNumber', { place: event.qualifyingPlace }) })}</Text>
    {!unlocked && previous && <Text testID="championship.unlockRequirement" style={styles.lockedNote}>{t('championship.map.unlock', { event: championshipEventText(previous, 'title', t), requirement: t('championship.qualifyStatus', { place: t('summary.placeNumber', { place: previous.qualifyingPlace }) }) })}</Text>}
    {saved && <Text style={styles.status}>{t('championship.continueHand', { hand: checkpoint.tournament.nextHandNumber })}</Text>}
    {result && <Text style={styles.description}>{tCount('championship.bestRuns', result.attempts, { place: t('summary.placeNumber', { place: result.bestPlace }) })}</Text>}
    <Text style={styles.fairNote}>{t('championship.fairNote')}</Text>
  </>;
}

function EventAction({ event, checkpoint, progress, onSelectEvent }: { event: ChampionshipEvent; checkpoint: ChampionshipCheckpoint | null; progress: ChampionshipProgress; onSelectEvent: (event: ChampionshipEvent) => void }) {
  const palette = championshipPalette;
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { t } = useLocalization();
  const unlocked = championshipEventIsUnlocked(progress, event.id);
  const actionKey = checkpoint?.eventId === event.id ? 'championship.map.resume' : championshipEventProgress(progress, event.id) ? 'championship.map.replay' : 'championship.map.play';
  return <View style={styles.actionFooter}><Pressable testID="championship.play" accessibilityRole="button" accessibilityState={{ disabled: !unlocked }} disabled={!unlocked} onPress={() => { if (unlocked) onSelectEvent(event); }} style={({ pressed }) => [styles.action, !unlocked && styles.disabledAction, pressed && styles.pressed]}><Text style={[styles.actionText, !unlocked && { color: palette.muted }]}>{t(unlocked ? actionKey : 'championship.record.locked')}</Text></Pressable></View>;
}

function createStyles(palette: ThemePalette, compact = false) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: compact ? 2 : 8 },
    iconButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 16, backgroundColor: palette.surface },
    headerCopy: { flex: 1, minWidth: 0, alignItems: 'center', gap: 4 },
    title: { color: palette.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
    eyebrow: { color: palette.primary, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
    toolbar: { paddingHorizontal: 16, paddingBottom: compact ? 2 : 8, flexDirection: 'row', gap: 8, alignItems: 'center' },
    progress: { color: palette.muted, fontSize: 12, fontWeight: '700', flex: 1 },
    toggle: { flexDirection: 'row', borderRadius: 12, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, padding: 2 },
    toggleButton: { minWidth: 44, minHeight: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 12 }, toggleSelected: { backgroundColor: palette.accentSoft },
    body: { flex: 1, minHeight: 0 }, bodySide: { flexDirection: 'row' },
    mapPane: { flex: 1, minWidth: 0 },
    listContent: { padding: 12, gap: 12 },
    listCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, minHeight: 74, backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border },
    selectedCard: { borderColor: palette.primary, backgroundColor: palette.accentSoft },
    listNumber: { color: palette.primary, fontWeight: '800', fontSize: 20, minWidth: 25 },
    grow: { flex: 1, minWidth: 0, gap: 4 }, cardTitle: { color: palette.text, fontSize: 15, lineHeight: 21, fontWeight: '700', flexShrink: 1 },
    selectionBar: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, minHeight: 74, backgroundColor: palette.surface, borderTopWidth: 1, borderTopColor: palette.border },
    details: { backgroundColor: palette.surface, minHeight: 0 },
    sideDetails: { width: '38%', maxWidth: 440, borderLeftWidth: 1, borderColor: palette.border },
    sheet: { borderWidth: 1, borderColor: palette.border, maxHeight: '88%', width: '100%', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
    detailsHeader: { borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.background, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, minHeight: 44 },
    detailScroll: { flexShrink: 1, minHeight: 0 }, detailContent: { padding: compact ? 12 : 20, paddingTop: 6, gap: compact ? 8 : 16, paddingBottom: compact ? 12 : 24 },
    detailBadge: { width: 56, height: 56, backgroundColor: palette.accentSoft, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    goldBadge: { backgroundColor: palette.accentSoft },
    eventTitle: { color: palette.text, fontSize: compact ? 20 : 22, fontWeight: '800', lineHeight: compact ? 26 : 28 },
    location: { color: palette.primary, fontSize: 14, fontWeight: '700' },
    description: { color: palette.muted, fontSize: 14, lineHeight: 21 },
    facts: { borderWidth: 1, borderColor: palette.border, backgroundColor: palette.soft, padding: 16, borderRadius: 16, gap: 5 },
    status: { color: palette.primary, fontSize: 14, fontWeight: '800', lineHeight: 21 },
    lockedNote: { backgroundColor: palette.soft, padding: 16, borderRadius: 12, color: palette.text, fontSize: 14, lineHeight: 21 },
    fairNote: { color: palette.muted, fontSize: 12, lineHeight: 18 },
    actionFooter: { padding: 16, borderTopWidth: 1, borderColor: palette.border, flexShrink: 0 },
    action: { minHeight: 52, padding: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.primary },
    actionText: { color: palette.primaryText, fontSize: 16, lineHeight: 22, fontWeight: '800', textAlign: 'center' },
    disabledAction: { backgroundColor: palette.soft },
    overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
    scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: palette.scrim },
    pressed: { opacity: 0.72 },
  });
}
