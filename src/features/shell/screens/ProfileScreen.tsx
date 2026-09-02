import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AvatarButton } from '../../../components/AvatarButton';
import { HumanAvatarProfilePicker } from '../../../components/HumanAvatarProfilePicker';
import { OpponentReadCard } from '../../../components/OpponentReadCard';
import {
  DEFAULT_HUMAN_AVATAR,
  type HumanAvatarReference,
  validatePlayerDisplayName,
} from '../../../domain/playerProfile';
import { championshipAchievements, type ChampionshipProgress } from '../../../domain/poker/championship';
import type { OpponentMemory } from '../../../domain/poker/opponentMemory';
import {
  type AppLanguage,
  type MessageKey,
  useLocalization,
} from '../../../localization';
import { accountDeletionMessage } from '../../../localization/accountDeletionMessages';
import { deleteCurrentAccount } from '../../../services/accountDeletion';
import { useGameFeedbackPreferences } from '../../../services/gameFeedbackPreferences';
import { deleteAllHandHistory, loadRecentHandHistory } from '../../../services/handHistory';
import { deleteAllMultiplayerHandHistory } from '../../../services/multiplayer';
import { loadPlayStatistics } from '../../../services/playStatistics';
import {
  DEFAULT_PLAYER_DISPLAY_NAME,
  PLAYER_DISPLAY_NAME_MAX_LENGTH,
  loadHumanAvatar,
  loadPlayerDisplayName,
  loadPlayerProfile,
  savePlayerDisplayName,
} from '../../../services/playerProfile';
import { type ThemePreference, useAppTheme } from '../../../theme';
import type { CoachFocusArea } from '../../../domain/poker/types';
import type { LearningProgressEntry } from '../../../domain/learning/types';
import type { PlayStatistics } from '../../../domain/stats/playStatistics';
import { loadTableMomentPreferences, saveTableMomentPreferences } from '../../multiplayer/tableMomentPreferencesStore';
import { PlayStatisticsCard } from '../../profile/PlayStatisticsCard';
import { ProgressModal } from '../../profile/ProgressModal';
import { HandReplayModal } from '../../table/HandReplayModal';
import type { SessionHandRecord } from '../../table/sessionModels';
import { SessionHistoryModal } from '../../table/SessionHistoryModal';
import { BetaFeedbackModal } from '../BetaFeedbackModal';
import { BetaInfoModal } from '../BetaInfoModal';
import { BackHeader, MenuRow, ScreenScroll, languageLabel, languagePreferenceLabel, themePreferenceLabel } from '../shellChrome';
import { useIsTablet } from '../../../hooks/useIsTablet';
import { createStyles } from '../shellStyles';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { ModalBackdrop } from '../../../components/ModalBackdrop';
import { LANGUAGE_PREFERENCES } from '../../../localization';
import { Modal } from 'react-native';

