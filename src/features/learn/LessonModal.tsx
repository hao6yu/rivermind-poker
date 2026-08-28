import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { PlayingCard } from '../../components/PlayingCard';
import type { LessonDefinition } from '../../domain/learning/types';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { exampleCardSize, playingCardSizeProps } from './trainingSizing';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import { ModalSafeArea } from './ModalSafeArea';
import { JourneyBanner } from './JourneyBanner';

interface LessonModalProps {
  completed: boolean;
  lesson: LessonDefinition | null;
  onClose: () => void;
  onComplete: (lesson: LessonDefinition) => void;
  journeyEyebrow?: string;
  journeyProgress?: string;
  journeyEndEarly?: () => void;
}

export function LessonModal({ completed, lesson, onClose, onComplete, journeyEyebrow, journeyProgress, journeyEndEarly }: LessonModalProps) {
  const { palette } = useAppTheme();
  const { lessonContent, t } = useLocalization();
  const reduceMotion = useReducedMotion();
  const { height, width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(palette), [palette]);
  // Lesson examples are the concrete part of the lesson, so they size with the
  // viewport instead of staying at the smallest card variant.
  const exampleCardProps = playingCardSizeProps(exampleCardSize({ height, width }));
  const displayedLesson = useMemo(() => lesson ? lessonContent(lesson) : null, [lesson, lessonContent]);

  return (
    <Modal animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} presentationStyle="fullScreen" visible={Boolean(lesson)}>
      <ModalSafeArea>
        {journeyEyebrow && journeyProgress ? <JourneyBanner eyebrow={journeyEyebrow} progress={journeyProgress} onEndEarly={journeyEndEarly ?? (() => undefined)} /> : null}
        {lesson && displayedLesson && (
          <View style={styles.screen}>
            <View style={styles.header}>
              <Pressable
                accessibilityHint={t('learn.backHint')}
                accessibilityLabel={t('learn.backToLearn')}
                accessibilityRole="button"
                hitSlop={12}
                onPress={onClose}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <Ionicons color={palette.text} name="arrow-back" size={21} />
              </Pressable>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>
                  {t(displayedLesson.difficulty === 'intermediate'
                    ? 'learn.intermediateMinutes'
                    : 'learn.lessonMinutes', { minutes: displayedLesson.estimatedMinutes })}
                </Text>
                <Text numberOfLines={2} style={styles.title}>{displayedLesson.title}</Text>
              </View>
              <View style={styles.headerSpacer} />
            </View>

            <ScrollView
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              style={styles.scroller}
            >
              <Text style={styles.intro}>{displayedLesson.description}</Text>
              {displayedLesson.sections.map((section, index) => (
                <View key={section.heading} style={styles.section}>
                  <View style={styles.sectionNumber}>
                    <Text style={styles.sectionNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.sectionTitle}>{section.heading}</Text>
                  <Text style={styles.body}>{section.body}</Text>
                  {section.bullets?.map((bullet) => (
                    <View key={bullet} style={styles.bulletRow}>
                      <View style={styles.bullet} />
                      <Text style={styles.bulletText}>{bullet}</Text>
                    </View>
                  ))}
                  {section.example && (
                    <View style={styles.example}>
                      <View style={styles.exampleHeading}>
                        <Ionicons color={palette.primary} name="albums-outline" size={17} />
                        <Text style={styles.exampleTitle}>{section.example.title}</Text>
                      </View>
                      <View style={styles.exampleCards}>
                        <View style={styles.cardGroup}>
                          <Text style={styles.cardGroupLabel}>{t('learn.holeCards')}</Text>
                          <View style={styles.cardRow}>
                            {section.example.heroCards.map((exampleCard, cardIndex) => (
                              <PlayingCard {...exampleCardProps} card={exampleCard} key={`hero-${cardIndex}`} />
                            ))}
                          </View>
                        </View>
                        {section.example.board?.length ? (
                          <View style={styles.cardGroup}>
                            <Text style={styles.cardGroupLabel}>{t('learn.board')}</Text>
                            <View style={styles.cardRow}>
                              {section.example.board.map((exampleCard, cardIndex) => (
                                <PlayingCard {...exampleCardProps} card={exampleCard} key={`board-${cardIndex}`} />
                              ))}
                            </View>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.exampleDetail}>{section.example.detail}</Text>
                    </View>
                  )}
                  {section.takeaway && (
                    <View style={styles.takeaway}>
                      <Ionicons color={palette.aqua} name="bulb-outline" size={18} />
                      <Text style={styles.takeawayText}>{section.takeaway}</Text>
                    </View>
                  )}
                </View>
              ))}
              <Text style={styles.disclaimer}>{t('learn.disclaimer')}</Text>
            </ScrollView>

            <View style={styles.footer}>
              <Pressable
                accessibilityRole="button"
                onPress={() => completed ? onClose() : onComplete(lesson)}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              >
                <Ionicons color={palette.primaryText} name={completed ? 'checkmark-circle' : 'checkmark'} size={19} />
                <Text maxFontSizeMultiplier={1.4} numberOfLines={2} style={styles.primaryButtonText}>{completed ? t('learn.completed') : t('learn.markComplete')}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ModalSafeArea>
    </Modal>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    screen: { flex: 1 },
    header: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border, backgroundColor: palette.surface },
    iconButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.soft },
    headerCopy: { flex: 1, minWidth: 0, alignItems: 'center' },
    headerSpacer: { width: 44 },
    eyebrow: { color: palette.primary, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 15, lineHeight: 20, fontWeight: '700', textAlign: 'center', marginTop: 3 },
    scroller: { flex: 1, minHeight: 0 },
    content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 18, paddingBottom: 30, gap: 14 },
    intro: { color: palette.muted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 2 },
    section: { gap: 10, padding: 17, borderRadius: 19, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    sectionNumber: { width: 27, height: 27, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentSoft },
    sectionNumberText: { color: palette.primary, fontSize: 11, fontWeight: '800' },
    sectionTitle: { color: palette.text, fontSize: 18, lineHeight: 24, fontWeight: '700', letterSpacing: -0.2 },
    body: { color: palette.muted, fontSize: 14, lineHeight: 21 },
    bulletRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
    bullet: { width: 5, height: 5, marginTop: 7, borderRadius: 3, backgroundColor: palette.aqua },
    bulletText: { flex: 1, color: palette.text, fontSize: 13, lineHeight: 19 },
    example: { gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised },
    exampleHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    exampleTitle: { flex: 1, color: palette.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
    exampleCards: { flexDirection: 'row', flexWrap: 'wrap', gap: 13 },
    cardGroup: { gap: 5 },
    cardGroupLabel: { color: palette.muted, fontSize: 9, fontWeight: '700' },
    cardRow: { flexDirection: 'row', gap: 5 },
    exampleDetail: { color: palette.text, fontSize: 12.5, lineHeight: 18 },
    takeaway: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', padding: 12, borderRadius: 13, backgroundColor: palette.aquaSoft },
    takeawayText: { flex: 1, color: palette.aquaText, fontSize: 13, lineHeight: 19, fontWeight: '600' },
    disclaimer: { color: palette.muted, fontSize: 10, lineHeight: 15, textAlign: 'center' },
    footer: { padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.surface },
    primaryButton: { width: '100%', maxWidth: 720, alignSelf: 'center', minHeight: 50, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.primary },
    primaryButtonText: { flexShrink: 1, color: palette.primaryText, fontSize: 14, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
    pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  });
}
