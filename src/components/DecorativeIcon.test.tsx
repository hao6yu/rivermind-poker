import { createElement, type ReactNode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import { DecorativeIcon } from './DecorativeIcon';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let lastProps: Record<string, unknown> | undefined;
vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => {
    lastProps = props;
    return createElement('ionicons', props);
  },
}));

describe('DecorativeIcon (P18-011)', () => {
  it('hides the glyph subtree from accessibility clients while forwarding props', () => {
    let renderer: ReturnType<typeof TestRenderer.create> | undefined;
    act(() => {
      renderer = TestRenderer.create(createElement(DecorativeIcon, { color: '#000', name: 'trophy-outline', size: 18 }));
    });
    expect(lastProps).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
      color: '#000',
      name: 'trophy-outline',
      size: 18,
    });
    act(() => renderer!.unmount());
  });
});
