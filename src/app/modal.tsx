import { StatusBar } from 'expo-status-bar';
import { Platform, Text, View } from 'react-native';
import { ThemeBackdrop } from '@/components/ThemeBackdrop';
import { ThemeChrome } from '@/components/ThemeChrome';
import { getThemeHeadingStyle, useAppTheme } from '@/lib/theme';


export default function ModalScreen() {
  const theme = useAppTheme();
  return (
    <View className="flex-1 items-center justify-center" style={{ backgroundColor: theme.background, paddingHorizontal: 24 }}>
      <ThemeBackdrop />
      <ThemeChrome theme={theme} variant="feature" style={{ width: '100%', maxWidth: 480 }}>
        <View className="items-center justify-center p-8">
          <Text style={getThemeHeadingStyle(theme, 24)}>Modal</Text>
          <View className="my-8 h-px w-4/5" style={{ backgroundColor: theme.border }} />
        </View>
      </ThemeChrome>

      {/* Use a light status bar on iOS to account for the black space above the modal */}
      <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
    </View>
  );
}
