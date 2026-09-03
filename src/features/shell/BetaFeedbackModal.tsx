import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalBackdrop } from '../../components/ModalBackdrop';
import { LIVE_TABLE_SUPPORTED_ORIENTATIONS } from '../table/useTableOrientation';
import {
  feedbackCategories,
  type BetaFeedbackCategory,
  type FeedbackHandContext,
} from '../../services/betaFeedbackModel';
import {
  submitBetaFeedback,
  type BetaFeedbackDiagnosticContext,
} from '../../services/betaFeedback';
import { type ThemePalette, useAppTheme } from '../../theme';
import { type MessageKey, useLocalization } from '../../localization';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface BetaFeedbackModalProps {
  context: BetaFeedbackDiagnosticContext;
  handContext?: FeedbackHandContext | null;
  initialCategory?: BetaFeedbackCategory;
  onClose: () => void;
  visible: boolean;
}

const categoryLabelKeys: Record<BetaFeedbackCategory, MessageKey> = {
  gameplay: 'feedback.category.gameplay',
  coach: 'feedback.category.coach',
  ui: 'feedback.category.ui',
  bug: 'feedback.category.bug',
  other: 'feedback.category.other',
};

export function BetaFeedbackModal({
  context,
  handContext = null,
  initialCategory = 'bug',
  onClose,
  visible,
}: BetaFeedbackModalProps) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const wasVisible = useRef(false);
  const [category, setCategory] = useState<BetaFeedbackCategory>(initialCategory);
  const [message, setMessage] = useState('');
  const [attachHand, setAttachHand] = useState(Boolean(handContext));
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && !wasVisible.current) {
      setCategory(initialCategory);
      setAttachHand(Boolean(handContext));
      setSubmitError(null);
      setSent(false);
    }
    wasVisible.current = visible;
  }, [handContext, initialCategory, visible]);

  const handleClose = () => {
    if (sent) setMessage('');
    setSent(false);
    setSubmitError(null);
    onClose();
  };

  const submit = async () => {
    if (submitting || message.trim().length < 3) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitBetaFeedback({
        category,
        context,
        handContext: attachHand ? handContext : null,
        message,
      });
      setMessage('');
      setSent(true);
    } catch {
      setSubmitError(t('feedback.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal animationType={reduceMotion ? 'none' : "slide"} onRequestClose={handleClose} supportedOrientations={LIVE_TABLE_SUPPORTED_ORIENTATIONS} transparent visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.scrim}
      >
        <ModalBackdrop accessibilityLabel={t('feedback.close')} onPress={handleClose} />
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { paddingBottom: Math.max(18, insets.bottom + 8) }]}
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{t('feedback.eyebrow')}</Text>
              <Text accessibilityRole="header" style={styles.title}>{t('feedback.title')}</Text>
            </View>
            <Pressable accessibilityLabel={t('feedback.close')} accessibilityRole="button" onPress={handleClose} style={styles.closeButton}>
              <Ionicons color={palette.text} name="close" size={20} />
            </Pressable>
          </View>

          {sent ? (
            <View style={styles.successState}>
              <View style={styles.successIcon}>
                <Ionicons color={palette.aqua} name="checkmark" size={30} />
              </View>
              <Text style={styles.successTitle}>{t('feedback.sentTitle')}</Text>
              <Text style={styles.successText}>{t('feedback.sentBody')}</Text>
              <Pressable accessibilityRole="button" onPress={handleClose} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{t('common.done')}</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.helpText}>{t('feedback.prompt')}</Text>
              <View style={styles.categories}>
                {feedbackCategories.map((option) => {
                  const selected = category === option;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={option}
                      onPress={() => setCategory(option)}
                      style={[styles.category, selected && styles.categorySelected]}
                    >
                      <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>
                        {t(categoryLabelKeys[option])}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.inputCard}>
                <TextInput
                  accessibilityLabel={t('feedback.messageA11y')}
                  maxLength={2000}
                  multiline
                  onChangeText={setMessage}
                  placeholder={t('feedback.placeholder')}
                  placeholderTextColor={palette.muted}
                  style={styles.input}
                  textAlignVertical="top"
                  value={message}
                />
                <Text style={styles.count}>{message.length}/2000</Text>
              </View>

              {handContext ? (
                <View style={styles.attachmentRow}>
                  <View style={styles.attachmentIcon}>
                    <Ionicons color={palette.primary} name="albums-outline" size={19} />
                  </View>
                  <View style={styles.attachmentCopy}>
                    <Text style={styles.attachmentTitle}>{t('feedback.attachTitle', { hand: handContext.handNumber })}</Text>
                    <Text style={styles.attachmentText}>{t('feedback.attachBody')}</Text>
                  </View>
                  <Switch
                    accessibilityLabel={t('feedback.attachA11y')}
                    onValueChange={setAttachHand}
                    trackColor={{ false: palette.border, true: palette.primary }}
                    value={attachHand}
                  />
                </View>
              ) : null}

              <View style={styles.privacyNote}>
                <Ionicons color={palette.muted} name="shield-checkmark-outline" size={17} />
                <Text style={styles.privacyText}>{t('feedback.privacy')}</Text>
              </View>

              {submitError ? (
                <View accessibilityRole="alert" style={styles.errorNote}>
                  <Ionicons color={palette.danger} name="alert-circle-outline" size={18} />
                  <Text style={styles.errorText}>{submitError}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: submitting || message.trim().length < 3 }}
                disabled={submitting || message.trim().length < 3}
                onPress={() => void submit()}
                style={[styles.primaryButton, (submitting || message.trim().length < 3) && styles.disabledButton]}
              >
                {submitting ? <ActivityIndicator color={palette.primaryText} /> : <Ionicons color={palette.primaryText} name="send-outline" size={18} />}
                <Text style={styles.primaryButtonText}>{submitting ? t('feedback.sending') : submitError ? t('feedback.tryAgain') : t('feedback.send')}</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: palette.scrim, padding: 12 },
    sheet: { maxHeight: '92%', gap: 16, paddingHorizontal: 18, paddingTop: 18, borderRadius: 25, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerCopy: { gap: 2 },
    eyebrow: { color: palette.primary, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 22, fontWeight: '700' },
    closeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.soft },
    content: { gap: 14, paddingBottom: 2 },
    helpText: { color: palette.text, fontSize: 13, lineHeight: 19, fontWeight: '600' },
    categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    category: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 11, backgroundColor: palette.soft, borderWidth: 1, borderColor: palette.border },
    categorySelected: { backgroundColor: palette.primary, borderColor: palette.primary },
    categoryText: { color: palette.text, fontSize: 11, fontWeight: '700' },
    categoryTextSelected: { color: palette.primaryText },
    inputCard: { minHeight: 142, padding: 13, borderRadius: 16, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    input: { minHeight: 102, color: palette.text, fontSize: 13, lineHeight: 19, padding: 0 },
    count: { color: palette.muted, fontSize: 9, textAlign: 'right' },
    attachmentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 16, backgroundColor: palette.accentSoft },
    attachmentIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: palette.surface },
    attachmentCopy: { flex: 1, gap: 2 },
    attachmentTitle: { color: palette.text, fontSize: 12, fontWeight: '700' },
    attachmentText: { color: palette.muted, fontSize: 9, lineHeight: 13 },
    privacyNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    privacyText: { flex: 1, color: palette.muted, fontSize: 9, lineHeight: 14 },
    errorNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 11, borderRadius: 13, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.danger },
    errorText: { flex: 1, color: palette.danger, fontSize: 10, lineHeight: 15 },
    primaryButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, backgroundColor: palette.primary },
    primaryButtonText: { color: palette.primaryText, fontSize: 13, fontWeight: '700' },
    disabledButton: { opacity: 0.42 },
    successState: { gap: 10, alignItems: 'center', paddingVertical: 18 },
    successIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: palette.aquaSoft },
    successTitle: { color: palette.text, fontSize: 20, fontWeight: '700' },
    successText: { maxWidth: 300, color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  });
}
