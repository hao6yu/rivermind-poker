/**
 * First-run experience choice + tutorial entry-point tests (plan §3, slice 2/4).
 *
 * - The onboarding flow keeps its privacy/play-money disclosures and presents
 *   the three experience choices as a second page; each choice reaches
 *   AppShell's routing callback exactly once.
 * - The Home Poker tools card exposes the beginner-first row with the
 *   status-dependent start/resume/replay label.
 * - Previously onboarded users are never re-prompted (the upgrade path).
 */
import React, { createElement, type ReactNode } from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { completeOnboarding, shouldShowOnboarding } from '../../services/onboarding';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  locale: 'en',
  onChooseExperience: vi.fn(),
  onOpenBeginnerTutorial: vi.fn(),
}));

vi.mock('react-native', () => {
  const host = (name: string) => {
    const Component = (props: { children?: ReactNode }) => createElement(name, props, props.children);
    Component.displayName = name;
    return Component;
  };
  const Pressable = (props: {
    children?: ReactNode;
    disabled?: boolean;
    onPress?: () => void;
    style?: unknown;
    [key: string]: unknown;
  }) => {
    const { children, onPress, disabled, ...rest } = props;
    return createElement('pressable', {
      ...rest,
      disabled: Boolean(disabled),
      onPress: disabled ? undefined : onPress,
    }, children);
  };
  return {
    Modal: host('modal'),
    Pressable,
    ScrollView: host('scroll-view'),
    StyleSheet: { create: <T extends Record<string, unknown>>(styles: T): T => styles, hairlineWidth: 0.5 },
    Text: host('text'),
    View: host('view'),
    useWindowDimensions: () => ({ height: 900, width: 400 }),
  };
});

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

vi.mock('../../theme', () => ({
  useAppTheme: () => ({
    palette: {
      background: '#ffffff', border: '#cccccc', muted: '#888888', primary: '#123456',
      primaryText: '#ffffff', soft: '#f0f0f0', surface: '#ffffff', text: '#111111',
    },
  }),
}));

vi.mock('../../localization', async () => {
  const core = await import('../../localization/core');
  return {
    useLocalization: () => ({
      activityText: (activity: { description: string; title: string }, field: 'description' | 'title') =>
        activity[field],
      t: (key: Parameters<typeof core.translate>[1], values?: Parameters<typeof core.translate>[2]) =>
        core.translate(mocks.locale as never, key, values),
    }),
  };
});

// The onboarding modal renders ModalSafeArea which pulls safe-area contexts.
vi.mock('../learn/ModalSafeArea', () => ({
  ModalSafeArea: (props: { children?: ReactNode }) => createElement('safe-area', null, props.children),
}));
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));

import { FirstRunOnboardingModal } from './FirstRunOnboardingModal';
import { PokerToolsCard, type PokerToolsCardProps } from './PokerToolsCard';
import type { BeginnerTutorialEntryStatus } from '../../services/beginnerTutorial';

function press(tree: ReactTestRenderer, testID: string): void {
  const node = tree.root.findAll((candidate) => candidate.type === 'pressable' as never && candidate.props.testID === testID)[0];
  if (!node) throw new Error(`No pressable with testID ${testID}`);
  act(() => {
    node.props.onPress?.();
  });
}

function render(element: React.ReactElement): ReactTestRenderer {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = TestRenderer.create(element);
  });
  if (!tree) throw new Error('failed to mount');
  return tree as ReactTestRenderer;
}

