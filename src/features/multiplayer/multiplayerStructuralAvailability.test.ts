import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { V4_MULTIPLAYER_FUNCTION_NAME, resolveMultiplayerFunctionName } from '../../services/multiplayerEndpoint';
import { createElement, type ReactNode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MultiplayerEntryCard } from './MultiplayerEntryCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => {
  const host = (type: string) => (props: { children?: ReactNode }) => createElement(type, props, props.children);
  const Pressable = (props: { children?: ReactNode; [key: string]: unknown }) => (
    createElement('pressable', props, props.children)
  );
  return {
    Pressable,
    StyleSheet: { create: <T,>(styles: T): T => styles },
    Text: host('text'),
    View: host('view'),
  };
});
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('../../localization', () => ({
  useLocalization: () => ({
      tCount: (key: string, count: number, values?: Record<string, string | number>) => {
        let value = `T:${key}`;
        const merged = { ...values, count };
        for (const [name, replacement] of Object.entries(merged)) {
          value = value.replaceAll(`{{${name}}}`, String(replacement));
        }
        return value;
      }, t: (key: string) => key }),
}));
vi.mock('../../theme', () => ({
  useAppTheme: () => ({ palette: new Proxy({}, { get: () => '#000' }) as Record<string, string> }),
}));

/**
 * P18-004 / D02 structural gate: friend tables are a shipped capability, so
 * no environment flag may gate the entry, the flow modal, invite handling,
 * resume, or private statistics. A fresh or differently configured release
 * must not be able to silently lose the surface.
 *
 * This is deliberately a source-integrity gate: Metro inlines
 * `process.env.EXPO_PUBLIC_*` at build time, so the artifact-level companion
 * (`scripts/verify-release-bundle.mjs`) proves the compiled markers while
 * this file proves the branch structure cannot hide the surface again.
 */

const shellSource = readFileSync(
  resolve(import.meta.dirname, '../shell/AppShell.tsx'),
  'utf8',
);
// S8/P18-049 extracted the Play hub into its own file; the structural gate
// follows the moved JSX so the surface can never hide behind a refactor.
const playHubSource = readFileSync(
  resolve(import.meta.dirname, '../shell/screens/PlayScreen.tsx'),
  'utf8',
);

describe('friend-table structural availability (P18-004)', () => {
  it('has no preview flag module left in the source tree', () => {
    let exists = false;
    try {
      readFileSync(resolve(import.meta.dirname, 'multiplayerPreview.ts'));
      exists = true;
    } catch {
      exists = false;
    }
    expect(exists, 'multiplayerPreview.ts must stay deleted (D02)').toBe(false);
  });

  it('references the retired flag nowhere in the app source', () => {
    const sources = [
      shellSource,
      readFileSync(resolve(import.meta.dirname, 'MultiplayerEntryCard.tsx'), 'utf8'),
      readFileSync(resolve(import.meta.dirname, 'MultiplayerFlowModal.tsx'), 'utf8'),
    ];
    for (const source of sources) {
      expect(source.includes('EXPO_PUBLIC_MULTIPLAYER_PREVIEW')).toBe(false);
      expect(source.includes('multiplayerPreviewEnabled')).toBe(false);
    }
  });

  it('renders the friend-table entry and flow modal unconditionally in the Play hub', () => {
    // The exact retired shape — a JSX conditional on the flag — must never
    // return. The entry card and the flow modal render as direct children.
    expect(playHubSource).toMatch(/<MultiplayerEntryCard\n/);
    expect(playHubSource).toMatch(/<MultiplayerFlowModal\n/);
    expect(playHubSource.includes('multiplayerPreviewEnabled && (')).toBe(false);
    expect(shellSource.includes('multiplayerPreviewEnabled && (')).toBe(false);
  });

  it('always includes private tables in the persisted play record', () => {
    // The profile screen (extracted in S8/P18-049) owns the play-record read.
    const profileSource = readFileSync(
      resolve(import.meta.dirname, '../shell/screens/ProfileScreen.tsx'),
      'utf8',
    );
    expect(profileSource).toContain('loadPlayStatistics({ includePrivate: true })');
  });

  it('keeps the release lanes explicit: v4 resolvable, canonical default frozen', () => {
    expect(V4_MULTIPLAYER_FUNCTION_NAME).toBe('multiplayer-room-v4');
    // The v4 capability lane is accepted and never rewritten to another lane.
    expect(resolveMultiplayerFunctionName('multiplayer-room-v4')).toBe(V4_MULTIPLAYER_FUNCTION_NAME);
    // The canonical `multiplayer-room` lane stays the no-configuration
    // default (it remains frozen), and arbitrary names are never accepted
    // from the public environment.
    expect(resolveMultiplayerFunctionName(undefined)).toBe('multiplayer-room');
    expect(resolveMultiplayerFunctionName('something-else')).toBe('multiplayer-room');
  });

  it('exposes stable automation IDs on the entry card for the release smoke (P18-034)', () => {
    let renderer: ReturnType<typeof TestRenderer.create> | undefined;
    act(() => {
      renderer = TestRenderer.create(createElement(MultiplayerEntryCard, {
        onCreate: () => undefined,
        onJoin: () => undefined,
      }));
    });
    const ids: string[] = [];
    renderer!.root.findAllByType('view' as never).concat(renderer!.root.findAllByType('pressable' as never))
      .forEach((node) => {
        const id = (node as unknown as { props: { testID?: string } }).props.testID;
        if (id) ids.push(id);
      });
    expect(ids).toEqual(expect.arrayContaining([
      'play.multiplayer.entry',
      'play.multiplayer.create',
      'play.multiplayer.join',
    ]));
    act(() => renderer!.unmount());
  });
});
