import type { TablePlayerCount } from '../../domain/poker/multiwaySession';
import type { MultiwaySeatAnchor } from './multiwayGameplayPresentation';

export interface MultiwayTableLayout {
  compact: boolean;
  landscapeSixMax: boolean;
  phoneSixMax: boolean;
  recentActionLimit: 2 | 3;
}

/**
 * Six-max needs its own information hierarchy on phones. Merely shrinking the
 * regular seat plaques makes everything fit, but it also pushes names, stacks,
 * and actions below a comfortable reading size.
 */
export function multiwayTableLayout(
  width: number,
  height: number,
  playerCount: TablePlayerCount,
): MultiwayTableLayout {
  const compact = height < 730 || width < 370;
  const landscapeSixMax = playerCount === 6 && width > height;
  const phoneSixMax = playerCount === 6 && width < 500 && !landscapeSixMax;
  return {
    compact,
    landscapeSixMax,
    phoneSixMax,
    recentActionLimit: compact && (phoneSixMax || landscapeSixMax) ? 2 : 3,
  };
}

export interface MultiwaySeatAnchorStyle {
  bottom?: `${number}%`;
  left?: `${number}%`;
  right?: `${number}%`;
  top?: `${number}%`;
}

/**
 * Stagger the two side pairs on six-max phones. The upper pair no longer reads
 * as one crowded row with the top-center seat, while the lower pair clears the
 * protected board and current-action lane.
 */
export function multiwaySeatAnchorStyle(
  anchor: MultiwaySeatAnchor,
  phoneSixMax: boolean,
): MultiwaySeatAnchorStyle {
  switch (anchor) {
    case 'top-left': return { left: '5%', top: phoneSixMax ? '13%' : '9%' };
    case 'top-center': return { left: '38%', top: '1%' };
    case 'top-right': return { right: '5%', top: phoneSixMax ? '13%' : '9%' };
    case 'mid-left': return { left: '3%', top: phoneSixMax ? '63%' : '43%' };
    case 'mid-right': return { right: '3%', top: phoneSixMax ? '63%' : '43%' };
    case 'hero': return { bottom: '2%', left: '35%' };
  }
}
