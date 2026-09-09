import { createRequire } from 'node:module';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { preserveTableOnScreenChanges } = require('./with-android-screen-continuity.js');

it('handles foldable size changes while preserving existing activity settings', () => {
  const main = { $: {
    'android:name': '.MainActivity',
    'android:configChanges': 'keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode|locale|layoutDirection',
    'android:launchMode': 'singleTask',
  } };
  const other = { $: { 'android:name': '.OtherActivity' } };
  const manifest = { manifest: { application: [{ activity: [main, other] }] } };

  preserveTableOnScreenChanges(manifest);
  preserveTableOnScreenChanges(manifest);

  expect(main.$['android:configChanges'].split('|')).toEqual([
    'keyboard', 'keyboardHidden', 'orientation', 'screenSize', 'screenLayout',
    'uiMode', 'locale', 'layoutDirection', 'smallestScreenSize',
  ]);
  expect(main.$['android:launchMode']).toBe('singleTask');
  expect(other).toEqual({ $: { 'android:name': '.OtherActivity' } });
});