export function ProfileScreen({
  championshipProgress,
  learningProgress,
  onAccountDeleted,
  onBack,
  onDeleteChampionshipProgress,
  onDeleteDailyChallengeProgress,
  onDeleteLearningProgress,
  onOpenChampionshipRecord,
  onPracticeFocus,
  onResetOpponentMemory,
  opponentMemory,
}: {
  championshipProgress: ChampionshipProgress;
  learningProgress: LearningProgressEntry[];
  onAccountDeleted: () => void;
  onBack: () => void;
  onDeleteChampionshipProgress: () => void;
  onDeleteDailyChallengeProgress: () => Promise<void>;
  onDeleteLearningProgress: () => Promise<void>;
  onOpenChampionshipRecord: () => void;
  onPracticeFocus: (focus: Exclude<CoachFocusArea, 'none'>) => void;
  onResetOpponentMemory: () => void;
  opponentMemory: OpponentMemory;
}) {
  const { palette, preference: themePreference, setPreference: setThemePreference } = useAppTheme();
  const { language, preference: languagePreference, t } = useLocalization();
  const { hapticsEnabled, setHapticsEnabled } = useGameFeedbackPreferences();
  // Slice 3.11E: the global Mute table moments preference lives in Profile
  // Preferences; the reaction menu no longer hosts it.
  const [momentMuteAll, setMomentMuteAll] = useState(() => loadTableMomentPreferences().muteAll);
  useEffect(() => {
    saveTableMomentPreferences({ ...loadTableMomentPreferences(), muteAll: momentMuteAll });
  }, [momentMuteAll]);
  const tablet = useIsTablet();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [savedHands, setSavedHands] = useState<SessionHandRecord[]>([]);
  // P18-024: the saved-hand history loads asynchronously; Progress must show
  // a loading state instead of zero-value metrics while it is in flight.
  const [savedHandsLoading, setSavedHandsLoading] = useState(true);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [progressVisible, setProgressVisible] = useState(false);
  const [betaInfoVisible, setBetaInfoVisible] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const [accountDeletionPending, setAccountDeletionPending] = useState(false);
  const [replayHand, setReplayHand] = useState<SessionHandRecord | null>(null);
  const [playerName, setPlayerName] = useState(
    () => loadPlayerDisplayName() || DEFAULT_PLAYER_DISPLAY_NAME,
  );
  const [nameText, setNameText] = useState(() =>
    loadPlayerProfile()?.displayName || DEFAULT_PLAYER_DISPLAY_NAME,
  );
  const [nameError, setNameError] = useState<MessageKey | null>(null);
  // The name editor is hidden until the player asks for it, so the identity
  // header reads as a player card rather than a form field.
  const [nameEditing, setNameEditing] = useState(false);
  const [profileAvatar, setProfileAvatar] = useState<HumanAvatarReference>(
    () => loadHumanAvatar() ?? DEFAULT_HUMAN_AVATAR,
  );
  // The avatar editor is a focused sheet opened from the identity header;
  // nothing about identity editing lives in a separate scrolling card.
  const [avatarEditorVisible, setAvatarEditorVisible] = useState(false);
  const startNameEdit = (): void => {
    setNameText(playerName);
    setNameError(null);
    setNameEditing(true);
  };
  const cancelNameEdit = (): void => {
    setNameText(playerName);
    setNameError(null);
    setNameEditing(false);
  };
  const handleNameSave = (): void => {
    const result = validatePlayerDisplayName(nameText);
    if (result.ok) {
      const saved = savePlayerDisplayName(result.value);
      if (saved) {
        setPlayerName(saved);
        setNameError(null);
        setNameEditing(false);
      }
    } else if (result.reason === 'too-short') {
      setNameError('settings.nameTooShort');
    } else if (result.reason === 'too-long') {
      setNameError('settings.nameTooLong');
    } else if (result.reason === 'contact-information') {
      setNameError('settings.nameContactInfo');
    } else {
      setNameError('settings.nameInvalidCharacter');
    }
  };
  const championshipAchievementsList = championshipAchievements(championshipProgress);
  const unlockedChampionshipAchievements = championshipAchievementsList.filter((achievement) => achievement.unlocked).length;
  useEffect(() => {
    let active = true;
    void loadRecentHandHistory()
      .then((hands) => {
        if (active) setSavedHands(hands);
      })
      .finally(() => {
        if (active) setSavedHandsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  // The play record spans all three table types, so it is read separately from
  // the saved-hand list that the history and progress sheets use.
  const [playStatistics, setPlayStatistics] = useState<PlayStatistics | null>(null);
  const [statisticsLoading, setStatisticsLoading] = useState(true);
  const refreshPlayStatistics = (): void => {
    setStatisticsLoading(true);
    void loadPlayStatistics({ includePrivate: true })
      .then(setPlayStatistics)
      .catch(() => setPlayStatistics(null))
      .finally(() => setStatisticsLoading(false));
  };
  useEffect(() => {
    refreshPlayStatistics();
    // One read per visit to the profile: the record only changes through a
    // finished hand, which cannot happen while this screen is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const openHandHistory = () => {
    setHistoryVisible(true);
    setSavedHandsLoading(true);
    void loadRecentHandHistory()
      .then(setSavedHands)
      .finally(() => setSavedHandsLoading(false));
  };
  const confirmDeleteHistory = () => {
    Alert.alert(
      t('settings.deleteTitle'),
      t('settings.deleteMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            onDeleteChampionshipProgress();
            void Promise.all([
              deleteAllHandHistory(),
              deleteAllMultiplayerHandHistory(),
              onDeleteLearningProgress(),
              onDeleteDailyChallengeProgress(),
            ])
              .then(() => {
                setSavedHands([]);
                refreshPlayStatistics();
              })
              .catch(() => Alert.alert(t('settings.deleteFailedTitle'), t('settings.deleteFailedMessage')));
          },
        },
      ],
    );
  };
  const confirmDeleteAccount = () => {
    if (accountDeletionPending) return;
    Alert.alert(
      accountDeletionMessage(language, 'settings.deleteAccountTitle'),
      accountDeletionMessage(language, 'settings.deleteAccountMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: accountDeletionMessage(language, 'settings.deleteAccountConfirm'),
          style: 'destructive',
          onPress: () => {
            setAccountDeletionPending(true);
            void deleteCurrentAccount()
              .then(onAccountDeleted)
              .catch(() => {
                setAccountDeletionPending(false);
                Alert.alert(
                  accountDeletionMessage(language, 'settings.deleteAccountFailedTitle'),
                  accountDeletionMessage(language, 'settings.deleteAccountFailedMessage'),
                );
              });
          },
        },
      ],
    );
  };
  const confirmResetOpponentMemory = () => {
    Alert.alert(
      t('settings.resetLearningTitle'),
      t('settings.resetLearningMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.reset'), style: 'destructive', onPress: onResetOpponentMemory },
      ],
    );
  };
  return (
    <>
      <ScreenScroll tablet={tablet}>
        <BackHeader large={tablet} title={t('settings.title')} onBack={onBack} />
        <View style={[styles.identityHeader, tablet && styles.identityHeaderTablet]}>
          <AvatarButton
            accessibilityLabel={t('profile.identity.editAvatar')}
            avatar={profileAvatar}
            badge="camera"
            displayName={playerName}
            onPress={() => setAvatarEditorVisible(true)}
          />
          <View style={styles.identityCopy}>
            <Text maxFontSizeMultiplier={1.3} numberOfLines={2} style={[styles.identityName, tablet && styles.identityNameTablet]}>
              {playerName}
            </Text>
          </View>
          {nameEditing ? null : (
            <Pressable
              accessibilityLabel={t('profile.identity.editName')}
              accessibilityRole="button"
              hitSlop={6}
              onPress={startNameEdit}
              style={({ pressed }) => [styles.identityEdit, pressed && styles.pressed]}
            >
              <Ionicons color={palette.primary} name="pencil-outline" size={15} />
              <Text maxFontSizeMultiplier={1.4} style={styles.identityEditLabel}>{t('profile.identity.editName')}</Text>
            </Pressable>
          )}
        </View>
        {nameEditing ? (
          <View style={[styles.surface, tablet && styles.profileSurfaceTablet]}>
            <Text style={styles.fieldLabel}>{t('settings.nameLabel')}</Text>
            <View style={[styles.nameInputRow, tablet && styles.nameInputRowTablet]}>
              <TextInput
                autoCapitalize="words"
                autoCorrect={false}
                autoFocus
                maxLength={PLAYER_DISPLAY_NAME_MAX_LENGTH}
                returnKeyType="done"
                submitBehavior="submit"
                style={[styles.nameInput, tablet && styles.nameInputTablet]}
                value={nameText}
                onChangeText={setNameText}
                onSubmitEditing={handleNameSave}
                accessibilityLabel={t('settings.nameLabel')}
              />
              <Pressable
                accessibilityLabel={t('common.done')}
                accessibilityRole="button"
                onPress={handleNameSave}
                style={({ pressed }) => [
                  styles.saveNameButton,
                  tablet && styles.saveNameButtonTablet,
                  pressed && styles.saveNameButtonPressed,
                  (!nameText.trim()) && styles.disabled,
                ]}
              >
                <Text style={styles.saveNameButtonText}>{t('common.done')}</Text>
              </Pressable>
            </View>
            {nameError && <Text style={styles.nameErrorText}>{t(nameError)}</Text>}
            <Pressable
              accessibilityRole="button"
              onPress={cancelNameEdit}
              style={({ pressed }) => [styles.cancelNameButton, pressed && styles.pressed]}
            >
              <Text style={styles.cancelNameButtonText}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        ) : null}
        <PlayStatisticsCard large={tablet} loading={statisticsLoading} statistics={playStatistics} />
        <View style={[styles.surface, tablet && styles.profileSurfaceTablet]}>
          <Text style={[styles.surfaceTitle, tablet && styles.profileSurfaceTitleTablet]}>{t('settings.preferences')}</Text>
          <View style={styles.appearanceRow}>
            <Text style={[styles.preferenceSectionLabel, tablet && styles.preferenceSectionLabelTablet]}>{t('settings.appearance')}</Text>
            <View style={[styles.appearanceSegment, tablet && styles.profileAppearanceOptionsTablet]}>
              {(['system', 'light', 'dark'] as ThemePreference[]).map((option) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: themePreference === option }}
                  key={option}
                  onPress={() => setThemePreference(option)}
                  style={[styles.appearanceOption, tablet && styles.profileAppearanceOptionTablet, themePreference === option && styles.appearanceOptionSelected]}
                >
                  <Ionicons
                    color={themePreference === option ? palette.primaryText : palette.muted}
                    name={option === 'system' ? 'phone-portrait-outline' : option === 'light' ? 'sunny-outline' : 'moon-outline'}
                    size={tablet ? 25 : 19}
                  />
                  <Text style={[styles.appearanceLabel, tablet && styles.profileAppearanceLabelTablet, themePreference === option && styles.appearanceLabelSelected]}>
                    {themePreferenceLabel(option, t)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={[styles.preferenceDivider, tablet && styles.preferenceDividerTablet]} />
          <View style={styles.feedbackPreferenceList}>
            <View style={[styles.feedbackPreferenceRow, tablet && styles.feedbackPreferenceRowTablet]}>
              <View style={[styles.feedbackPreferenceIcon, tablet && styles.feedbackPreferenceIconTablet]}>
                <Ionicons color={palette.primary} name="phone-portrait-outline" size={tablet ? 25 : 20} />
              </View>
              <View style={styles.menuCopy}>
                <Text style={[styles.feedbackPreferenceLabel, tablet && styles.feedbackPreferenceLabelTablet]}>{t('settings.haptics')}</Text>
                <Text style={[styles.feedbackPreferenceDescription, tablet && styles.feedbackPreferenceDescriptionTablet]}>{t('settings.hapticsDescription')}</Text>
              </View>
              <Switch
                accessibilityHint={t('settings.hapticsDescription')}
                accessibilityLabel={t('settings.hapticsA11y')}
                accessibilityRole="switch"
                accessibilityState={{ checked: hapticsEnabled }}
                hitSlop={8}
                ios_backgroundColor={palette.border}
                onValueChange={setHapticsEnabled}
                thumbColor={palette.surface}
                trackColor={{ false: palette.border, true: palette.primary }}
                value={hapticsEnabled}
              />
            </View>
            <View style={[styles.feedbackPreferenceRow, tablet && styles.feedbackPreferenceRowTablet]}>
              <View style={[styles.feedbackPreferenceIcon, tablet && styles.feedbackPreferenceIconTablet]}>
                <Ionicons color={palette.primary} name="chatbubble-ellipses-outline" size={tablet ? 25 : 20} />
              </View>
              <View style={styles.menuCopy}>
                <Text style={[styles.feedbackPreferenceLabel, tablet && styles.feedbackPreferenceLabelTablet]}>{t('settings.muteMoments')}</Text>
                <Text style={[styles.feedbackPreferenceDescription, tablet && styles.feedbackPreferenceDescriptionTablet]}>{t('settings.muteMomentsDescription')}</Text>
              </View>
              <Switch
                accessibilityHint={t('settings.muteMomentsDescription')}
                accessibilityLabel={t('settings.muteMomentsA11y')}
                accessibilityRole="switch"
                accessibilityState={{ checked: momentMuteAll }}
                hitSlop={8}
                ios_backgroundColor={palette.border}
                onValueChange={setMomentMuteAll}
                thumbColor={palette.surface}
                trackColor={{ false: palette.border, true: palette.primary }}
                value={momentMuteAll}
              />
            </View>
          </View>
          <View style={[styles.preferenceDivider, tablet && styles.preferenceDividerTablet]} />
          <Pressable
            accessibilityLabel={t('settings.languageChoose')}
            accessibilityRole="button"
            onPress={() => setLanguagePickerVisible(true)}
            style={({ pressed }) => [styles.languageSelector, tablet && styles.profileLanguageSelectorTablet, styles.preferenceLanguageSelector, pressed && styles.pressed]}
          >
            <View style={[styles.languageSelectorIcon, tablet && styles.profileLanguageSelectorIconTablet]}>
              <Ionicons color={palette.primary} name="language-outline" size={tablet ? 25 : 20} />
            </View>
            <View style={styles.menuCopy}>
              <Text style={[styles.menuLabel, tablet && styles.menuLabelLarge]}>{t('settings.language')}</Text>
              <Text style={[styles.secondaryText, tablet && styles.profileSecondaryTextTablet]}>{t('settings.languageCurrent', {
                language: languagePreference === 'system'
                  ? `${languagePreferenceLabel(languagePreference, t)} · ${languageLabel(language, t)}`
                  : languagePreferenceLabel(languagePreference, t),
              })}</Text>
            </View>
            <Ionicons color={palette.muted} name="chevron-down" size={tablet ? 22 : 18} />
          </Pressable>
        </View>
        <OpponentReadCard large={tablet} memory={opponentMemory} onReset={confirmResetOpponentMemory} privacyNote />
        <View style={[styles.flatList, tablet && styles.profileFlatListTablet]}>
          <MenuRow icon="time-outline" label={t('settings.handHistory')} flat large={tablet} onPress={openHandHistory} />
          <MenuRow accent="aqua" icon="bar-chart-outline" label={t('settings.progressStatistics')} flat large={tablet} onPress={() => setProgressVisible(true)} />
          <MenuRow
            icon="ribbon-outline"
            label={t('settings.championshipRecord')}
            description={t('settings.achievements', { complete: unlockedChampionshipAchievements, total: championshipAchievementsList.length })}
            flat
            large={tablet}
            onPress={onOpenChampionshipRecord}
          />
          <MenuRow icon="chatbubble-ellipses-outline" label={t('settings.sendFeedback')} description={t('settings.sendFeedbackDescription')} flat large={tablet} onPress={() => setFeedbackVisible(true)} />
          <MenuRow icon="information-circle-outline" label={t('settings.betaPrivacy')} flat large={tablet} onPress={() => setBetaInfoVisible(true)} />
          <MenuRow icon="trash-outline" label={t('settings.deleteHistory')} flat large={tablet} onPress={confirmDeleteHistory} />
          <MenuRow
            accent="danger"
            description={accountDeletionPending
              ? undefined
              : accountDeletionMessage(language, 'settings.deleteAccountDescription')}
            disabled={accountDeletionPending}
            flat
            icon="trash-bin-outline"
            label={accountDeletionMessage(
              language,
              accountDeletionPending
                ? 'settings.deleteAccountDeleting'
                : 'settings.deleteAccount',
            )}
            large={tablet}
            onPress={confirmDeleteAccount}
          />
        </View>
      </ScreenScroll>
      <SessionHistoryModal
        hands={savedHands}
        onClose={() => setHistoryVisible(false)}
        onPracticeFocus={onPracticeFocus}
        onReplay={(hand) => {
          setHistoryVisible(false);
          setReplayHand(hand);
        }}
        visible={historyVisible}
      />
      <HandReplayModal hand={replayHand} onClose={() => setReplayHand(null)} />
      <ProgressModal
        hands={savedHands}
        learningProgress={learningProgress}
        loading={savedHandsLoading}
        onClose={() => setProgressVisible(false)}
        onPracticeFocus={onPracticeFocus}
        visible={progressVisible}
      />
      <BetaInfoModal
        onClose={() => setBetaInfoVisible(false)}
        onSendFeedback={() => {
          setBetaInfoVisible(false);
          setFeedbackVisible(true);
        }}
        visible={betaInfoVisible}
      />
      <BetaFeedbackModal
        context={{ screen: 'profile' }}
        onClose={() => setFeedbackVisible(false)}
        visible={feedbackVisible}
      />
      <LanguagePickerModal
        large={tablet}
        onClose={() => setLanguagePickerVisible(false)}
        visible={languagePickerVisible}
      />
      {avatarEditorVisible ? (
        <HumanAvatarProfilePicker
          displayName={playerName}
          onClose={() => setAvatarEditorVisible(false)}
          onChange={setProfileAvatar}
          t={t}
        />
      ) : null}
    </>
  );
}

function LanguagePickerModal({ large = false, onClose, visible }: { large?: boolean; onClose: () => void; visible: boolean }) {
  const { palette } = useAppTheme();
  const { language, preference, setPreference, t } = useLocalization();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Modal
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <View style={[styles.languageModalRoot, large && styles.languageModalRootLarge]}>
        <ModalBackdrop accessibilityLabel={t('settings.languageClose')} onPress={onClose} />
        <View style={[styles.languageSheet, large && styles.languageSheetLarge]}>
          <View style={styles.languageSheetHandle} />
          <Text accessibilityRole="header" style={[styles.languageSheetTitle, large && styles.languageSheetTitleLarge]}>{t('settings.languageChoose')}</Text>
          <View style={styles.languageOptions}>
            {LANGUAGE_PREFERENCES.map((option) => {
              const selected = preference === option;
              const optionLanguage = option === 'system' ? language : option;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={option}
                  onPress={() => {
                    setPreference(option);
                    onClose();
                  }}
                  style={({ pressed }) => [styles.languageOption, large && styles.languageOptionLarge, selected && styles.languageOptionSelected, pressed && styles.pressed]}
                >
                  <View style={[styles.languageRadio, large && styles.languageRadioLarge, selected && styles.languageRadioSelected]}>
                    {selected && <View style={styles.languageRadioDot} />}
                  </View>
                  <View style={styles.menuCopy}>
                    <Text style={[styles.languageOptionLabel, large && styles.languageOptionLabelLarge]}>{languagePreferenceLabel(option, t)}</Text>
                    {option === 'system' && (
                      <Text style={[styles.secondaryText, large && styles.profileSecondaryTextTablet]}>{languageLabel(optionLanguage, t)}</Text>
                    )}
                  </View>
                  {selected && <Ionicons color={palette.primary} name="checkmark" size={large ? 24 : 20} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
