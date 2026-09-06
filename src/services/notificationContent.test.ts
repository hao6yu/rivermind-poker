import { describe, it, expect } from 'vitest';
import content from '../../config/notification-content.json';
describe('notification editorial pool', () => {
  it('has stable unique IDs and a substantial tip/play pool', () => {
    expect(new Set(content.map((c) => c.id)).size).toBe(content.length);
    expect(
      content.filter((c) => c.kind === 'tip').length,
    ).toBeGreaterThanOrEqual(24);
    expect(
      content.filter((c) => c.kind === 'quick_play').length,
    ).toBeGreaterThanOrEqual(12);
  });
  it.each(['en', 'zh-Hans', 'zh-Hant'] as const)(
    'has distinct reviewed-length copy for %s',
    (locale) => {
      const bodies = content.map((c) => c.copy[locale].body);
      expect(new Set(bodies).size).toBe(content.length);
      for (const item of content) {
        expect(item.copy[locale].title.length).toBeGreaterThan(0);
        expect(item.copy[locale].body.length).toBeLessThanOrEqual(190);
        expect(item.copy[locale].body).not.toContain('{');
      }
    },
  );
});
