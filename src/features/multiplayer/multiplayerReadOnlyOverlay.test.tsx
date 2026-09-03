import { createElement, type ReactNode } from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => {
  const host = (name: string) => {
    const Component = (props: { children?: ReactNode }) => createElement(name, props, props.children);
    Component.displayName = name;
    return Component;
  };
  return {
    StyleSheet: { create: <T extends Record<string, unknown>>(styles: T): T => styles },
    Text: host('text'),
    View: host('view'),
  };
});

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

vi.mock('../../theme', () => ({
  useAppTheme: () => ({
    palette: {
      accentSoft: '#eef', primary: '#44f', text: '#111',
    },
  }),
}));

vi.mock('../../localization', async () => {
  const core = await import('../../localization/core');
  return {
    useLocalization: () => ({
      tCount: (key: string, count: number, values?: Record<string, string | number>) => {
        let value = `T:${key}`;
        const merged = { ...values, count };
        for (const [name, replacement] of Object.entries(merged)) {
          value = value.replaceAll(`{{${name}}}`, String(replacement));
        }
        return value;
      },
      t: (key: Parameters<typeof core.translate>[1], values?: Parameters<typeof core.translate>[2]) =>
        core.translate('en', key, values),
    }),
  };
});

import {
  MultiplayerReadOnlyTurnNotice,
  multiplayerReadOnlyOverlayPolicy,
} from './multiplayerReadOnlyOverlay';

function renderNotice(props: { secondsLeft: number | null; visible: boolean }): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(createElement(MultiplayerReadOnlyTurnNotice, props));
  });
  return tree;
}

function text(tree: ReactTestRenderer): string {
  return tree.root.findAllByType('text' as never)
    .map((node) => String(node.props.children ?? ''))
    .join(' ');
}

describe('private-table read-only overlays during the viewer turn', () => {
  it('keeps profiles and Table stats openable while action controls are live', () => {
    expect(multiplayerReadOnlyOverlayPolicy({ viewerTurn: true, actionControlsEnabled: true }))
      .toEqual({ openable: true, showTurnNotice: true });
  });

  it('never disables read-only access while another player owns the turn', () => {
    expect(multiplayerReadOnlyOverlayPolicy({ viewerTurn: false, actionControlsEnabled: false }))
      .toEqual({ openable: true, showTurnNotice: false });
  });

  it('renders the continuing turn deadline inside an open sheet', () => {
    const tree = renderNotice({ secondsLeft: 27, visible: true });
    expect(text(tree)).toContain('Your turn');
    expect(text(tree)).toContain('27s');
  });

  it('renders nothing when the viewer has no live decision', () => {
    expect(renderNotice({ secondsLeft: null, visible: false }).toJSON()).toBeNull();
  });
});
