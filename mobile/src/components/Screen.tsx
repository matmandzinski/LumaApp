import type { PropsWithChildren } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { theme } from '@/src/theme/theme';

type ScreenProps = PropsWithChildren<{
  contentContainerStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
}>;

export function Screen({ children, contentContainerStyle, scroll = true }: ScreenProps) {
  if (!scroll) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <LinearGradient
          colors={['rgba(255,255,255,0.72)', 'rgba(247,244,238,0.98)', '#F7F4EE']}
          locations={[0, 0.38, 1]}
          style={styles.shell}>
          <View style={[styles.content, contentContainerStyle]}>{children}</View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={['rgba(255,255,255,0.72)', 'rgba(247,244,238,0.98)', '#F7F4EE']}
        locations={[0, 0.38, 1]}
        style={styles.shell}>
        <ScrollView
          contentContainerStyle={[styles.content, contentContainerStyle]}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: theme.colors.appBackdrop,
    flex: 1,
  },
  shell: {
    alignSelf: 'center',
    flex: 1,
    maxWidth: 430,
    width: '100%',
  },
  content: {
    paddingBottom: 128,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
  },
});
