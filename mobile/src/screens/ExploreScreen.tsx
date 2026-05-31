import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/src/components/Card';
import { IconSymbol } from '@/src/components/IconSymbol';
import { Screen } from '@/src/components/Screen';
import { theme } from '@/src/theme/theme';

export function ExploreScreen() {
  return (
    <Screen contentContainerStyle={styles.screen}>
      <Text style={styles.kicker}>EXPLORE</Text>
      <Text style={styles.title}>Find new practice</Text>
      <Card style={styles.card}>
        <View style={styles.icon}>
          <IconSymbol name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} color={theme.colors.accentStrong} size={24} />
        </View>
        <Text style={styles.cardTitle}>Ready-made and AI creation stay parked for now.</Text>
        <Text style={styles.cardText}>This tab exists to match the PWA navigation while Home is being matched first.</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: 12,
  },
  kicker: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: theme.typography.weights.extraBold,
    letterSpacing: 2,
  },
  title: {
    color: theme.colors.text,
    fontSize: 34,
    fontWeight: theme.typography.weights.heavy,
    lineHeight: 36,
  },
  card: {
    borderRadius: 28,
    marginTop: 10,
  },
  icon: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentSoft,
    borderRadius: 22,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 21,
    fontWeight: theme.typography.weights.heavy,
    lineHeight: 24,
    marginTop: 18,
  },
  cardText: {
    color: theme.colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
});
