export interface ExpoReleaseConfig {
  android?: { package?: string };
  extra?: Record<string, unknown>;
  ios?: { bundleIdentifier?: string };
  version?: string;
}

export interface ReleaseRuntimeInfo {
  applicationId: string | null;
  nativeApplicationVersion: string | null;
  nativeBuildVersion: string | null;
}

export interface ReleaseMetadata {
  appVersion: string;
  buildNumber: string | null;
  feedbackUrl: string;
  minimumIosVersion: string;
  privacyUrl: string;
  supportEmail: string;
  supportUrl: string;
  versionLabel: string;
}

const fallbackReleaseMetadata = {
  feedbackUrl: 'mailto:hyu@isw.dev?subject=RiverMind%20Poker%20feedback',
  minimumIosVersion: '15.1',
  privacyUrl: 'https://github.com/hao6yu/rivermind-poker/blob/master/docs/PRIVACY.md',
  supportEmail: 'hyu@isw.dev',
  supportUrl: 'https://github.com/hao6yu/rivermind-poker/blob/master/docs/SUPPORT.md',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

export function createReleaseMetadata(
  config: ExpoReleaseConfig | null | undefined,
  runtime: ReleaseRuntimeInfo,
): ReleaseMetadata {
  const releaseConfig = isRecord(config?.extra?.release) ? config.extra.release : {};
  const ownsNativeBinary = Boolean(
    runtime.applicationId
    && (runtime.applicationId === config?.ios?.bundleIdentifier || runtime.applicationId === config?.android?.package),
  );
  const appVersion = ownsNativeBinary
    ? runtime.nativeApplicationVersion ?? config?.version ?? 'development'
    : config?.version ?? 'development';
  const buildVersion = ownsNativeBinary ? runtime.nativeBuildVersion : null;

  return {
    appVersion,
    buildNumber: buildVersion,
    feedbackUrl: stringValue(releaseConfig.feedbackUrl, fallbackReleaseMetadata.feedbackUrl),
    minimumIosVersion: stringValue(releaseConfig.minimumIosVersion, fallbackReleaseMetadata.minimumIosVersion),
    privacyUrl: stringValue(releaseConfig.privacyUrl, fallbackReleaseMetadata.privacyUrl),
    supportEmail: stringValue(releaseConfig.supportEmail, fallbackReleaseMetadata.supportEmail),
    supportUrl: stringValue(releaseConfig.supportUrl, fallbackReleaseMetadata.supportUrl),
    versionLabel: buildVersion ? `Version ${appVersion} (${buildVersion})` : `Version ${appVersion} · preview`,
  };
}
