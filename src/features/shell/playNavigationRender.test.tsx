import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';

import { PLAY_GROUPS } from './playNavigation';
import { renderPlayBand, type PlayBandComponents } from './playBands';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * P18-018 render-level contract: the Play screen renders PLAY_GROUPS through
 * `renderPlayBand`, so the model cannot drift from the screen again. The
 * stubs record which band rendered, in order.
 */

function stubs(order: string[]): PlayBandComponents {
  const marker = (name: string) => () => {
    order.push(name);
    return createElement(name);
  };
  return {
    AiConfigurator: marker('AiPlayConfigurator'),
    ChampionshipCard: marker('ChampionshipEntryCard'),
    FriendsCard: marker('MultiplayerEntryCard'),
    GamesRows: marker('GamesRows'),
    PlayGroup: ({ children, label, testID }) => createElement('playgroup', { label, testID }, children),
  };
}

describe('Play render contract (P18-018)', () => {
  it('renders every model band, in model order, with no dead bands', () => {
    const order: string[] = [];
    const components = stubs(order);
    let renderer: ReturnType<typeof TestRenderer.create> | undefined;
    act(() => {
      renderer = TestRenderer.create(createElement(
        'root',
        null,
        PLAY_GROUPS.map((group) => renderPlayBand(group, components)),
      ));
    });
    const renderedNames = renderer!.root.findAll(
      (node) => typeof node.type === 'string' && ['AiPlayConfigurator', 'ChampionshipEntryCard', 'MultiplayerEntryCard', 'GamesRows'].includes(node.type),
    ).map((node) => node.type);
    expect(renderedNames).toEqual(['MultiplayerEntryCard', 'ChampionshipEntryCard', 'AiPlayConfigurator', 'GamesRows']);
    act(() => renderer!.unmount());
  });

  it('names the titled band with the stable games-band test id', () => {
    const games = PLAY_GROUPS.find((group) => group.id === 'games');
    expect(games).toBeTruthy();
    let renderer: ReturnType<typeof TestRenderer.create> | undefined;
    act(() => {
      renderer = TestRenderer.create(createElement('root', null, renderPlayBand(games!, stubs([]))));
    });
    const band = renderer!.root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === 'play.gamesBand',
    );
    expect(band).toHaveLength(1);
    act(() => renderer!.unmount());
  });
});
