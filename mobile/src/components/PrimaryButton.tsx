import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { theme } from '@/src/theme/theme';

type PrimaryButtonProps = {
  title: string;
  icon?: ReactNode;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({
  title,
  icon,
  onPress,
  variant = 'primary',
  style,
}: PrimaryButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.secondary,
        pressed && styles.pressed,
        style,
      ]}>
      {icon}
      <Text style={[styles.label, variant === 'secondary' && styles.secondaryLabel]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: theme.spacing.xl,
  },
  secondary: {
    backgroundColor: theme.colors.softLavender,
    borderColor: theme.colors.borderStrong,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }],
  },
  label: {
    color: theme.colors.surface,
    fontSize: theme.typography.sizes.button,
    fontFamily: theme.typography.fontFamilyBold,
    fontWeight: theme.typography.weights.bold,
  },
  secondaryLabel: {
    color: theme.colors.deepPurple,
  },
});
