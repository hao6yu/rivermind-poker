import type { ComponentType, ReactNode } from 'react';

import type { PlayGroupModel } from './playNavigation';

/**
 * P18-018 — the Play band renderer.
 *
 * The Play screen renders PLAY_GROUPS itself: for each model band it renders
 * exactly one band component, in the model's order, through this pure
 * mapper. The screen owns the real components; tests inject stubs, so the
 * model→render contract is verifiable without the native module graph. A new
 * model band without a renderer is a wiring mistake the exhaustiveness
 * check (and the contract test) catches.
 */
export interface PlayBandComponents {
  /** The `quick` band: the one AI configurator card. */
  AiConfigurator: ComponentType;
  /** The `friends` band: the friend-table entry card. */
  FriendsCard: ComponentType;
  /** The `championship` band: the championship entry card. */
  ChampionshipCard: ComponentType;
  /** The `games` band: the rows inside the titled "Games & events" group. */
  GamesRows: ComponentType;
  /** The titled collapsible group wrapper. */
  PlayGroup: ComponentType<{ children?: ReactNode; label: string; testID?: string }>;
}

export function renderPlayBand(group: PlayGroupModel, components: PlayBandComponents): ReactNode {
  switch (group.id) {
    case 'quick':
      return <components.AiConfigurator />;
    case 'friends':
      return <components.FriendsCard />;
    case 'championship':
      return <components.ChampionshipCard />;
    case 'games':
      return (
        <components.PlayGroup label={group.titleKey ?? ''} testID="play.gamesBand">
          <components.GamesRows />
        </components.PlayGroup>
      );
    // A new PlayGroupId must add its band here; the contract test fails while
    // a band renders nothing.
    default:
      return null;
  }
}
