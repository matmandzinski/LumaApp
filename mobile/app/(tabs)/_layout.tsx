import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/src/theme/theme';

const tabItems = {
  index: {
    label: 'Home',
    icon: { ios: 'house', android: 'home', web: 'home' } as const,
  },
  sets: {
    label: 'Sets',
    icon: { ios: 'square.grid.2x2', android: 'grid_view', web: 'grid_view' } as const,
  },
  explore: {
    label: 'Explore',
    icon: { ios: 'magnifyingglass', android: 'search', web: 'search' } as const,
  },
  stats: {
    label: 'Stats',
    icon: { ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart' } as const,
  },
};

export default function TabLayout() {
  return (
    <View style={styles.viewport}>
      <View style={styles.appFrame}>
        <Tabs
          screenOptions={{
            headerShown: false,
          }}
          tabBar={(props) => <LumaTabBar {...props} />}>
          <Tabs.Screen name="index" options={{ title: 'Home' }} />
          <Tabs.Screen name="sets" options={{ title: 'Sets' }} />
          <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
          <Tabs.Screen name="stats" options={{ title: 'Stats' }} />
        </Tabs>
      </View>
    </View>
  );
}

type LumaTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

function LumaTabBar({ state, navigation }: LumaTabBarProps) {
  return (
    <View style={styles.tabBar}>
      {state.routes.map((route, index) => {
        const item = tabItems[route.name as keyof typeof tabItems];
        if (!item) return null;

        const focused = state.index === index;
        const color = focused ? theme.colors.accentStrong : theme.colors.textSubtle;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : undefined}
            onPress={() => navigation.navigate(route.name)}
            style={({ pressed }) => [
              styles.tabButton,
              focused && styles.tabButtonActive,
              pressed && styles.tabButtonPressed,
            ]}>
            <SymbolView name={item.icon} tintColor={color} size={19} />
            <Text style={[styles.tabLabel, { color }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    alignItems: 'center',
    backgroundColor: theme.colors.appBackdrop,
    flex: 1,
  },
  appFrame: {
    backgroundColor: theme.colors.background,
    flex: 1,
    maxWidth: 430,
    overflow: 'hidden',
    width: '100%',
  },
  tabBar: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(255,255,255,0.86)',
    borderRadius: 28,
    borderWidth: 1,
    bottom: 16,
    elevation: 12,
    flexDirection: 'row',
    height: 74,
    justifyContent: 'space-between',
    left: 16,
    padding: 8,
    position: 'absolute',
    right: 16,
    shadowColor: '#1E3228',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.15,
    shadowRadius: 42,
  },
  tabButton: {
    alignItems: 'center',
    borderRadius: 24,
    flex: 1,
    gap: 4,
    height: 58,
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: theme.colors.accentSoft,
  },
  tabButtonPressed: {
    opacity: 0.78,
  },
  tabLabel: {
    fontSize: theme.typography.sizes.tab,
    fontWeight: theme.typography.weights.extraBold,
    letterSpacing: 1.1,
    lineHeight: 11,
    textTransform: 'uppercase',
  },
});
