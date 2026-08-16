import 'expo-sqlite/localStorage/install';

export type AiCoachConsentDecision = 'unknown' | 'granted' | 'declined';

export interface AiCoachConsentStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

interface StoredAiCoachConsent {
  version: 1;
  decision: Exclude<AiCoachConsentDecision, 'unknown'>;
}

const aiCoachConsentStorageKey = 'rivermind.ai-coach-consent.v1';

function deviceStorage(): AiCoachConsentStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function parseStoredConsent(value: unknown): StoredAiCoachConsent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const consent = value as Record<string, unknown>;
  if (consent.version !== 1) return null;
  if (consent.decision !== 'granted' && consent.decision !== 'declined') return null;
  return { version: 1, decision: consent.decision };
}

export function loadAiCoachConsent(
  storage: AiCoachConsentStorage | null = deviceStorage(),
): AiCoachConsentDecision {
  if (!storage) return 'unknown';
  try {
    const raw = storage.getItem(aiCoachConsentStorageKey);
    if (!raw) return 'unknown';
    return parseStoredConsent(JSON.parse(raw) as unknown)?.decision ?? 'unknown';
  } catch {
    // A disclosure must be shown again when device storage cannot be trusted.
    return 'unknown';
  }
}

export function saveAiCoachConsent(
  decision: Exclude<AiCoachConsentDecision, 'unknown'>,
  storage: AiCoachConsentStorage | null = deviceStorage(),
): Exclude<AiCoachConsentDecision, 'unknown'> {
  const saved: StoredAiCoachConsent = { version: 1, decision };
  try {
    storage?.setItem(aiCoachConsentStorageKey, JSON.stringify(saved));
  } catch {
    // The caller still keeps the explicit choice for the current app session.
  }
  return decision;
}

export function clearAiCoachConsent(
  storage: AiCoachConsentStorage | null = deviceStorage(),
): void {
  try {
    storage?.removeItem(aiCoachConsentStorageKey);
  } catch {
    // Account cleanup remains best effort when device storage is unavailable.
  }
}

export function aiCoachRequestRequiresDisclosure(decision: AiCoachConsentDecision): boolean {
  return decision !== 'granted';
}

export function assertAiCoachConsentGranted(
  decision: AiCoachConsentDecision,
): asserts decision is 'granted' {
  if (decision !== 'granted') {
    throw new Error('Explicit third-party AI consent is required before requesting a coach review.');
  }
}

export const aiCoachConsentStorageContract = {
  key: aiCoachConsentStorageKey,
  version: 1,
} as const;
