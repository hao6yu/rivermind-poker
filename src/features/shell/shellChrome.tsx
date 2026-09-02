import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AiDifficulty } from '../../domain/poker/aiProfiles';
import {
  CASH_GAME_BIG_BLIND,
  QUICK_PLAY_SESSION_CONFIG,
  type PracticeSessionConfig,
} from '../../domain/poker/session';
import {
  DAILY_CHALLENGE_VERSION,
  dailyChallengeStreak,
  type DailyChallengeCheckpoint,
} from '../../domain/poker/dailyChallenge';
import {
  currentDailyChallengeProgress,
  dailyChallengeStreakDatesForVersion,
  type DailyChallengeProgress,
} from '../../domain/poker/dailyChallengeProgress';
import type { LearningGoalId } from '../../domain/learning/guidedProgress';
import { formatChips } from '../../domain/poker/moneyFormat';
import {
  DEFAULT_HUMAN_AVATAR,
  type HumanAvatarReference,
} from '../../domain/playerProfile';
import { loadHumanAvatar, loadPlayerDisplayName } from '../../services/playerProfile';
import type { ActiveMultiplayerRoomRecord } from '../../services/multiplayerRecovery';
import type { MultiplayerFlowMode } from '../multiplayer/multiplayerUx';
import { AvatarButton } from '../../components/AvatarButton';
import {
  type AppLanguage,
  type LanguagePreference,
  type MessageKey,
  useLocalization,
} from '../../localization';
import type { ThemePreference } from '../../theme';
import { useAppTheme } from '../../theme';
import { createStyles } from './shellStyles';

/** Icon names allowed in shell chrome. */
export type IconName = ComponentProps<typeof Ionicons>['name'];
export type MainTab = 'home' | 'learn' | 'play';
export type Screen = MainTab | 'profile' | 'setup' | 'table';
/** A translator bound to the active app language. */
export type Translator = ReturnType<typeof useLocalization>['t'];

/** The app-level launch record for the friend-table flow. */
export interface MultiplayerLaunch {
  id: number;
  initialMode: MultiplayerFlowMode;
  initialRoomCode?: string;
  resumeRecord?: ActiveMultiplayerRoomRecord;
}


export const quickPlayStartingChips = formatChips(QUICK_PLAY_SESSION_CONFIG.startingStackBb * CASH_GAME_BIG_BLIND);

/** The saved human identity (profile v2) rendered at the profile entry point. */
export interface ProfileIdentity {
  avatar: HumanAvatarReference;
  displayName: string;
}

export function loadProfileIdentity(): ProfileIdentity {
  return {
    avatar: loadHumanAvatar() ?? DEFAULT_HUMAN_AVATAR,
    displayName: loadPlayerDisplayName(),
  };
}

export function ScreenScroll({ children, compact = false, tablet = false }: { children: ReactNode; compact?: boolean; tablet?: boolean }) {
  const { palette, scheme } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, scheme), [palette, scheme]);
  return (
    <ScrollView
      contentContainerStyle={[styles.screenContent, compact && styles.homeScreenContent, tablet && styles.screenContentTablet]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      {children}
    </ScrollView>
  );
}

export function ordinal(place: number): string {
  const remainder = place % 100;
  if (remainder >= 11 && remainder <= 13) return `${place}th`;
  if (place % 10 === 1) return `${place}st`;
  if (place % 10 === 2) return `${place}nd`;
  if (place % 10 === 3) return `${place}rd`;
  return `${place}th`;
}

export function dailyChallengeCaption(
  today: string,
  checkpoint: DailyChallengeCheckpoint | null,
  progress: readonly DailyChallengeProgress[],
  language: AppLanguage,
  t: Translator,
): string {
  if (checkpoint) return t('caption.dailyContinue', { hand: checkpoint.tournament.nextHandNumber });
  const todayResult = currentDailyChallengeProgress(progress, today, DAILY_CHALLENGE_VERSION);
  if (todayResult) return t('caption.dailyToday', {
    place: localizedOrdinal(todayResult.bestPlace, language),
    score: todayResult.bestScore,
  });
  const streak = dailyChallengeStreak(
    dailyChallengeStreakDatesForVersion(progress, today, DAILY_CHALLENGE_VERSION),
    today,
  );
  return streak > 0
    ? t('caption.dailyStreak', { streak })
    : t('caption.dailyNew');
}

