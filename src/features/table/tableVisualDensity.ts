export type SharedTableCardVariant = 'compact' | 'medium' | 'mini' | 'regular' | 'small';
export type SharedTablePlaqueVariant = 'compact' | 'dense' | 'roomy' | 'standard';

export interface SharedTableVisualDensity {
  boardCard: SharedTableCardVariant;
  plaque: SharedTablePlaqueVariant;
}

/**
 * One cross-engine density vocabulary. Geometry remains owned by each engine,
 * while the visible board/plaque scale follows the same seat-count contract.
 */
export function sharedTableVisualDensity(
  seatCount: 2 | 3 | 6 | 9,
  width: number,
  height: number,
): SharedTableVisualDensity {
  const tablet = Math.min(width, height) >= 700;
  const landscapePhone = width > height && !tablet;
  if (seatCount === 2) {
    return {
      boardCard: landscapePhone ? 'compact' : 'regular',
      plaque: 'roomy',
    };
  }
  if (seatCount === 3) {
    return {
      boardCard: tablet ? 'regular' : 'compact',
      plaque: 'standard',
    };
  }
  if (seatCount === 6) {
    return {
      boardCard: tablet ? 'compact' : 'small',
      plaque: tablet ? 'standard' : 'compact',
    };
  }
  return {
    boardCard: tablet ? 'small' : landscapePhone ? 'mini' : 'small',
    plaque: tablet ? 'compact' : 'dense',
  };
}
