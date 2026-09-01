import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  CAMERA_FEATURE,
  markFeatureOptional,
} = require('./with-optional-android-hardware.js');

describe('with-optional-android-hardware', () => {
  it('adds the camera feature as optional without disturbing other features', () => {
    const manifest = {
      manifest: {
        'uses-feature': [
          {
            $: {
              'android:name': 'android.hardware.faketouch',
              'android:required': 'true',
            },
          },
        ],
      },
    };

    markFeatureOptional(manifest, CAMERA_FEATURE);

    expect(manifest.manifest['uses-feature']).toEqual([
      {
        $: {
          'android:name': 'android.hardware.faketouch',
          'android:required': 'true',
        },
      },
      {
        $: {
          'android:name': CAMERA_FEATURE,
          'android:required': 'false',
        },
      },
    ]);
  });

  it('converts an inferred required camera feature without duplicating it', () => {
    const manifest = {
      manifest: {
        'uses-feature': [
          {
            $: {
              'android:name': CAMERA_FEATURE,
              'android:required': 'true',
            },
          },
        ],
      },
    };

    markFeatureOptional(manifest, CAMERA_FEATURE);

    expect(manifest.manifest['uses-feature']).toHaveLength(1);
    expect(manifest.manifest['uses-feature'][0].$).toEqual({
      'android:name': CAMERA_FEATURE,
      'android:required': 'false',
    });
  });
});
