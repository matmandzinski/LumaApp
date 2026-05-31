import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/src/theme/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn't exist.</Text>

        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to home screen!</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
    padding: theme.spacing.xl,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.title,
    fontFamily: theme.typography.fontFamilyBold,
    fontWeight: theme.typography.weights.bold,
  },
  link: {
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  linkText: {
    color: theme.colors.primary,
    fontSize: theme.typography.sizes.body,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontWeight: theme.typography.weights.semibold,
  },
});
