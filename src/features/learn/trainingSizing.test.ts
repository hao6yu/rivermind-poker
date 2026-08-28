import { describe, expect, it } from 'vitest';

import {
  TRAINING_CARD_BOX,
  exampleCardSize,
  playingCardSizeProps,
  scenarioBoardSize,
  scenarioHeroSize,
  scenarioTableCardMinHeight,
  type TrainingCardSize,
  type TrainingViewport,
} from './trainingSizing';

/** The supported phone and iPad viewports this slice has to fit. */
const VIEWPORTS: TrainingViewport[] = [
  { height: 568, width: 320 },
  { height: 667, width: 375 },
  { height: 844, width: 390 },
  { height: 932, width: 430 },
  { height: 1024, width: 768 },
  { height: 1366, width: 1024 },
];

const SIZE_RANK: Record<TrainingCardSize, number> = {
  compact: 4,
  medium: 3,
  mini: 1,
  regular: 5,
  small: 2,
};

function boardRowWidth(size: TrainingCardSize, gap = 4): number {
  return TRAINING_CARD_BOX[size].width * 5 + gap * 4;
}

describe('scenario card sizing', () => {
  it('never collapses the community board below the medium variant', () => {
    VIEWPORTS.forEach((viewport) => {
      expect(SIZE_RANK[scenarioBoardSize(viewport)]).toBeGreaterThanOrEqual(SIZE_RANK.medium);
    });
  });

  it('keeps a five-card board inside the padded scenario card at every supported width', () => {
    VIEWPORTS.forEach((viewport) => {
      const available = viewport.width - 66;
      expect(boardRowWidth(scenarioBoardSize(viewport))).toBeLessThanOrEqual(available);
    });
  });

  it('enlarges the board once the viewport is genuinely larger', () => {
    expect(SIZE_RANK[scenarioBoardSize({ height: 932, width: 430 })]).toBeGreaterThan(
      SIZE_RANK[scenarioBoardSize({ height: 568, width: 320 })],
    );
    expect(scenarioBoardSize({ height: 1024, width: 768 })).toBe('regular');
  });

  it('never renders the hero hand smaller than the board', () => {
    VIEWPORTS.forEach((viewport) => {
      expect(SIZE_RANK[scenarioHeroSize(viewport)]).toBeGreaterThanOrEqual(SIZE_RANK[scenarioBoardSize(viewport)]);
    });
  });

  it('gives the hero hand the full-size treatment on a large phone', () => {
    expect(scenarioHeroSize({ height: 844, width: 390 })).toBe('regular');
    // Two hero cards must still fit the narrowest supported phone.
    expect(TRAINING_CARD_BOX[scenarioHeroSize({ height: 568, width: 320 })].width * 2 + 5).toBeLessThanOrEqual(320 - 66);
  });

  it('grows the scenario card minimum height with its cards', () => {
    const tall = scenarioTableCardMinHeight({ height: 932, width: 430 });
    const short = scenarioTableCardMinHeight({ height: 568, width: 320 });
    expect(tall).toBeGreaterThan(short);
    // A short phone keeps its first choices above the fold.
    expect(short).toBeLessThanOrEqual(268);
  });
});

describe('inline example card sizing', () => {
  it('stays above the smallest variant on every supported phone', () => {
    VIEWPORTS.forEach((viewport) => {
      expect(SIZE_RANK[exampleCardSize(viewport)]).toBeGreaterThanOrEqual(SIZE_RANK.medium);
    });
  });

  it('fits five example cards inside the doubly padded example box', () => {
    VIEWPORTS.forEach((viewport) => {
      const available = viewport.width - 72;
      expect(boardRowWidth(exampleCardSize(viewport))).toBeLessThanOrEqual(available);
    });
  });
});

describe('playing card size props', () => {
  it('selects exactly one variant flag, none for the regular default', () => {
    expect(playingCardSizeProps('regular')).toEqual({ compact: false, medium: false, mini: false, small: false });
    expect(playingCardSizeProps('compact')).toEqual({ compact: true, medium: false, mini: false, small: false });
    expect(playingCardSizeProps('medium')).toEqual({ compact: false, medium: true, mini: false, small: false });
    expect(playingCardSizeProps('small')).toEqual({ compact: false, medium: false, mini: false, small: true });
    expect(playingCardSizeProps('mini')).toEqual({ compact: false, medium: false, mini: true, small: false });
  });
});
