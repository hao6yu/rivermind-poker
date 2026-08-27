import { describe, expect, it } from 'vitest';

import {
  createAvatarReportRecorder,
  reportedAvatarKey,
  type AvatarReport,
} from './avatarReports';
import { humanAvatarObjectKey } from '../domain/avatar';

const reported = { avatarId: 'avatarid01', version: 1 };

describe('avatarReports', () => {
  it('queues a report with a stable key', () => {
    const recorder = createAvatarReportRecorder();
    const report = recorder.record({
      reportedAvatar: { ...reported },
      seat: 2,
      reason: 'inappropriate-image',
      reporterId: 'user-A',
    });
    expect(report.reportId).toBeTruthy();
    expect(report.seat).toBe(2);
    expect(reportedAvatarKey(report)).toBe(
      humanAvatarObjectKey({ kind: 'uploaded', avatarId: 'avatarid01', version: 1 }),
    );
  });

  it('drains the queue exactly once, leaving a fresh queue intact', () => {
    const recorder = createAvatarReportRecorder();
    recorder.record({ reportedAvatar: { ...reported }, reason: 'spam', reporterId: 'A' });
    recorder.record({ reportedAvatar: { ...reported, version: 2 }, seat: 0, reason: 'harassment', reporterId: 'B' });

    const first = recorder.takeAll();
    expect(first).toHaveLength(2);
    expect(recorder.takeAll()).toHaveLength(0);

    // Mutating the drained (copied) reports must not corrupt a later queue.
    if (first[0]) first[0].reporterId = 'tampered';
    if (first[1]) first[1].reporterId = 'tampered';
    recorder.record({ reportedAvatar: { ...reported, version: 3 }, reason: 'spam', reporterId: 'C' });

    const second = recorder.takeAll();
    expect(second).toHaveLength(1);
    expect(second[0]?.reporterId).toBe('C');
  });

  it('ignores a missing seat, recording seat as null', () => {
    const recorder = createAvatarReportRecorder();
    const report = recorder.record({ reportedAvatar: { ...reported }, reason: 'other', reporterId: 'A' });
    expect(report.seat).toBeNull();
  });

  it('seeds from a previous set of reports and continues the id sequence', () => {
    const seed: AvatarReport[] = [{
      reportId: 'arpt-legacy',
      reportedAvatar: { ...reported },
      seat: 1,
      reporterId: 'old',
      reason: 'other',
      createdAtMs: 1,
    }];
    const recorder = createAvatarReportRecorder(seed);
    expect(recorder.all()).toHaveLength(1);
    const next = recorder.record({ reportedAvatar: { ...reported, version: 3 }, reason: 'spam', reporterId: 'A' });
    expect(next.reportId).toBe('arpt-2');
    expect(recorder.all()).toHaveLength(2);
  });
});
