import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/src/theme/theme';

export type HabitDay = {
  label: string;
  complete?: boolean;
  current?: boolean;
};

type HabitDotsProps = {
  days: HabitDay[];
};

export function HabitDots({ days }: HabitDotsProps) {
  return (
    <View style={styles.row}>
      {days.map((day) => (
        <View key={day.label} style={styles.item}>
          <Text style={[styles.label, day.current && styles.currentLabel]}>{day.label}</Text>
          <View
            style={[
              styles.dot,
              day.complete && styles.completeDot,
              day.current && !day.complete && styles.currentDot,
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  item: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    minWidth: 34,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.sizes.caption,
    fontWeight: theme.typography.weights.medium,
  },
  currentLabel: {
    color: theme.colors.deepPurple,
    fontWeight: theme.typography.weights.bold,
  },
  dot: {
    backgroundColor: '#F0EFF4',
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 28,
    width: 28,
  },
  completeDot: {
    backgroundColor: theme.colors.successGreen,
    borderColor: theme.colors.successGreen,
  },
  currentDot: {
    backgroundColor: theme.colors.softLavender,
    borderColor: theme.colors.primary,
    borderWidth: 2,
  },
});