export function localizedOrdinal(place: number, language: AppLanguage): string {
  return language === 'en' ? ordinal(place) : `第 ${place} 名`;
}



export function difficultySummary(difficulty: AiDifficulty, t: Translator): string {
  return t(`difficulty.${difficulty}Summary`);
}

export function languageLabel(language: AppLanguage, t: Translator): string {
  if (language === 'zh-Hans') return t('language.zhHans');
  if (language === 'zh-Hant') return t('language.zhHant');
  return t('language.en');
}

export function languagePreferenceLabel(preference: LanguagePreference, t: Translator): string {
  return preference === 'system' ? t('language.system') : languageLabel(preference, t);
}

export function learningGoalTitle(goal: LearningGoalId, t: Translator): string {
  return t(`guided.goal.${goal}.title` as MessageKey);
}

export function themePreferenceLabel(preference: ThemePreference, t: Translator): string {
  return t(`settings.theme.${preference}`);
}

export function localizedSessionLength(
  target: PracticeSessionConfig['handTarget'],
  t: Translator,
): string {
  return target === 'open' ? t('setup.open') : t('setup.handCount', { count: target });
}

export function ScreenHeader({
  eyebrow,
  identity,
  title,
  onProfile,
}: {
  eyebrow: string;
  identity: ProfileIdentity;
  title: string;
  onProfile: () => void;
}) {
  const { palette, scheme } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, scheme), [palette, scheme]);
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>{title}</Text>
      </View>
      <AvatarButton
        accessibilityLabel={t('common.openProfile')}
        avatar={identity.avatar}
        displayName={identity.displayName}
        onPress={onProfile}
      />
    </View>
  );
}

export function BackHeader({ large = false, title, onBack }: { large?: boolean; title: string; onBack: () => void }) {
  const { palette, scheme } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, scheme), [palette, scheme]);
  return (
    <View style={[styles.backHeader, large && styles.backHeaderLarge]}>
      <Pressable accessibilityLabel={t('common.back')} accessibilityRole="button" onPress={onBack} style={[styles.backButton, large && styles.backButtonLarge]} testID="nav.back">
        <Ionicons color={palette.text} name="arrow-back" size={large ? 23 : 19} />
      </Pressable>
      <Text accessibilityRole="header" numberOfLines={2} style={[styles.backTitle, large && styles.backTitleLarge]}>{title}</Text>
      <View style={[styles.backSpacer, large && styles.backSpacerLarge]} />
    </View>
  );
}

