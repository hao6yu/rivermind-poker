import { describe, expect, it } from 'vitest';

import { createReleaseMetadata } from './releaseMetadataModel';

const config = {
  version: '1.0.0',
  ios: { bundleIdentifier: 'dev.isw.rivermindpoker' },
  android: { package: 'dev.isw.rivermindpoker' },
  extra: {
    release: {
      feedbackUrl: 'mailto:beta@example.com',
      minimumIosVersion: '15.1',
      privacyUrl: 'https://example.com/privacy',
      supportEmail: 'beta@example.com',
      supportUrl: 'https://example.com/support',
    },
  },
};

describe('release metadata', () => {
  it('shows the native build for a signed RiverMind binary', () => {
    const metadata = createReleaseMetadata(config, {
      applicationId: 'dev.isw.rivermindpoker',
      nativeApplicationVersion: '1.0.0',
      nativeBuildVersion: '17',
    });

    expect(metadata).toMatchObject({
      appVersion: '1.0.0',
      buildNumber: '17',
      versionLabel: 'Version 1.0.0 (17)',
    });
  });

  it('does not display the Expo Go build number as RiverMind metadata', () => {
    const metadata = createReleaseMetadata(config, {
      applicationId: 'host.exp.Exponent',
      nativeApplicationVersion: '54.0.0',
      nativeBuildVersion: '123',
    });

    expect(metadata).toMatchObject({
      appVersion: '1.0.0',
      buildNumber: null,
      versionLabel: 'Version 1.0.0 · preview',
    });
  });

  it('uses safe public fallbacks when optional release metadata is missing', () => {
    const metadata = createReleaseMetadata({ version: '1.0.0' }, {
      applicationId: null,
      nativeApplicationVersion: null,
      nativeBuildVersion: null,
    });

    expect(metadata.supportEmail).toBe('hyu@isw.dev');
    expect(metadata.privacyUrl).toContain('docs/PRIVACY.md');
  });
});
