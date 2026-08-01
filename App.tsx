import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppShell } from './src/features/shell/AppShell';
import { ThemeProvider, useAppTheme } from './src/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedApp />
      </ThemeProvider>
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
