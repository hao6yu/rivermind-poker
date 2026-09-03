import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

type IoniconsProps = ComponentProps<typeof Ionicons>;

/**
 * Decorative icon glyph that is invisible to accessibility clients
 * (P18-011).
 *
 * Ionicons renders a Text node whose private-use-area glyph can surface in
 * the Android accessibility tree as a decorative, unlabeled node. Every
 * icon inside a labelled control goes through this wrapper, which hides the
 * glyph subtree while the parent control keeps its own useful label. Icons
 * that ARE the content of a standalone accessible control should keep using
 * `Ionicons` directly.
 */
export function DecorativeIcon({ color, ...props }: IoniconsProps) {
  return (
    <Ionicons
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      color={color}
      {...props}
    />
  );
}
