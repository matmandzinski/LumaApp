import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/src/components/IconSymbol';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { theme } from '@/src/theme/theme';

type CompletionParams = {
  mode?: string;
  reviewedCount?: string;
  setName?: string;
};

export function SessionCompleteScreen() {
  const params = useLocalSearchParams<CompletionParams>();
  const reviewedCount = normalizeCount(params.reviewedCount);
  const isQuickLesson = params.mode === 'quick';
  const setName = typeof params.setName === 'string' ? params.setName : 'your active set';
  const title = isQuickLesson ? 'Quick lesson done.' : 'Practice complete.';
  const message =
    reviewedCount > 0
      ? `${reviewedCount} ${reviewedCount === 1 ? 'card' : 'cards'} reviewed from ${setName}.`
      : `Nice work with ${setName}.`;

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={['#FFFEFC', '#F7F4EE']}
        locations={[0, 1]}
        style={styles.viewport}>
        <View style={styles.shell}>
          <View style={styles.badge}>
            <IconSymbol
              color="#FFFFFF"
              name={{ ios: 'checkmark', android: 'check', web: 'check' }}
              size={36}
            />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryKicker}>Progress saved</Text>
            <Text style={styles.summaryTitle}>Your review decisions are stored in the local API.</Text>
            <Text style={styles.summaryBody}>
              You can close the app and pick up from the persisted card progress later.
            </Text>
          </View>

          <View style={styles.actions}>
            <PrimaryButton title="Back to Home" onPress={() => router.replace('/')} />
            <PrimaryButton
              title={isQuickLesson ? 'Practice cards' : 'Quick lesson'}
              variant="secondary"
              onPress={() => router.replace(isQuickLesson ? '/practice-cards' : '/quick-lesson')}
            />
          </View>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

function normalizeCount(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const count = Number.parseInt(rawValue ?? '0', 10);

  return Number.isFinite(count) && count > 0 ? count : 0;
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  viewport: {
    alignItems: 'center',
    flex: 1,
  },
  shell: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    maxWidth: 430,
    padding: 24,
    width: '100%',
  },
  badge: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: 82,
    justifyContent: 'center',
    shadowColor: theme.colors.accentStrong,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.24,
    shadowRadius: 42,
    width: 82,
    elevation: 8,
  },
  title: {
    color: theme.colors.text,
    fontSize: 32,
    fontWeight: theme.typography.weights.heavy,
    letterSpacing: 0,
    lineHeight: 36,
    marginTop: 24,
    textAlign: 'center',
  },
  message: {
    color: theme.colors.textMuted,
    fontSize: 16,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 23,
    marginTop: 10,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 26,
    borderWidth: 1,
    marginTop: 34,
    padding: 22,
    shadowColor: '#2A261E',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 34,
    width: '100%',
    elevation: 4,
  },
  summaryKicker: {
    color: theme.colors.accentStrong,
    fontSize: 11,
    fontWeight: theme.typography.weights.extraBold,
    letterSpacing: 1.4,
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  summaryTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: theme.typography.weights.heavy,
    lineHeight: 24,
    marginTop: 8,
  },
  summaryBody: {
    color: theme.colors.textMuted,
    fontSize: 15,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 22,
    marginTop: 8,
  },
  actions: {
    gap: 12,
    marginTop: 28,
    width: '100%',
  },
});
