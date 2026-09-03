import { Text, type TextProps } from 'react-native';

/**
 * Guided text that honors the OS font scale (P18-027).
 *
 * The two onboarding screens previously disabled OS scaling entirely
 * (`allowFontScaling={false}`) and re-implemented a manual 1.5× cap by
 * rewriting font sizes. That broke the platform contract: users with large
 * accessibility text got fixed-size copy, duplicated in two files. This
 * shared component keeps RN's native scaling pipeline and bounds it with
 * `maxFontSizeMultiplier`, so long copy reflows instead of being frozen.
 */
export function GuidedText({ maxScale = 1.5, style, ...props }: TextProps & { maxScale?: number }) {
  return <Text maxFontSizeMultiplier={maxScale} style={style} {...props} />;
}
