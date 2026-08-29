import { describe, expect, it } from 'vitest';

import { sharedTableVisualDensity } from './tableVisualDensity';

describe('shared live-table visual density', () => {
  it('keeps heads-up roomy while compacting its board on a short landscape phone', () => {
    expect(sharedTableVisualDensity(2, 375, 667)).toEqual({ boardCard: 'regular', plaque: 'roomy' });
    expect(sharedTableVisualDensity(2, 667, 375)).toEqual({ boardCard: 'compact', plaque: 'roomy' });
  });

  it('uses progressively denser phone variants for three, six, and nine seats', () => {
    expect(sharedTableVisualDensity(3, 430, 932)).toEqual({ boardCard: 'compact', plaque: 'standard' });
    expect(sharedTableVisualDensity(6, 932, 430)).toEqual({ boardCard: 'small', plaque: 'compact' });
    expect(sharedTableVisualDensity(9, 932, 430)).toEqual({ boardCard: 'mini', plaque: 'dense' });
  });

  it('preserves readable tablet variants without changing the visual language', () => {
    expect(sharedTableVisualDensity(3, 1194, 834)).toEqual({ boardCard: 'regular', plaque: 'standard' });
    expect(sharedTableVisualDensity(6, 1194, 834)).toEqual({ boardCard: 'compact', plaque: 'standard' });
    expect(sharedTableVisualDensity(9, 1194, 834)).toEqual({ boardCard: 'small', plaque: 'compact' });
  });
});
