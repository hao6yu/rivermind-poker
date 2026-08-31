import { Text, type TextProps } from 'react-native';

import { useAppTheme } from '../theme';

interface SuitAwareTextProps extends Omit<TextProps, 'children'> {
  text: string;
}

const redCardPattern = /((?:10|[2-9TJQKA])[\u2665\u2666])/gi;
const exactRedCardPattern = /^(?:10|[2-9TJQKA])[\u2665\u2666]$/i;

export function SuitAwareText({ text, ...textProps }: SuitAwareTextProps) {
  const { palette } = useAppTheme();
  const segments = text.split(redCardPattern);

  return (
    <Text {...textProps}>
      {segments.map((segment, index) => exactRedCardPattern.test(segment) ? (
        <Text key={`${segment}-${index}`} style={{ color: palette.textRed }}>{segment}</Text>
      ) : segment)}
    </Text>
  );
}
