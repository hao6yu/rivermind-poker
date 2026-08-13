import { useEffect, useMemo } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { splitActionBubbleCopy } from './actionBubbleCopy';

/** iOS ignores accessibilityLiveRegion, so announce each new action directly. */
export function useActionBubbleAnnouncement(actionKey: string, message: string) {
  useEffect(() => {
    if (Platform.OS === 'ios' && actionKey && message) {
      AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
    }
  }, [actionKey, message]);
}

export function ActionBubbleText({
  emphasis,
  numberOfLines,
  style,
  text,
}: {
  emphasis: string;
  numberOfLines: number;
  style?: StyleProp<TextStyle>;
  text: string;
}) {
  const parts = useMemo(() => splitActionBubbleCopy(text, emphasis), [emphasis, text]);
  return (
    <Text numberOfLines={numberOfLines} style={style}>
      {parts.before}
      {parts.emphasis ? <Text style={styles.emphasis}>{parts.emphasis}</Text> : null}
      {parts.after}
    </Text>
  );
}

const styles = StyleSheet.create({
  emphasis: { fontWeight: '900' },
});
