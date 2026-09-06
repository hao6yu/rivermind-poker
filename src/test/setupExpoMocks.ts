import { createElement } from 'react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';

/**
 * Global test-environment mock for `expo-linear-gradient` (review finding
 * #20). The package's published `build/LinearGradient.js` contains raw JSX,
 * which vitest 4's oxc transform cannot parse in Node — importing the real
 * module fails every test that renders a component touching it (PlayingCard).
 *
 * The mock renders a host element that FORWARDS CHILDREN plus
 * accessibility/test props: a null-rendering stub silently discarded entire
 * component subtrees in render tests. Per-file `vi.mock` calls for this
 * module remain possible when a test needs a specific gradient stub.
 */
vi.mock('expo-linear-gradient', () => ({
  LinearGradient: (props: {
    children?: ReactNode;
    accessibilityLabel?: string;
    accessible?: boolean;
    testID?: string;
    style?: unknown;
    [key: string]: unknown;
  }) => {
    // Strip the gradient-specific `colors` prop; forward everything else.
    const { colors: _colors, ...rest } = props;
    return createElement('linear-gradient', rest, props.children);
  },
}));
