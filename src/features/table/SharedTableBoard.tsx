import { View, type ViewStyle } from 'react-native';

import { PlayingCard } from '../../components/PlayingCard';
import type { Card } from '../../domain/poker/types';
import type { SharedTableCardVariant } from './tableVisualDensity';

export function SharedTableBoard({
  board,
  gap = 4,
  variant,
  visibleCount = board.length,
}: {
  board: readonly Card[];
  gap?: number;
  variant: SharedTableCardVariant;
  visibleCount?: number;
}) {
  const row: ViewStyle = {
    alignItems: 'center',
    flexDirection: 'row',
    gap,
    justifyContent: 'center',
  };
  return (
    <View style={row}>
      {Array.from({ length: 5 }, (_, index) => (
        <PlayingCard
          card={index < visibleCount ? board[index] : undefined}
          compact={variant === 'compact'}
          key={`board-${index}`}
          medium={variant === 'medium'}
          mini={variant === 'mini'}
          small={variant === 'small'}
        />
      ))}
    </View>
  );
}
