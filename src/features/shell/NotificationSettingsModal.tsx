import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useLocalization } from '../../localization';
import { notificationMessages } from '../../localization/notificationMessages';
import {
  getNotificationState,
  notificationSettingsPreferences,
  type NotificationPreferences,
} from '../../services/notificationPreferences';
import { saveNotificationPreferences } from '../../services/notifications';
import { useAppTheme } from '../../theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { ModalSafeArea } from '../learn/ModalSafeArea';

export function NotificationSettingsModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const { language } = useLocalization();
  const text = notificationMessages(language);
  const { palette } = useAppTheme();
  const [preferences, setPreferences] = useState(
    () => notificationSettingsPreferences(getNotificationState()),
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const reducedMotion = useReducedMotion();
  const rows: Array<[keyof NotificationPreferences, string, string]> = [
    ['tips', text.tips, text.tipsDescription],
    ['quickPlay', text.quickPlay, text.quickPlayDescription],
    ['releases', text.releases, text.releasesDescription],
  ];
  const save = async () => {
    setBusy(true);
    setStatus('');
    try {
      const result = await saveNotificationPreferences(preferences, language);
      setStatus(
        result === 'saved'
          ? text.saved
          : result === 'permission_denied'
            ? text.denied
            : result === 'unsupported'
              ? text.unsupported
              : text.pending,
      );
    } catch {
      setStatus(text.failure);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      visible
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <ModalSafeArea>
        <View accessibilityViewIsModal style={styles.screen}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: palette.text }]}
            >
              {text.title}
            </Text>
            <Text style={[styles.body, { color: palette.text }]}>
              {text.description}
            </Text>
            <Text style={[styles.body, { color: palette.muted }]}>
              {text.cadence}
            </Text>
            {rows.map(([key, label, description]) => (
              <View
                key={key}
                style={[styles.row, { borderColor: palette.border }]}
              >
                <View style={styles.copy}>
                  <Text style={[styles.label, { color: palette.text }]}>
                    {label}
                  </Text>
                  <Text style={[styles.body, { color: palette.muted }]}>
                    {description}
                  </Text>
                </View>
                <Switch
                  accessibilityLabel={label}
                  accessibilityHint={description}
                  disabled={busy}
                  value={preferences[key]}
                  onValueChange={(value) =>
                    setPreferences({ ...preferences, [key]: value })
                  }
                  trackColor={{ false: palette.border, true: palette.primary }}
                />
              </View>
            ))}
            <Text style={[styles.body, { color: palette.muted }]}>
              {text.consent}
            </Text>
            {status ? (
              <Text
                accessibilityLiveRegion="polite"
                style={[styles.body, { color: palette.text }]}
              >
                {status}
              </Text>
            ) : null}
          </ScrollView>
          <View style={[styles.footer, { borderColor: palette.border }]}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void save()}
              style={[
                styles.button,
                { backgroundColor: palette.primary, opacity: busy ? 0.6 : 1 },
              ]}
            >
              <Text style={[styles.label, { color: palette.primaryText }]}>
                {busy ? text.saving : text.save}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onClose}
              style={styles.button}
            >
              <Text style={[styles.label, { color: palette.text }]}>
                {text.done}
              </Text>
            </Pressable>
          </View>
        </View>
      </ModalSafeArea>
    </Modal>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center' },
  content: { padding: 24, gap: 20 },
  title: { fontSize: 28, fontWeight: '800' },
  body: { fontSize: 16, lineHeight: 24 },
  label: { fontSize: 17, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  copy: { flex: 1, gap: 6 },
  footer: { padding: 16, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  button: {
    minHeight: 52,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
