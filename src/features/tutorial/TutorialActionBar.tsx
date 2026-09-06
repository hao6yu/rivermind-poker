import { Ionicons } from '@expo/vector-icons';
import { useMemo, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { BeginnerTutorialState, TutorialActionId } from '../../domain/tutorial/beginnerTutorial';
import { stepOptions } from '../../domain/tutorial/beginnerTutorial';
import { useLocalization } from '../../localization';
import type { MessageKey } from '../../localization/messages';
import { RADIUS } from '../../theme/designTokens';
import { type ThemePalette, useAppTheme } from '../../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const ACTION_ICONS: Record<TutorialActionId, IconName> = {
  bet: 'cash-outline',
  call: 'hand-right-outline',
  check: 'checkmark-circle-outline',
  fold: 'close-circle-outline',
  raise: 'trending-up-outline',
};

/**
 * Typed label keys — the real table's amount templates, reused verbatim
 * (review finding #16): amount-bearing actions render the template keys and
 * amountless actions the plain keys, so `{{amount}}` can never render
 * unresolved.
 */
const ACTION_LABEL_KEYS: Record<TutorialActionId, MessageKey> = {
  bet: 'poker.action.betAmount',
  call: 'poker.action.callAmount',
  check: 'poker.action.check',
  fold: 'poker.action.fold',
  raise: 'poker.action.raiseTo',
};

const ACTION_PLAIN_LABEL_KEYS: Record<TutorialActionId, MessageKey> = {
  bet: 'poker.action.bet',
  call: 'poker.action.call',
  check: 'poker.action.check',
  fold: 'poker.action.fold',
  raise: 'poker.action.raise',
};

/**
 * Only the actions relevant to the current step (plan §4): the recommended
 * action is marked with a checkmark and an "recommended" spoken label; every
 * control is a full-size target. After a non-recommended choice the bar is
 * replaced by the coach card's retry explanation, so unrelated table controls
 * never compete for taps.
 */
export function TutorialActionBar({
  onChoose,
  state,
}: {
  onChoose: (actionId: TutorialActionId) => void;
  state: BeginnerTutorialState;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const options = stepOptions(state.stepId);
  if (options.length === 0 || state.declinedActionId !== null) return null;

  return (
    <View accessibilityLabel={t('tutorial.a11y.coachMessage')} style={styles.bar} testID="tutorial.actionBar">
      {options.map((option) => {
        const label = option.amount !== undefined
          ? t(ACTION_LABEL_KEYS[option.id], { amount: option.amount })
          : t(ACTION_PLAIN_LABEL_KEYS[option.id]);
        return (
          <Pressable
            accessibilityLabel={option.recommended ? t('tutorial.a11y.recommendedAction', { action: label }) : label}
            accessibilityRole="button"
            key={option.id}
            onPress={() => onChoose(option.id)}
            style={({ pressed }) => [
              styles.action,
              option.recommended && styles.actionRecommended,
              pressed && styles.pressed,
            ]}
            testID={`tutorial.action.${option.id}`}
          >
            <Ionicons color={option.recommended ? palette.primaryText : palette.text} name={ACTION_ICONS[option.id]} size={17} />
            <Text
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
              style={[styles.actionText, option.recommended && styles.actionTextRecommended]}
            >
              {label}
            </Text>
            {option.recommended ? (
              <Ionicons color={palette.primaryText} name="checkmark-circle" size={15} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    bar: {
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    action: {
      flex: 1,
      minWidth: 128,
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingHorizontal: 12,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
    },
    actionRecommended: {
      borderColor: palette.primary,
      backgroundColor: palette.primary,
    },
    actionText: { color: palette.text, fontSize: 14, fontWeight: '800' },
    actionTextRecommended: { color: palette.primaryText },
    pressed: { opacity: 0.82 },
  });
}
