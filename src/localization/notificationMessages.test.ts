import { describe, expect, it } from 'vitest';
import { LOCALES, type AppLanguage } from './registry';
import { notificationMessages } from './notificationMessages';

describe('notification settings localization', () => {
  it.each(Object.keys(LOCALES) as AppLanguage[])(
    'has translated controls, consent, cadence, and error states for %s',
    (language) => {
      const english = notificationMessages('en');
      const copy = notificationMessages(language);
      expect(Object.keys(copy).sort()).toEqual(Object.keys(english).sort());
      for (const key of Object.keys(english) as (keyof typeof english)[]) {
        expect(copy[key].trim().length, key).toBeGreaterThan(0);
        if (language !== 'en') expect(copy[key], key).not.toBe(english[key]);
      }
    },
  );
});
