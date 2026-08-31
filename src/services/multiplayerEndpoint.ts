export const PRODUCTION_MULTIPLAYER_FUNCTION_NAME = 'multiplayer-room';
export const PREVIEW_MULTIPLAYER_FUNCTION_NAME = 'multiplayer-room-preview';

export type MultiplayerFunctionName =
  | typeof PRODUCTION_MULTIPLAYER_FUNCTION_NAME
  | typeof PREVIEW_MULTIPLAYER_FUNCTION_NAME;

/**
 * Keeps production builds on the canonical worker unless an internal build
 * opts into the one reviewed preview alias. Arbitrary function names are not
 * accepted from the public Expo environment.
 */
export function resolveMultiplayerFunctionName(
  configuredName: string | undefined,
): MultiplayerFunctionName {
  return configuredName === PREVIEW_MULTIPLAYER_FUNCTION_NAME
    ? PREVIEW_MULTIPLAYER_FUNCTION_NAME
    : PRODUCTION_MULTIPLAYER_FUNCTION_NAME;
}

export const multiplayerFunctionName = resolveMultiplayerFunctionName(
  process.env.EXPO_PUBLIC_MULTIPLAYER_FUNCTION_NAME,
);
