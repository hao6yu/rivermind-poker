// The device-QA alias deliberately re-exports the canonical worker instead of
// copying it. Preview builds therefore exercise the exact release candidate
// while the currently released clients keep using `multiplayer-room`.
export { default } from '../multiplayer-room/index.ts';
