import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/src/components/Card';
import { IconSymbol } from '@/src/components/IconSymbol';
import { Screen } from '@/src/components/Screen';
import { theme } from '@/src/theme/theme';

export function StatsScreen() {
  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.kicker}>STATS</Text>
        <Text style={styles.title}>Stats</Text>
        <Text style={styles.subtitle}>A calm read on momentum, in the same green Luma style.</Text>
      </View>

      <Card style={styles.heroCard}>
        <View style={styles.heroIcon}>
          <IconSymbol
            name={{ ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }}
            color={theme.colors.surface}
            size={30}
          />
        </View>
        <Text style={styles.heroValue}>12</Text>
        <Text style={styles.heroLabel}>day streak</Text>
        <Text style={styles.heroText}>Five focused sessions completed this week.</Text>
      </Card>

      <View style={styles.metricGrid}>
        <MetricCard value="128" label="Cards learned" />
        <MetricCard value="18" label="Still learning" />
      </View>
    </Screen>
  );
}

type MetricCardProps = {
  value: string;
  label: string;
};

function MetricCard({ value, label }: MetricCardProps) {
  return (
    <Card style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: 16,
  },
  header: {
    gap: 8,
  },
  kicker: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontWeight: theme.typography.weights.extraBold,
    letterSpacing: 2,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.h1,
    fontFamily: theme.typography.fontFamilyHeavy,
    fontWeight: theme.typography.weights.heavy,
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.sizes.bodyLarge,
    lineHeight: 24,
  },
  heroCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 30,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: theme.radius.pill,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  heroValue: {
    color: theme.colors.surface,
    fontSize: 58,
    fontFamily: theme.typography.fontFamilyHeavy,
    fontWeight: theme.typography.weights.heavy,
    letterSpacing: 0,
    marginTop: theme.spacing.lg,
  },
  heroLabel: {
    color: theme.colors.surface,
    fontSize: theme.typography.sizes.title,
    fontFamily: theme.typography.fontFamilyBold,
    fontWeight: theme.typography.weights.bold,
  },
  heroText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: theme.typography.sizes.body,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  metricGrid: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  metricCard: {
    flex: 1,
  },
  metricValue: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.h2,
    fontFamily: theme.typography.fontFamilyHeavy,
    fontWeight: theme.typography.weights.heavy,
  },
  metricLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.sizes.body,
    lineHeight: 21,
    marginTop: theme.spacing.xs,
  },
});
