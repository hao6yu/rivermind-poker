import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';

/**
 * Setup-file mock verification (review finding #20): the global
 * expo-linear-gradient mock must FORWARD CHILDREN and accessibility/test
 * props. A null-rendering stub silently discarded entire component subtrees —
 * this test proves descendants of a LinearGradient stay renderable and that
 * testIDs/a11y props survive the mock.
 */
import { LinearGradient } from 'expo-linear-gradient';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('expo-linear-gradient global mock (finding #20)', () => {
  it('renders children and forwards accessibility/test props', () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      tree = TestRenderer.create(createElement(
        LinearGradient,
        { colors: ['#000', '#fff'], accessibilityLabel: 'gradient banner', testID: 'gradient.banner' },
        createElement('text', null, 'visible child'),
        createElement('view', { testID: 'gradient.child' }),
      ));
    });
    const json = tree?.toJSON();
    const serialized = JSON.stringify(json);
    expect(serialized).toContain('visible child');
    expect(serialized).toContain('gradient.banner');
    expect(serialized).toContain('gradient.child');
    // The gradient-specific colors prop is not forwarded.
    expect(serialized).not.toContain('#000');
  });
});
