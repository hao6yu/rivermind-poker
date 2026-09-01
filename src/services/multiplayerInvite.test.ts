import { describe, expect, it } from 'vitest';

import {
  buildMultiplayerInviteUrl,
  buildMultiplayerInviteUrlIfAvailable,
  multiplayerInviteContract,
  parseMultiplayerInviteUrl,
} from './multiplayerInvite';

describe('multiplayer invite links', () => {
  it('round-trips the v4 room locator and nothing private', () => {
    const url = buildMultiplayerInviteUrl('4042106');
    expect(url).toBe('rivermind://join?code=4042106');
    expect(parseMultiplayerInviteUrl(url)).toEqual({ roomCode: '4042106' });
    expect(url).not.toMatch(/roomId|player|token|auth/i);
  });

  it('accepts scheme case but keeps the route and query contract strict', () => {
    expect(parseMultiplayerInviteUrl('RIVERMIND://join/?code=4724826')).toEqual({ roomCode: '4724826' });
    expect(parseMultiplayerInviteUrl('rivermind://other?code=4724826')).toBeNull();
    expect(parseMultiplayerInviteUrl('https://example.com/join?code=4724826')).toBeNull();
    expect(parseMultiplayerInviteUrl('rivermind://join?room=4724826')).toBeNull();
    expect(parseMultiplayerInviteUrl('rivermind://join?code=4724826&player=1')).toBeNull();
    expect(parseMultiplayerInviteUrl('rivermind://join?code=4724826#extra')).toBeNull();
  });

  it('rejects malformed and legacy room codes', () => {
    expect(() => buildMultiplayerInviteUrl('12345')).toThrow(/seven-digit/i);
    expect(parseMultiplayerInviteUrl('rivermind://join?code=12345')).toBeNull();
    expect(parseMultiplayerInviteUrl('rivermind://join?code=724826')).toBeNull();
    expect(parseMultiplayerInviteUrl('rivermind://join?code=5123456')).toBeNull();
    expect(parseMultiplayerInviteUrl('rivermind://join?code=RMK724')).toBeNull();
    expect(parseMultiplayerInviteUrl('not a url')).toBeNull();
    expect(multiplayerInviteContract).toEqual({ host: 'join', scheme: 'rivermind' });
  });

  it('keeps code-less server recovery playable without constructing an invite', () => {
    expect(buildMultiplayerInviteUrlIfAvailable('')).toBeNull();
    expect(buildMultiplayerInviteUrlIfAvailable('12345')).toBeNull();
    expect(buildMultiplayerInviteUrlIfAvailable(' 4042106 '))
      .toBe('rivermind://join?code=4042106');
  });
});
