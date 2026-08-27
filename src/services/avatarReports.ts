/**
 * The "report" half of the report-or-hide privacy path. A viewer flags a seat's
 * avatar (e.g. an uploaded image that is abusive) as a client-side moderation
 * signal. Reporting never downloads or displays the avatar; it only enqueues a
 * bounded, structured report that a transport sends to moderation.
 *
 * The recorder is a small in-memory queue so it is pure and unit tested; the
 * transport (Realtime/edge) that delivers it is out of scope for the client.
 */
import { humanAvatarObjectKey } from '../domain/avatar';
import type { AvatarReference } from './avatarResolver';

export type AvatarReportReason = 'inappropriate-image' | 'spam' | 'harassment' | 'other';

export interface AvatarReport {
  reportId: string;
  /** Which avatar was reported (never its bytes). */
  reportedAvatar: AvatarReference;
  /** The reported seat, or null when not seat-scoped. */
  seat: number | null;
  reporterId: string;
  reason: AvatarReportReason;
  note?: string;
  createdAtMs: number;
}

export interface AvatarReportInput {
  /** Which avatar was reported (never its bytes). */
  reportedAvatar: AvatarReference;
  reason: AvatarReportReason;
  reporterId: string;
  /** The reported seat, or null when not seat-scoped. */
  seat?: number | null;
  /** Free-text context; optional. */
  note?: string;
  /** Client timestamp; defaults to now on record. */
  createdAtMs?: number;
}

/** A recorder that queues avatar reports and drains them for a transport. */
export interface AvatarReportRecorder {
  record(params: AvatarReportInput): AvatarReport;
  pending(): AvatarReport[];
  all(): AvatarReport[];
  /** Drain + clear the queue, returning everything reported so a transport can deliver it. */
  takeAll(): AvatarReport[];
}

export function createAvatarReportRecorder(
  seed: AvatarReport[] = [],
  createId: (i: number) => string = (i) => `arpt-${i + 1}`,
): AvatarReportRecorder {
  const reports: AvatarReport[] = seed.map((r) => ({ ...r }));
  let counter = reports.length;

  function record(params: AvatarReportInput): AvatarReport {
    const report: AvatarReport = {
      reportId: createId(counter),
      reportedAvatar: { ...params.reportedAvatar },
      seat: params.seat ?? null,
      reporterId: params.reporterId,
      reason: params.reason,
      note: params.note,
      createdAtMs: params.createdAtMs ?? Date.now(),
    };
    reports.push(report);
    counter += 1;
    return report;
  }

  return {
    record,
    pending: () => reports.map((r) => ({ ...r })),
    all: () => reports.map((r) => ({ ...r })),
    takeAll: () => {
      const drained = reports.splice(0, reports.length);
      return drained.map((r) => ({ ...r }));
    },
  };
}

/** The stable object key for the reported avatar, used to dedupe. */
export function reportedAvatarKey(report: AvatarReport): string {
  return humanAvatarObjectKey({ kind: 'uploaded', avatarId: report.reportedAvatar.avatarId, version: report.reportedAvatar.version });
}
