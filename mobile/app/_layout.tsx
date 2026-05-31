import {
  NunitoSans_400Regular,
  NunitoSans_500Medium,
  NunitoSans_600SemiBold,
  NunitoSans_700Bold,
  NunitoSans_800ExtraBold,
  NunitoSans_900Black,
  useFonts,
} from '@expo-google-fonts/nunito-sans';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, TextInput } from 'react-native';
import 'react-native-reanimated';

import { theme } from '@/src/theme/theme';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

type FontDefaultComponent = {
  defaultProps?: {
    style?: unknown;
  };
};

const defaultFontStyle = { fontFamily: theme.typography.fontFamily };

function setDefaultFont(Component: FontDefaultComponent) {
  Component.defaultProps = Component.defaultProps ?? {};
  Component.defaultProps.style = [defaultFontStyle, Component.defaultProps.style];
}

setDefaultFont(Text as unknown as FontDefaultComponent);
setDefaultFont(TextInput as unknown as FontDefaultComponent);

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    NunitoSans_400Regular,
    NunitoSans_500Medium,
    NunitoSans_600SemiBold,
    NunitoSans_700Bold,
    NunitoSans_800ExtraBold,
    NunitoSans_900Black,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <>
      <Stack screenOptions={{ contentStyle: { backgroundColor: theme.colors.background } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="quick-lesson" options={{ headerShown: false }} />
        <Stack.Screen name="practice-cards" options={{ headerShown: false }} />
        <Stack.Screen name="session-complete" options={{ headerShown: false }} />
        <Stack.Screen name="set/[externalSetId]" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="dark" />
    </>
  );
}
