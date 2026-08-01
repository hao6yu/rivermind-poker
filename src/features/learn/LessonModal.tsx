import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { LessonDefinition } from '../../domain/learning/types';
import { type ThemePalette, useAppTheme } from '../../theme';
import { ModalSafeArea } from './ModalSafeArea';

interface LessonModalProps {
  completed: boolean;
  lesson: LessonDefinition | null;
  onClose: () => void;
  onComplete: (lesson: LessonDefinition) => void;
}

export function LessonModal({ completed, lesson, onClose, onComplete }: LessonModalProps) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible={Boolean(lesson)}>
      <ModalSafeArea>
        {lesson && (
          <View style={styles.screen}>
            <View style={styles.header}>
              <Pressable
                accessibilityHint="Returns to the Learn screen"
                accessibilityLabel="Back to Learn"
                accessibilityRole="button"
                hitSlop={12}
                onPress={onClose}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <Ionicons color={palette.text} name="arrow-back" size={21} />
              </Pressable>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>Fundamentals · {lesson.estimatedMinutes} min</Text>
                <Text numberOfLines={2} style={styles.title}>{lesson.title}</Text>
              </View>
              <View style={styles.headerSpacer} />
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <Text style={styles.intro}>{lesson.description}</Text>
              {lesson.sections.map((section, index) => (
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
                  {section.takeaway && (
                    <View style={styles.takeaway}>
                      <Ionicons color={palette.aqua} name="bulb-outline" size={18} />
                      <Text style={styles.takeawayText}>{section.takeaway}</Text>
                    </View>
                  )}
                </View>
              ))}
              <Text style={styles.disclaimer}>Practical learning guidance—not a claim of solver-perfect strategy.</Text>
            </ScrollView>

            <View style={styles.footer}>
              <Pressable
                accessibilityRole="button"
                onPress={() => completed ? onClose() : onComplete(lesson)}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              >
                <Ionicons color={palette.primaryText} name={completed ? 'checkmark-circle' : 'checkmark'} size={19} />
                <Text style={styles.primaryButtonText}>{completed ? 'Completed' : 'Mark complete'}</Text>
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
    headerCopy: { flex: 1, alignItems: 'center' },
    headerSpacer: { width: 44 },
    eyebrow: { color: palette.primary, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 15, lineHeight: 20, fontWeight: '700', textAlign: 'center', marginTop: 3 },
    content: { padding: 18, paddingBottom: 30, gap: 14 },
    intro: { color: palette.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 2 },
    section: { gap: 10, padding: 17, borderRadius: 19, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    sectionNumber: { width: 27, height: 27, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentSoft },
    sectionNumberText: { color: palette.primary, fontSize: 11, fontWeight: '800' },
    sectionTitle: { color: palette.text, fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
    body: { color: palette.muted, fontSize: 13, lineHeight: 20 },
    bulletRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
    bullet: { width: 5, height: 5, marginTop: 7, borderRadius: 3, backgroundColor: palette.aqua },
    bulletText: { flex: 1, color: palette.text, fontSize: 12, lineHeight: 18 },
    takeaway: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', padding: 12, borderRadius: 13, backgroundColor: palette.aquaSoft },
    takeawayText: { flex: 1, color: palette.aquaText, fontSize: 12, lineHeight: 18, fontWeight: '600' },
    disclaimer: { color: palette.muted, fontSize: 10, lineHeight: 15, textAlign: 'center' },
    footer: { padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.surface },
    primaryButton: { minHeight: 50, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.primary },
    primaryButtonText: { color: palette.primaryText, fontSize: 14, fontWeight: '700' },
    pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  });
}
