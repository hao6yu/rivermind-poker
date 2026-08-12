/**
 * The multiplayer UX can be exercised in development before server-authoritative
 * rooms exist, without exposing a dead create/join path in release builds.
 */
export const multiplayerPreviewEnabled = process.env.EXPO_PUBLIC_MULTIPLAYER_PREVIEW === '1';
