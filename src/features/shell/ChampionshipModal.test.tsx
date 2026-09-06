import { createElement, type ReactNode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { ChampionshipJourney, ChampionshipModal } from './ChampionshipModal';
import { CHAMPIONSHIP_EVENTS, createEmptyChampionshipProgress, type ChampionshipCheckpoint, type ChampionshipProgress } from '../../domain/poker/championship';
import { translate } from '../../localization/core';
import { CHAMPIONSHIP_MAP_STOPS, championshipMapLayout, championshipVisibleEvents } from './championshipMapModel';

const device = vi.hoisted(() => ({ width: 390, height: 844 }));
vi.hoisted(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
vi.mock('react-native', () => {
  const host = (type: string) => (props: { children?: ReactNode }) => createElement(type, props, props.children);
  return { Image: host('image'), Modal: host('modal'), Pressable: host('pressable'), ScrollView: host('scrollview'), Text: host('text'), View: host('view'), StyleSheet: { create: <T,>(value: T) => value, absoluteFill: {}, absoluteFillObject: {} }, useWindowDimensions: () => device };
});
vi.mock('react-native-svg', () => ({ default: (p: { children?: ReactNode }) => createElement('svg', p, p.children), Path: (p: object) => createElement('path', p), Circle: (p: object) => createElement('circle', p) }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('./championshipMapArtwork', () => ({ championshipMapArtwork: 1 }));
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
vi.mock('./useChampionshipOrientation', () => ({ useChampionshipOrientation: () => undefined }));
vi.mock('../learn/ModalSafeArea', () => ({ ModalSafeArea: (p: { children?: ReactNode }) => p.children }));
vi.mock('./ChampionshipRecordModal', () => ({ ChampionshipRecordView: () => null }));
vi.mock('../../localization', () => ({ useLocalization: () => ({ t: (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate('en', key, values), tCount: (key: Parameters<typeof translate>[1], count: number, values?: Parameters<typeof translate>[2]) => translate('en', key, { ...values, count }) }) }));
vi.mock('../../theme', () => ({ useAppTheme: () => ({ palette: { background: '#fff', text: '#111', primary: '#55f' } }) }));

function completed(count: number): ChampionshipProgress {
  return { version: 2, events: CHAMPIONSHIP_EVENTS.slice(0, count).map((event) => ({ eventId: event.id, bestPlace: 1, attempts: 1, qualifiedAt: '2026-09-05', lastPlayedAt: '2026-09-05' })) };
}
function render(progress = createEmptyChampionshipProgress(), checkpoint: ChampionshipCheckpoint | null = null) {
  const launch = vi.fn(); let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(createElement(ChampionshipJourney, { progress, checkpoint, onClose: vi.fn(), onCloseRecord: vi.fn(), onOpenRecord: vi.fn(), onSelectEvent: launch, visible: true, recordVisible: false })); });
  const button = (id: string) => tree.root.findAll((n) => String(n.type) === 'pressable' && n.props.testID === id)[0]!;
  const tap = (id: string) => act(() => button(id).props.onPress());
  const text = () => JSON.stringify(tree.toJSON());
  return { tree, launch, button, tap, text, close: () => act(() => tree.unmount()) };
}

describe('championship map interaction', () => {
  it('sizes the bitmap to the same measured bounds as its interactive markers', () => {
    const ui = render();
    const map = ui.tree.root.findAll((n) => String(n.type) === 'view' && n.props.testID === 'championship.map')[0]!;
    act(() => map.props.onLayout({ nativeEvent: { layout: { width: 834, height: 940 } } }));
    const bitmap = ui.tree.root.findAll((n) => String(n.type) === 'image')[0]!;
    expect(bitmap.props.style).toContainEqual({ width: 834, height: championshipMapLayout(834, 940).mapHeight });
    ui.close();
  });
  it('dismisses the phone sheet before closing the modal on a system back request', () => {
    const onClose = vi.fn(); let tree!: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(createElement(ChampionshipModal, { progress: createEmptyChampionshipProgress(), checkpoint: null, onClose, onCloseRecord: vi.fn(), onOpenRecord: vi.fn(), onSelectEvent: vi.fn(), visible: true, recordVisible: false })); });
    const target = (id: string) => tree.root.findAll((n) => String(n.type) === 'pressable' && n.props.testID === id)[0]!;
    act(() => target('championship.event.local_3').props.onPress());
    const modal = tree.root.findAll((n) => String(n.type) === 'modal')[0]!;
    act(() => modal.props.onRequestClose());
    expect(onClose).not.toHaveBeenCalled(); expect(target('championship.details.close')).toBeUndefined();
    act(() => modal.props.onRequestClose()); expect(onClose).toHaveBeenCalledOnce(); act(() => tree.unmount());
  });
  it('selects a stop without starting a game; only Play launches it', () => {
    const ui = render(); ui.tap('championship.event.local_3'); expect(ui.launch).not.toHaveBeenCalled();
    expect(ui.text()).toContain('1,200 chip starting stack'); ui.tap('championship.play');
    expect(ui.launch).toHaveBeenCalledExactlyOnceWith(CHAMPIONSHIP_EVENTS[0]); ui.close();
  });
  it('lets locked stops open details and explains the preceding event requirement', () => {
    const ui = render(); ui.tap('championship.event.city_6');
    expect(ui.text()).toContain('Unlock: Local Tables Full Ring · Finish #4 or better');
    expect(ui.button('championship.play').props.disabled).toBe(true);
    // Defense in depth even if a platform delivers a stale press.
    ui.tap('championship.play'); expect(ui.launch).not.toHaveBeenCalled(); ui.close();
  });
  it('shows a mystery hint before the final without leaking hidden names or launches', () => {
    const ui = render(); ui.tap('championship.secret');
    expect(ui.text()).toContain('Some doors open only to a champion.');
    expect(ui.text()).not.toContain('The River Below'); expect(ui.text()).not.toContain('The Undertow');
    expect(ui.button('championship.play')).toBeUndefined(); expect(ui.launch).not.toHaveBeenCalled(); ui.close();
  });
  it('reveals only the first invitation after the final, and the second after its own gate', () => {
    const progress = completed(10); const ui = render(progress); ui.tap('championship.secret');
    expect(ui.text()).toContain('The Private Room'); expect(ui.text()).toContain('The River Below'); expect(ui.text()).not.toContain('The Undertow');
    ui.tap('championship.invitation.river_below'); expect(ui.launch).not.toHaveBeenCalled();
    ui.tap('championship.play'); expect(ui.launch.mock.calls[0]![0].id).toBe('river_below'); ui.close();
    progress.events.push({ eventId: 'river_below', bestPlace: 1, attempts: 1, qualifiedAt: '2026-09-05', lastPlayedAt: '2026-09-05' });
    const next = render(progress); next.tap('championship.secret'); expect(next.text()).toContain('The Undertow'); next.close();
  });
  it('labels an existing checkpoint Resume and completed events Replay', () => {
    const checkpoint = { eventId: 'local_3', tournament: { nextHandNumber: 4 } } as ChampionshipCheckpoint;
    const ui = render(createEmptyChampionshipProgress(), checkpoint); ui.tap('championship.event.local_3');
    expect(ui.text()).toContain('Resume event'); expect(ui.text()).toContain('Continue hand 4'); ui.close();
    const replay = render(completed(1)); replay.tap('championship.event.local_3'); expect(replay.text()).toContain('Replay event'); replay.close();
  });
  it('keeps list selection separate from launching too', () => {
    const ui = render(); ui.tap('championship.view.list'); ui.tap('championship.event.local_3'); expect(ui.launch).not.toHaveBeenCalled(); ui.close();
  });
  it('uses a side panel on wider screens', () => {
    device.width = 1194; device.height = 834;
    const ui = render(); expect(ui.button('championship.play')).toBeDefined(); expect(ui.button('championship.details.close')).toBeUndefined();
    ui.tap('championship.event.local_6'); expect(ui.button('championship.play').props.disabled).toBe(true); ui.close();
    device.width = 390; device.height = 844;
  });
});

describe('map layout and reveal contract', () => {
  it('preserves the ten stable event IDs and hides invitations behind their existing gates', () => {
    expect(CHAMPIONSHIP_MAP_STOPS.map((s) => s.id)).toEqual(CHAMPIONSHIP_EVENTS.map((e) => e.id));
    expect(championshipVisibleEvents(completed(9))).toHaveLength(10);
    expect(championshipVisibleEvents(completed(10)).map((e) => e.id)).not.toContain('the_undertow');
  });
  it.each([[320,568],[390,844],[844,390],[768,1024],[834,1194],[1194,834],[800,1280],[1280,800]])('keeps map targets inside the scroll surface at %s × %s', (width, height) => {
    const layout = championshipMapLayout(width,height);
    const pane = layout.sidePanel ? width * 0.62 : width;
    const mapHeight = championshipMapLayout(pane,height).mapHeight;
    for (const stop of CHAMPIONSHIP_MAP_STOPS) {
      expect(stop.x * pane - 27).toBeGreaterThanOrEqual(0); expect(stop.x * pane + 30).toBeLessThanOrEqual(pane);
      expect(stop.y * mapHeight - 27).toBeGreaterThanOrEqual(0); expect(stop.y * mapHeight + 30).toBeLessThanOrEqual(mapHeight);
    }
    for (let i=1;i<CHAMPIONSHIP_MAP_STOPS.length;i++) {
      const a=CHAMPIONSHIP_MAP_STOPS[i-1]!; const b=CHAMPIONSHIP_MAP_STOPS[i]!;
      expect(Math.hypot((a.x-b.x)*pane,(a.y-b.y)*mapHeight)).toBeGreaterThan(60);
    }
  });
});
