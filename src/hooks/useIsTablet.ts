import { useWindowDimensions } from 'react-native';

/**
 * P18-045 — the shared tablet detection. The shell's tablet layouts key off
 * the window's SHORTEST side, so a landscape phone never receives the tablet
 * layout and a landscape tablet keeps it. The 700pt threshold is the value
 * every screen already used in portrait.
 */
export function useIsTablet(): boolean {
  const { width, height } = useWindowDimensions();
  return Math.min(width, height) >= 700;
}
