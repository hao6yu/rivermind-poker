import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { releaseMetadata } from '../../services/releaseMetadata';
import { type ThemePalette, useAppTheme } from '../../theme';
import { ModalSafeArea } from '../learn/ModalSafeArea';

interface BetaInfoModalProps {
  onClose: () => void;
  onSendFeedback: () => void;
  visible: boolean;
}

const betaSections = [
  {
    icon: 'flask-outline' as const,
    title: 'Internal beta',
    description: 'RiverMind supports lessons, fresh scenarios, 2-, 3-, and 6-player AI practice, Sit & Go tournaments, a five-event Championship journey, and a shared Daily Challenge. Private friend games are not available yet.',
  },
  {
    icon: 'game-controller-outline' as const,
    title: 'Practice chips only',
    description: 'There is no real-money wagering, purchase, prize, or cash value. RiverMind is a learning tool, not gambling or professional advice.',
  },
  {
    icon: 'sparkles-outline' as const,
    title: 'Verified facts, optional AI',
    description: 'Rules and poker math come from the deterministic engine. OpenAI explains those facts through a secure Supabase proxy. AI explanations can still be imperfect or unavailable.',
  },
  {
    icon: 'cloud-upload-outline' as const,
    title: 'What coaching shares',
    description: 'A review sends your cards, the dealt board, public action history, and verified poker facts to the proxy and OpenAI. It never sends the undealt deck or any opponent cards.',
  },
  {
    icon: 'lock-closed-outline' as const,
    title: 'Your data',
    description: 'An anonymous account stores learning progress, completed hand history, reviews, and Daily Challenge results in Supabase. RiverMind has no advertising or cross-app tracking. Delete saved data from Profile at any time.',
  },
  {
    icon: 'phone-portrait-outline' as const,
    title: 'Before durable sign-in',
    description: 'Championship progress stays on this device. Other progress survives normal app updates, but deleting the app can remove local data and access to the anonymous account until durable sign-in is added.',
  },
];

async function openExternalUrl(url: string, errorTitle: string, fallbackMessage: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(errorTitle, fallbackMessage);
  }
}

export function BetaInfoModal({ onClose, onSendFeedback, visible }: BetaInfoModalProps) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <ModalSafeArea>
        <View accessibilityViewIsModal style={styles.screen}>
          <View style={styles.header}>
            <Pressable accessibilityLabel="Close beta information" accessibilityRole="button" onPress={onClose} style={styles.iconButton}>
              <Ionicons color={palette.text} name="arrow-back" size={20} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>RiverMind</Text>
              <Text accessibilityRole="header" style={styles.title}>Beta & privacy</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.betaCard}>
              <View style={styles.betaBadge}><Text style={styles.betaBadgeText}>INTERNAL BETA</Text></View>
              <Text style={styles.betaTitle}>Built for honest poker practice.</Text>
              <Text style={styles.betaDescription}>Help us improve clarity, coaching, and the learning flow before broader release.</Text>
              <Text style={styles.versionText}>{releaseMetadata.versionLabel} · iPhone · iOS {releaseMetadata.minimumIosVersion}+</Text>
            </View>

            <View style={styles.sections}>
              {betaSections.map((section) => (
                <View key={section.title} style={styles.section}>
                  <View style={styles.sectionIcon}>
                    <Ionicons color={palette.primary} name={section.icon} size={19} />
                  </View>
                  <View style={styles.sectionCopy}>
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                    <Text style={styles.sectionDescription}>{section.description}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Pressable
              accessibilityLabel="Send in-app beta feedback"
              accessibilityRole="button"
              onPress={onSendFeedback}
              style={styles.feedbackButton}
            >
              <Ionicons color={palette.primaryText} name="chatbubble-ellipses-outline" size={18} />
              <Text style={styles.feedbackButtonText}>Send beta feedback</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Read the RiverMind beta privacy notice"
              accessibilityRole="link"
              onPress={() => void openExternalUrl(
                releaseMetadata.privacyUrl,
                'Could not open privacy notice',
                'Open the RiverMind repository and read docs/PRIVACY.md.',
              )}
              style={styles.secondaryButton}
            >
              <Ionicons color={palette.primary} name="shield-checkmark-outline" size={18} />
              <Text style={styles.secondaryButtonText}>Read privacy notice</Text>
            </Pressable>
            <Text style={styles.footerNote}>Private support · {releaseMetadata.supportEmail}</Text>
          </ScrollView>
        </View>
      </ModalSafeArea>
    </Modal>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    header: { minHeight: 66, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
    iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    headerCopy: { flex: 1, alignItems: 'center' },
    headerSpacer: { width: 38 },
    eyebrow: { color: palette.primary, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 16, fontWeight: '700', marginTop: 2 },
    content: { padding: 18, paddingBottom: 30, gap: 16 },
    betaCard: { gap: 8, padding: 18, borderRadius: 20, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    betaBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: palette.aquaSoft },
    betaBadgeText: { color: palette.aquaText, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
    betaTitle: { color: palette.text, fontSize: 20, lineHeight: 26, fontWeight: '700' },
    betaDescription: { color: palette.muted, fontSize: 13, lineHeight: 19 },
    versionText: { color: palette.primary, fontSize: 10, lineHeight: 15, fontWeight: '700' },
    sections: { gap: 10 },
    section: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 14, borderRadius: 17, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    sectionIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: palette.accentSoft },
    sectionCopy: { flex: 1, gap: 3 },
    sectionTitle: { color: palette.text, fontSize: 13, lineHeight: 18, fontWeight: '700' },
    sectionDescription: { color: palette.muted, fontSize: 11, lineHeight: 17 },
    feedbackButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, backgroundColor: palette.primary },
    feedbackButtonText: { color: palette.primaryText, fontSize: 13, fontWeight: '700' },
    secondaryButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    secondaryButtonText: { color: palette.primary, fontSize: 13, fontWeight: '700' },
    footerNote: { color: palette.muted, fontSize: 9, lineHeight: 14, textAlign: 'center' },
  });
}
