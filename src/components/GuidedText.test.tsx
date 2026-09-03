import { createElement, type ReactNode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import { GuidedText } from './GuidedText';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => {
  const Text = (props: { children?: ReactNode; [key: string]: unknown }) => (
    createElement('text', props, props.children)
  );
  return { Text };
});

function textProps(children: ReactNode, extra: Record<string, unknown> = {}): Record<string, unknown> {
  let renderer: ReturnType<typeof TestRenderer.create> | undefined;
  act(() => {
    renderer = TestRenderer.create(createElement(GuidedText, { children, ...extra }) as never);
  });
  const text = renderer!.root.findByType('text' as never) as unknown as { props: Record<string, unknown> };
  const props = text.props;
  act(() => renderer!.unmount());
  return props;
}

describe('shared GuidedText (P18-027)', () => {
  it('never disables OS font scaling', () => {
    const props = textProps('Guided copy');
    expect(props.allowFontScaling).toBeUndefined();
    // The OS scale is honored up to the documented ceiling.
    expect(props.maxFontSizeMultiplier).toBe(1.5);
  });

  it('lets a caller bound the scale for dense copy', () => {
    const props = textProps('Dense copy', { maxScale: 1.2 });
    expect(props.maxFontSizeMultiplier).toBe(1.2);
  });
});
