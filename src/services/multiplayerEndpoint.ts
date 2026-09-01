export const PRODUCTION_MULTIPLAYER_FUNCTION_NAME = 'multiplayer-room';
export const PREVIEW_MULTIPLAYER_FUNCTION_NAME = 'multiplayer-room-preview';
export const V4_MULTIPLAYER_FUNCTION_NAME = 'multiplayer-room-v4';

export type MultiplayerFunctionName =
  | typeof PRODUCTION_MULTIPLAYER_FUNCTION_NAME
  | typeof PREVIEW_MULTIPLAYER_FUNCTION_NAME
  | typeof V4_MULTIPLAYER_FUNCTION_NAME;

/**
 * Keeps production builds on the canonical worker unless an internal build
 * opts into the one reviewed preview alias. Arbitrary function names are not
 * accepted from the public Expo environment.
 */
export function resolveMultiplayerFunctionName(
  configuredName: string | undefined,
): MultiplayerFunctionName {
  if (configuredName === PREVIEW_MULTIPLAYER_FUNCTION_NAME) {
    return PREVIEW_MULTIPLAYER_FUNCTION_NAME;
  }
  if (configuredName === V4_MULTIPLAYER_FUNCTION_NAME) {
    return V4_MULTIPLAYER_FUNCTION_NAME;
  }
  return PRODUCTION_MULTIPLAYER_FUNCTION_NAME;
}

export const multiplayerFunctionName = resolveMultiplayerFunctionName(
  process.env.EXPO_PUBLIC_MULTIPLAYER_FUNCTION_NAME,
);
