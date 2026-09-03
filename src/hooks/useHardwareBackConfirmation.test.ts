import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

const registered: Array<{ eventName: string; handler: () => boolean }> = [];

vi.mock('react-native', () => ({
  BackHandler: {
    addEventListener: (eventName: string, handler: () => boolean) => {
      registered.push({ eventName, handler });
      return {
        remove: () => {
          const index = registered.findIndex((entry) => entry.handler === handler);
          if (index >= 0) registered.splice(index, 1);
        },
      };
    },
  },
}));

import { useHardwareBackConfirmation } from './useHardwareBackConfirmation';

function Probe({ enabled, onBack }: { enabled: boolean; onBack: () => void }) {
  useHardwareBackConfirmation(onBack, enabled);
  return null;
}

describe('useHardwareBackConfirmation (P18-012, D07)', () => {
  it('subscribes while active and consumes the hardware-back event', () => {
    const onBack = vi.fn();
    let tree: ReactTestRenderer | undefined;
    act(() => {
      tree = create(createElement(Probe, { enabled: true, onBack }));
    });
    expect(registered).toHaveLength(1);
    expect(registered[0]!.eventName).toBe('hardwareBackPress');

    // The handler consumes the event so the OS default never fires beneath it.
    expect(registered[0]!.handler()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);

    act(() => tree!.unmount());
    expect(registered).toHaveLength(0);
  });

  it('does not subscribe while inactive and unsubscribes when deactivated', () => {
    const onBack = vi.fn();
    let tree: ReactTestRenderer | undefined;
    act(() => {
      tree = create(createElement(Probe, { enabled: false, onBack }));
    });
    expect(registered).toHaveLength(0);
    act(() => {
      tree!.update(createElement(Probe, { enabled: true, onBack }));
    });
    expect(registered).toHaveLength(1);
    act(() => {
      tree!.update(createElement(Probe, { enabled: false, onBack }));
    });
    expect(registered).toHaveLength(0);
    act(() => tree!.unmount());
  });
});
