import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { theme } from '@/src/theme/theme';

type PillProps = {
  label: string;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Pill({ label, icon, style }: PillProps) {
  return (
    <View style={[styles.pill, style]}>
      {icon}
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.softLavender,
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  label: {
    color: theme.colors.deepPurple,
    fontSize: theme.typography.sizes.small,
    fontWeight: theme.typography.weights.bold,
  },
});