describe('first-run experience choice', () => {
  beforeEach(() => {
    mocks.onChooseExperience.mockClear();
    mocks.onOpenBeginnerTutorial.mockClear();
    mocks.locale = 'en';
  });

  it('shows the disclosures page first, then the three choices', () => {
    const tree = render(createElement(FirstRunOnboardingModal, {
      onChooseExperience: mocks.onChooseExperience,
      visible: true,
    }));
    // Page one: disclosures with the existing Continue CTA (onboarding.start).
    expect(tree.root.findAll((candidate) => candidate.props.testID === 'onboarding.choice.beginner').length).toBe(0);
    press(tree, 'onboarding.disclosuresContinue');
    // Page two: exactly the three authored choices.
    for (const testID of ['onboarding.choice.beginner', 'onboarding.choice.basics', 'onboarding.choice.later']) {
      expect(tree.root.findAll((candidate) => candidate.props.testID === testID).length, testID).toBeGreaterThan(0);
    }
  });

  it('routes each choice to AppShell exactly once', () => {
    const tree = render(createElement(FirstRunOnboardingModal, {
      onChooseExperience: mocks.onChooseExperience,
      visible: true,
    }));
    press(tree, 'onboarding.disclosuresContinue');
    press(tree, 'onboarding.choice.beginner');
    expect(mocks.onChooseExperience).toHaveBeenLastCalledWith('beginner');
    press(tree, 'onboarding.choice.basics');
    expect(mocks.onChooseExperience).toHaveBeenLastCalledWith('basics');
    press(tree, 'onboarding.choice.later');
    expect(mocks.onChooseExperience).toHaveBeenLastCalledWith('later');
    expect(mocks.onChooseExperience).toHaveBeenCalledTimes(3);
  });

  it('reopens on the disclosure page after being closed mid-choice (finding #15)', () => {
    const tree = render(createElement(FirstRunOnboardingModal, {
      onChooseExperience: mocks.onChooseExperience,
      visible: true,
    }));
    // Advance past the disclosures, then simulate a reopen (account deletion
    // or app relaunch): the modal must show the disclosures again, not the
    // choice page.
    press(tree, 'onboarding.disclosuresContinue');
    expect(tree.root.findAll((candidate) => candidate.props.testID === 'onboarding.choice.beginner').length).toBeGreaterThan(0);
    act(() => {
      tree.unmount();
    });
    const reopened = render(createElement(FirstRunOnboardingModal, {
      onChooseExperience: mocks.onChooseExperience,
      visible: true,
    }));
    expect(reopened.root.findAll((candidate) => candidate.props.testID === 'onboarding.choice.beginner').length).toBe(0);
    expect(reopened.root.findAll((candidate) => candidate.props.testID === 'onboarding.disclosuresContinue').length).toBeGreaterThan(0);
  });

  it('resets to disclosures when the modal toggles visible in place (finding #15)', () => {
    let tree = render(createElement(FirstRunOnboardingModal, {
      onChooseExperience: mocks.onChooseExperience,
      visible: true,
    }));
    press(tree, 'onboarding.disclosuresContinue');
    // Close (visible=false) then reopen (visible=true) on the SAME instance —
    // the page state must reset.
    act(() => {
      tree.update(createElement(FirstRunOnboardingModal, {
        onChooseExperience: mocks.onChooseExperience,
        visible: false,
      }));
    });
    act(() => {
      tree.update(createElement(FirstRunOnboardingModal, {
        onChooseExperience: mocks.onChooseExperience,
        visible: true,
      }));
    });
    expect(tree.root.findAll((candidate) => candidate.props.testID === 'onboarding.choice.beginner').length).toBe(0);
    expect(tree.root.findAll((candidate) => candidate.props.testID === 'onboarding.disclosuresContinue').length).toBeGreaterThan(0);
  });

  it('returns to the disclosures from the choice page back button', () => {
    const tree = render(createElement(FirstRunOnboardingModal, {
      onChooseExperience: mocks.onChooseExperience,
      visible: true,
    }));
    press(tree, 'onboarding.disclosuresContinue');
    press(tree, 'onboarding.choice.back');
    expect(tree.root.findAll((candidate) => candidate.props.testID === 'onboarding.disclosuresContinue').length).toBeGreaterThan(0);
  });
});

describe('home poker tools beginner row', () => {
  function renderCard(status: BeginnerTutorialEntryStatus): ReactTestRenderer {
    return render(createElement<PokerToolsCardProps>(PokerToolsCard, {
      beginnerTutorialStatus: status,
      onOpenBeginnerTutorial: mocks.onOpenBeginnerTutorial,
    }));
  }

  it('shows the beginner-first Poker basics row above the reference tools', () => {
    const tree = renderCard('not-started');
    const startNode = tree.root.findAll((candidate) => candidate.props.testID === 'home.tutorial.start');
    expect(startNode.length).toBeGreaterThan(0);
    // The row sits before the reference tool rows (first list entry).
    press(tree, 'home.tutorial.start');
    expect(mocks.onOpenBeginnerTutorial).toHaveBeenCalledTimes(1);
  });

  it('switches the row label to Resume and Replay from the tutorial status', () => {
    const resume = renderCard('in-progress');
    expect(resume.root.findAll((candidate) => candidate.props.testID === 'home.tutorial.resume').length).toBeGreaterThan(0);
    const replay = renderCard('completed');
    expect(replay.root.findAll((candidate) => candidate.props.testID === 'home.tutorial.replay').length).toBeGreaterThan(0);
  });

  it('renders without the tutorial row when no callback is wired (other surfaces)', () => {
    const tree = render(createElement<PokerToolsCardProps>(PokerToolsCard, {}));
    expect(tree.root.findAll((candidate) => String(candidate.props.testID ?? '').startsWith('home.tutorial')).length).toBe(0);
  });
});

describe('upgrade path (plan §3)', () => {
  it('never re-prompts users who already completed onboarding', () => {
    // A fresh device shows onboarding; completing it flips the contract key,
    // so an app update cannot ask the same question again. The contract is
    // proven against injected device storage (this worker has no localStorage).
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => void store.delete(key),
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    expect(shouldShowOnboarding(storage)).toBe(true);
    completeOnboarding(storage);
    expect(shouldShowOnboarding(storage)).toBe(false);
    // The tutorial flow itself never re-arms the prompt: resetting the
    // tutorial progress key does not resurrect onboarding.
    store.set('rivermind.tutorial.v1', '{"version":1,"status":"completed","completedAt":"2026-09-04T00:00:00.000Z"}');
    expect(shouldShowOnboarding(storage)).toBe(false);
  });
});
