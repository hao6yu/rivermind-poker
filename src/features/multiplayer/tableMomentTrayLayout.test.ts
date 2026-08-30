import { describe, expect, it } from 'vitest';

import { tableMomentTrayLayout } from './tableMomentTrayLayout';

describe('table moment tray layout', () => {
  it('fits a 320-point portrait viewport in two compact rows', () => {
    expect(tableMomentTrayLayout(320, 568)).toEqual({
      buttonSize: 30,
      stickerSize: 25,
      width: 240,
    });
  });

  it('uses compact controls at the shortest landscape height', () => {
    const layout = tableMomentTrayLayout(568, 320);
    expect(layout.width).toBe(240);
    expect(layout.buttonSize).toBe(30);
  });
});