export function MenuRow({
  accent = 'indigo',
  badge,
  compact = false,
  description,
  disabled = false,
  flat = false,
  icon,
  label,
  large = false,
  onPress,
  testID,
}: {
  accent?: 'indigo' | 'aqua' | 'danger';
  badge?: string;
  compact?: boolean;
  description?: string;
  disabled?: boolean;
  flat?: boolean;
  icon: IconName;
  label: string;
  large?: boolean;
  onPress?: () => void;
  /** P18-034: stable automation id so flows never select on English copy. */
  testID?: string;
}) {
  const { palette, scheme } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, scheme), [palette, scheme]);
  const accentColor = accent === 'aqua'
    ? palette.aqua
    : accent === 'danger' ? palette.danger : palette.muted;
  const content = (
    <>
      <View style={[
        styles.menuIcon,
        compact && styles.menuIconCompact,
        large && styles.menuIconLarge,
        accent === 'aqua' && styles.menuIconAqua,
        accent === 'danger' && styles.menuIconDanger,
      ]}>
        <Ionicons color={accentColor} name={icon} size={large ? 23 : compact ? 17 : 19} />
      </View>
      <View style={styles.menuCopy}>
        <View style={styles.menuLabelRow}>
          <Text style={[
            styles.menuLabel,
            compact && styles.menuLabelCompact,
            large && styles.menuLabelLarge,
            accent === 'danger' && styles.menuLabelDanger,
          ]}>{label}</Text>
          {badge ? <Text numberOfLines={1} style={styles.menuBadge}>{badge}</Text> : null}
        </View>
        {description && <Text numberOfLines={large ? 2 : 1} style={[styles.secondaryText, compact && styles.secondaryTextCompact, large && styles.secondaryTextLarge]}>{description}</Text>}
      </View>
      <Ionicons color={palette.muted} name="chevron-forward" size={large ? 22 : compact ? 16 : 18} />
    </>
  );
  const style: ViewStyle[] = [styles.menuRow];
  if (compact) style.push(styles.menuRowCompact);
  if (large) style.push(styles.menuRowLarge);
  style.push(flat ? styles.menuRowFlat : styles.surface);
  if (flat && large) style.push(styles.menuRowFlatLarge);
  if (disabled) style.push(styles.disabled);
  return onPress ? (
    <Pressable
      accessibilityLabel={[label, badge, description].filter(Boolean).join('. ')}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      {...(testID ? { testID } : {})}
      style={({ pressed }) => [...style, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  ) : <View style={style}>{content}</View>;
}

export function PrimaryButton({ disabled = false, label, onPress }: { disabled?: boolean; label: string; onPress?: () => void }) {
  const { palette, scheme } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, scheme), [palette, scheme]);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <Text style={styles.primaryButtonLabel}>{label}</Text>
    </Pressable>
  );
}

export function BottomTabs({ active, onSelect }: { active: MainTab; onSelect: (tab: MainTab) => void }) {
  const { palette, scheme } = useAppTheme();
  const { t } = useLocalization();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(palette, scheme), [palette, scheme]);
  const tabs: Array<{ key: MainTab; label: string; activeIcon: IconName; icon: IconName }> = [
    { key: 'home', label: t('tabs.home'), activeIcon: 'home', icon: 'home-outline' },
    { key: 'learn', label: t('tabs.learn'), activeIcon: 'school', icon: 'school-outline' },
    { key: 'play', label: t('tabs.play'), activeIcon: 'game-controller', icon: 'game-controller-outline' },
  ];
  return (
    <View style={[styles.tabs, { height: 58 + insets.bottom, paddingBottom: insets.bottom }]}>
      {tabs.map((tab) => {
        const selected = active === tab.key;
        return (
          <Pressable
            accessibilityLabel={tab.label}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={tab.key}
            onPress={() => onSelect(tab.key)}
            // P18-034: stable tab selectors for the locale-independent smoke flow.
            testID={`tab.${tab.key}`}
            style={styles.tab}
          >
            <Ionicons color={selected ? palette.primary : palette.muted} name={selected ? tab.activeIcon : tab.icon} size={21} />
            <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A labelled, collapsible band of Play destinations. Groups stay open by
 * default so nothing a player used before is hidden on first visit; collapsing
 * is there for people who already know where they are going.
 */
export function PlayGroup({
  children,
  defaultOpen = true,
  label,
  testID,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  label: string;
  /** P18-034: stable automation id for the locale-independent flows. */
  testID?: string;
}) {
  const { palette, scheme } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, scheme), [palette, scheme]);
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.playGroup} {...(testID ? { testID } : {})}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={({ pressed }) => [styles.playGroupHeader, pressed && styles.pressed]}
      >
        <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.playGroupLabel}>
          {label}
        </Text>
        <Ionicons color={palette.muted} name={open ? 'chevron-up' : 'chevron-down'} size={16} />
      </Pressable>
      {open ? children : null}
    </View>
  );
}
