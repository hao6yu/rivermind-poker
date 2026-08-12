import { describe, expect, it } from 'vitest';

import { showsExpandedPortraitCoach } from './tableResponsiveLayout';

describe('table responsive layout', () => {
  it('expands coaching on a portrait tablet canvas', () => {
    expect(showsExpandedPortraitCoach(768, 1024)).toBe(true);
    expect(showsExpandedPortraitCoach(834, 1194)).toBe(true);
  });

  it('keeps phone, split-screen, and landscape layouts compact', () => {
    expect(showsExpandedPortraitCoach(430, 932)).toBe(false);
    expect(showsExpandedPortraitCoach(620, 1024)).toBe(false);
    expect(showsExpandedPortraitCoach(1194, 834)).toBe(false);
  });
});
