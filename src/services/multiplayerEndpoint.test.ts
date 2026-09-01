import { describe, expect, it } from 'vitest';

import {
  PREVIEW_MULTIPLAYER_FUNCTION_NAME,
  PRODUCTION_MULTIPLAYER_FUNCTION_NAME,
  V4_MULTIPLAYER_FUNCTION_NAME,
  resolveMultiplayerFunctionName,
} from './multiplayerEndpoint';

describe('multiplayer Edge endpoint selection', () => {
  it('keeps production on the canonical worker by default', () => {
    expect(resolveMultiplayerFunctionName(undefined))
      .toBe(PRODUCTION_MULTIPLAYER_FUNCTION_NAME);
  });

  it('allows the reviewed internal preview worker', () => {
    expect(resolveMultiplayerFunctionName(PREVIEW_MULTIPLAYER_FUNCTION_NAME))
      .toBe(PREVIEW_MULTIPLAYER_FUNCTION_NAME);
  });

  it('allows the isolated public v4 worker', () => {
    expect(resolveMultiplayerFunctionName(V4_MULTIPLAYER_FUNCTION_NAME))
      .toBe(V4_MULTIPLAYER_FUNCTION_NAME);
  });

  it('fails closed to production for arbitrary public environment values', () => {
    expect(resolveMultiplayerFunctionName('attacker-controlled-function'))
      .toBe(PRODUCTION_MULTIPLAYER_FUNCTION_NAME);
    expect(resolveMultiplayerFunctionName('multiplayer-room-preview '))
      .toBe(PRODUCTION_MULTIPLAYER_FUNCTION_NAME);
  });
});
