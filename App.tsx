import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppShell } from './src/features/shell/AppShell';
import { LocalizationProvider } from './src/localization';
import { GameplayFeedbackProvider } from './src/services/GameplayFeedbackProvider';
import { ThemeProvider, useAppTheme } from './src/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <LocalizationProvider>
        <ThemeProvider>
          <GameplayFeedbackProvider>
            <ThemedApp />
          </GameplayFeedbackProvider>
        </ThemeProvider>
      </LocalizationProvider>
    </SafeAreaProvider>
  );
}

function ThemedApp() {
  const { scheme } = useAppTheme();
  return (
    <>
      <AppShell />
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </>
  );
}
