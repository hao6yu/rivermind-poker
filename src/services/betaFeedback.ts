import { Platform } from 'react-native';

import type { Json } from '../types/database';
import {
  normalizeDiagnosticToken,
  type AppDiagnosticEvent,
  type BetaFeedbackCategory,
  type FeedbackHandContext,
} from './betaFeedbackModel';
import { releaseMetadata } from './releaseMetadata';
import { ensureAnonymousSession, supabase } from './supabase';

const diagnosticStorageKey = 'rivermind.diagnostics.v1';
const maxStoredDiagnostics = 12;

export interface BetaFeedbackDiagnosticContext {
  errorCode?: string;
  retryable?: boolean;
  screen: string;
}

interface SubmitBetaFeedbackInput {
  category: BetaFeedbackCategory;
  context: BetaFeedbackDiagnosticContext;
  handContext?: FeedbackHandContext | null;
  message: string;
}

function diagnosticStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function sanitizeDiagnosticEvent(value: unknown): AppDiagnosticEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (typeof event.code !== 'string'
    || typeof event.occurredAt !== 'string'
    || typeof event.source !== 'string'
    || (event.retryable !== undefined && typeof event.retryable !== 'boolean')
    || !Number.isFinite(Date.parse(event.occurredAt))) return null;
  return {
    code: normalizeDiagnosticToken(event.code, 'unknown'),
    occurredAt: new Date(event.occurredAt).toISOString(),
    retryable: event.retryable as boolean | undefined,
    source: normalizeDiagnosticToken(event.source, 'app'),
  };
}

export function recentAppDiagnostics(): AppDiagnosticEvent[] {
  const storage = diagnosticStorage();
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(diagnosticStorageKey) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeDiagnosticEvent)
      .filter((event): event is AppDiagnosticEvent => event !== null)
      .slice(-maxStoredDiagnostics);
  } catch {
    return [];
  }
}

export function recordAppDiagnostic(input: {
  code: string;
  retryable?: boolean;
  source: string;
}): void {
  const storage = diagnosticStorage();
  if (!storage) return;
  const event: AppDiagnosticEvent = {
    code: normalizeDiagnosticToken(input.code, 'unknown'),
    occurredAt: new Date().toISOString(),
    retryable: input.retryable,
    source: normalizeDiagnosticToken(input.source, 'app'),
  };
  try {
    storage.setItem(
      diagnosticStorageKey,
      JSON.stringify([...recentAppDiagnostics(), event].slice(-maxStoredDiagnostics)),
    );
  } catch {
    // Diagnostics must never interrupt gameplay when device storage is unavailable.
  }
}

function feedbackPlatform(): 'ios' | 'android' | 'web' | 'unknown' {
  return Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web'
    ? Platform.OS
    : 'unknown';
}

export async function submitBetaFeedback(input: SubmitBetaFeedbackInput): Promise<void> {
  const message = input.message.trim();
  if (message.length < 3 || message.length > 2000) {
    throw new Error('Feedback must be between 3 and 2,000 characters.');
  }
  if (!supabase) throw new Error('Feedback is unavailable until Supabase is configured.');

  await ensureAnonymousSession();
  const screen = normalizeDiagnosticToken(input.context.screen, 'unknown');
  const handContext = input.handContext ?? null;
  const diagnostics = {
    currentError: input.context.errorCode ? {
      code: normalizeDiagnosticToken(input.context.errorCode, 'unknown'),
      retryable: input.context.retryable === true,
    } : null,
    hand: handContext,
    osVersion: String(Platform.Version).slice(0, 32),
    recentErrors: recentAppDiagnostics(),
  };
  const { error } = await supabase.from('beta_feedback').insert({
    app_version: releaseMetadata.appVersion,
    build_number: releaseMetadata.buildNumber,
    category: input.category,
    diagnostic_version: 1,
    diagnostics: diagnostics as unknown as Json,
    hand_client_id: handContext?.clientId ?? null,
    message,
    platform: feedbackPlatform(),
    screen,
  });
  if (error) throw error;
}
