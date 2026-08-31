import { describe, expect, it } from 'vitest';

import {
  englishMessages,
  simplifiedChineseMessages,
  traditionalChineseMessages,
} from '../../localization/messages';

import {
  TABLE_MOMENT_CATALOG,
  TABLE_MOMENT_MAX_PAYLOAD_ID_LENGTH,
  TABLE_MOMENT_PROTOCOL_VERSION,
  TABLE_MOMENT_REACTION_IDS,
  createTableMomentEnvelope,
  isTableMomentReactionId,
  parseTableMomentRequest,
  tableMomentEnvelopeIsFresh,
  tableMomentPayloadIdIsNew,
} from './tableMoments';

describe('version-1 table moment contract', () => {
  it('authors exactly the twelve version-1 reaction ids and no others', () => {
    expect(TABLE_MOMENT_REACTION_IDS).toEqual([
      'cheer',
      'surprised',
      'laugh',
      'niceHand',
      'thinking',
      'disappointed',
      'goodLuck',
      'wellPlayed',
      'bigMove',
      'soClose',
      'onFire',
      'goodGame',
    ]);
    expect(TABLE_MOMENT_PROTOCOL_VERSION).toBe(1);
    TABLE_MOMENT_REACTION_IDS.forEach((id) => expect(isTableMomentReactionId(id)).toBe(true));
    expect(isTableMomentReactionId('banana')).toBe(false);
    expect(isTableMomentReactionId(7)).toBe(false);
    expect(isTableMomentReactionId(null)).toBe(false);
  });

  it('keeps the authored catalog complete with phrase and accessibility keys', () => {
    for (const id of TABLE_MOMENT_REACTION_IDS) {
      expect(TABLE_MOMENT_CATALOG[id].phraseKey).toMatch(/^multiplayer\.moment\./);
      expect(TABLE_MOMENT_CATALOG[id].accessibilityKey).toMatch(/^multiplayer\.moment\./);
    }
  });

  it('resolves every catalog phrase key in all three locales', () => {
    for (const id of TABLE_MOMENT_REACTION_IDS) {
      for (const catalogKey of ['phraseKey', 'accessibilityKey'] as const) {
        const key = TABLE_MOMENT_CATALOG[id][catalogKey] as keyof typeof englishMessages;
        const english = englishMessages[key];
        const simplified = simplifiedChineseMessages[key];
        const traditional = traditionalChineseMessages[key];
        expect(english, `${key} is missing from English`).toBeTruthy();
        expect(simplified, `${key} is missing from zh-Hans`).toBeTruthy();
        expect(traditional, `${key} is missing from zh-Hant`).toBeTruthy();
        expect(simplified).not.toBe(english);
        expect(traditional).not.toBe(english);
      }
    }
  });

  it('builds an envelope with the coordinator-derived sender identity', () => {
    const moment = createTableMomentEnvelope({
      atMs: 1_000_000,
      handNumber: 3,
      id: 'moment:user-1:3:cheer:7',
      playerId: 'player-7',
      reactionId: 'cheer',
      roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      seat: 7,
      seatCount: 9,
    });
    expect(moment).toEqual({
      atMs: 1_000_000,
      handNumber: 3,
      id: 'moment:user-1:3:cheer:7',
      playerId: 'player-7',
      protocolVersion: 1,
      reactionId: 'cheer',
      roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      seat: 7,
    });
  });

  it('rejects invalid envelopes at the boundary', () => {
    const base = {
      atMs: 1_000_000,
      handNumber: 3,
      id: 'moment-1',
      playerId: 'player-7',
      reactionId: 'cheer' as const,
      roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      seat: 7,
      seatCount: 9 as const,
    };
    expect(() => createTableMomentEnvelope({ ...base, atMs: 0 })).toThrow();
    expect(() => createTableMomentEnvelope({ ...base, handNumber: -1 })).toThrow();
    expect(() => createTableMomentEnvelope({ ...base, reactionId: 'banana' as never })).toThrow();
    expect(() => createTableMomentEnvelope({ ...base, id: '' })).toThrow();
    expect(() => createTableMomentEnvelope({
      ...base,
      id: 'x'.repeat(TABLE_MOMENT_MAX_PAYLOAD_ID_LENGTH + 1),
    })).toThrow();
    expect(() => createTableMomentEnvelope({ ...base, seat: 9 })).toThrow();
    expect(() => createTableMomentEnvelope({ ...base, seat: -1 })).toThrow();
  });

  it('strictly parses client moment requests without a client-supplied seat', () => {
    const parsed = parseTableMomentRequest({
      handNumber: 3,
      id: 'moment:user-1:3:cheer:7',
      protocolVersion: 1,
      reactionId: 'cheer',
      roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    expect(parsed).toEqual({
      handNumber: 3,
      id: 'moment:user-1:3:cheer:7',
      protocolVersion: 1,
      reactionId: 'cheer',
      roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
  });

  it('rejects malformed and future-protocol moment requests', () => {
    const valid = {
      handNumber: 3,
      id: 'moment-1',
      protocolVersion: 1,
      reactionId: 'cheer' as const,
      roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    };
    expect(parseTableMomentRequest({ ...valid, protocolVersion: 3 })).toBeNull();
    expect(parseTableMomentRequest({ ...valid, protocolVersion: 0 })).toBeNull();
    expect(parseTableMomentRequest({ ...valid, protocolVersion: '1' })).toBeNull();
    expect(parseTableMomentRequest({ ...valid, protocolVersion: 1.5 })).toBeNull();
    expect(parseTableMomentRequest({ ...valid, reactionId: 'banana' })).toBeNull();
    expect(parseTableMomentRequest({ ...valid, id: '' })).toBeNull();
    expect(parseTableMomentRequest({
      ...valid,
      id: 'x'.repeat(TABLE_MOMENT_MAX_PAYLOAD_ID_LENGTH + 1),
    })).toBeNull();
    expect(parseTableMomentRequest({ ...valid, handNumber: 1.5 })).toBeNull();
    expect(parseTableMomentRequest({ ...valid, handNumber: -1 })).toBeNull();
    expect(parseTableMomentRequest({ ...valid, roomId: 'room-test' })).toBeNull();
    expect(parseTableMomentRequest({ ...valid, roomId: 'not-a-uuid' })).toBeNull();
    expect(parseTableMomentRequest(null)).toBeNull();
    expect(parseTableMomentRequest([])).toBeNull();
    expect(parseTableMomentRequest('moment')).toBeNull();
    // A seat is never accepted from the client; the request shape has no seat.
    expect('seat' in (parseTableMomentRequest({ ...valid, seat: 3 }) ?? {})).toBe(false);
  });
});

describe('table moment expiry and rate-limit helpers', () => {
  it('drops envelopes that are too old or stamped impossibly far in the future', () => {
    const moment = {
      atMs: 100_000,
      handNumber: 1,
      id: 'm-1',
      playerId: 'p',
      protocolVersion: 1 as const,
      reactionId: 'cheer' as const,
      roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      seat: 0,
    };
    expect(tableMomentEnvelopeIsFresh(moment, 103_000)).toBe(true);
    expect(tableMomentEnvelopeIsFresh(moment, 110_000)).toBe(true);
    expect(tableMomentEnvelopeIsFresh(moment, 110_001)).toBe(false);
    expect(tableMomentEnvelopeIsFresh(moment, 69_999)).toBe(false);
    expect(tableMomentEnvelopeIsFresh(moment, 103_000, { maxAgeMs: 1_000 })).toBe(false);
  });

  it('treats a replayed payload id as a duplicate', () => {
    expect(tableMomentPayloadIdIsNew(new Set(['a', 'b']), 'c')).toBe(true);
    expect(tableMomentPayloadIdIsNew(new Set(['a', 'b']), 'a')).toBe(false);
  });
});
