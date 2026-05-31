import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type IconSymbolProps = {
  name: SymbolViewProps['name'];
  color: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function IconSymbol({ name, color, size = 22, style }: IconSymbolProps) {
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color}
      style={[styles.icon, { width: size, height: size }, style]}
      fallback={<View style={{ width: size, height: size }} />}
    />
  );
}

const styles = StyleSheet.create({
  icon: {
    flexShrink: 0,
  },
});
