import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadow } from '@/theme';
import { Icon, type IconName } from './Icon';

/** White sheet anchored to the bottom, respecting the home indicator. */
export function Sheet({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.sheet, { paddingBottom: Math.max(20, insets.bottom + 8) }, style]}>
      <View style={styles.handle} />
      {children}
    </View>
  );
}

export function RoundButton({
  icon, label, onPress, size = 48, bg = colors.surface, fg = colors.ink, style, raised = true, testID,
}: { icon: IconName; label: string; onPress: () => void; size?: number; bg?: string; fg?: string; style?: StyleProp<ViewStyle>; raised?: boolean; testID?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 },
        raised && shadow,
        style,
      ]}
    >
      <Icon name={icon} color={fg} size={size * 0.46} strokeWidth={2.2} />
    </Pressable>
  );
}

export function PrimaryButton({ title, onPress, disabled, tone = 'primary', ...rest }: { title: string; tone?: 'primary' | 'secondary' } & PressableProps) {
  const primary = tone === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        primary ? { backgroundColor: colors.primary } : { backgroundColor: colors.surface, borderWidth: 2, borderColor: '#CBD5E1' },
        (pressed || disabled) && { opacity: disabled ? 0.5 : 0.85 },
      ]}
      {...rest}
    >
      <Text style={[styles.primaryText, { color: primary ? '#FFFFFF' : colors.ink }]}>{title}</Text>
    </Pressable>
  );
}

export function ListRow({ icon, iconBg = colors.surfaceAlt, iconFg = colors.sub, title, subtitle, right, onPress, testID }: {
  icon: IconName; iconBg?: string; iconFg?: string; title: string; subtitle?: string; right?: string; onPress: () => void; testID?: string;
}) {
  return (
    <Pressable accessibilityRole="button" testID={testID} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}><Icon name={icon} color={iconFg} size={20} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right ? <Text style={styles.rowSub}>{right}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingTop: 10, paddingHorizontal: 20, gap: 12,
    ...shadow, shadowOffset: { width: 0, height: -4 },
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#CBD5E1', alignSelf: 'center' },
  primary: { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 18, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, minHeight: 56 },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  rowSub: { fontSize: 13, color: colors.muted },
});
