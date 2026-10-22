import type { ReactNode } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Switch, Text, View,
  type PressableProps, type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { elevation, fonts, radius, useLayout, useTheme, type Palette } from '@/theme';
import { Icon, type IconName } from './Icon';

/** Text styles from the design system ("Wayline UI" on the design canvas). */
export function type(c: Palette) {
  return {
    display: { fontFamily: fonts.heavy, fontSize: 34, letterSpacing: -0.6, color: c.ink, fontVariant: ['tabular-nums'] } as TextStyle,
    title: { fontFamily: fonts.heavy, fontSize: 22, letterSpacing: -0.3, color: c.ink, textAlign: 'left' } as TextStyle,
    h2: { fontFamily: fonts.heavy, fontSize: 18, letterSpacing: -0.2, color: c.ink, textAlign: 'left' } as TextStyle,
    strong: { fontFamily: fonts.bold, fontSize: 16, color: c.ink, textAlign: 'left' } as TextStyle,
    body: { fontFamily: fonts.regular, fontSize: 15, color: c.ink, textAlign: 'left' } as TextStyle,
    sub: { fontFamily: fonts.semibold, fontSize: 13, color: c.sub, textAlign: 'left' } as TextStyle,
    caption: { fontFamily: fonts.heavy, fontSize: 12, letterSpacing: 0.7, textTransform: 'uppercase', color: c.sub, textAlign: 'left' } as TextStyle,
  };
}

/**
 * The panel that holds a screen's controls: a bottom sheet on phones, a side panel on tablets and
 * in landscape (600dp+), so the map stays visible either way.
 */
export function Sheet({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { wide, panelWidth } = useLayout();
  if (wide) {
    return (
      <View
        testID={testID}
        style={[
          styles.panel,
          { backgroundColor: c.surface, borderColor: c.line, width: panelWidth, top: insets.top + 16, bottom: Math.max(16, insets.bottom + 8), left: insets.left + 16 },
          elevation(c),
          style,
        ]}
      >
        <ScrollView contentContainerStyle={{ gap: 12, padding: 18 }} showsVerticalScrollIndicator={false}>{children}</ScrollView>
      </View>
    );
  }
  return (
    <View
      testID={testID}
      style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.line, paddingBottom: Math.max(20, insets.bottom + 8) }, elevation(c), style]}
    >
      <View style={[styles.handle, { backgroundColor: c.handle }]} />
      {children}
    </View>
  );
}

/** A raised card on the map or inside a page. */
export function Card({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const c = useTheme();
  return <View testID={testID} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }, elevation(c, 'sm'), style]}>{children}</View>;
}

export function RoundButton({
  icon, label, onPress, size = 52, bg, fg, style, raised = true, testID, selected,
}: {
  icon: IconName; label: string; onPress: () => void; size?: number; bg?: string; fg?: string;
  style?: StyleProp<ViewStyle>; raised?: boolean; testID?: string; selected?: boolean;
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      testID={testID}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: size, height: size, borderRadius: size / 2, backgroundColor: bg ?? c.surface,
          borderWidth: StyleSheet.hairlineWidth * 3, borderColor: bg && bg !== c.surface ? bg : c.line,
          alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1,
        },
        raised && elevation(c),
        style,
      ]}
    >
      <Icon name={icon} color={fg ?? c.ink} size={size * 0.44} strokeWidth={2.3} />
    </Pressable>
  );
}

type Tone = 'primary' | 'secondary' | 'danger';

export function PrimaryButton({ title, onPress, disabled, tone = 'primary', icon, ...rest }: { title: string; tone?: Tone; icon?: IconName } & PressableProps) {
  const c = useTheme();
  const bg = tone === 'primary' ? c.primary : tone === 'danger' ? c.dangerSoft : c.surface2;
  const fg = tone === 'primary' ? c.onPrimary : tone === 'danger' ? c.dangerInk : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: bg, borderColor: tone === 'secondary' ? c.line : bg },
        tone === 'primary' && elevation(c, 'sm'),
        (pressed || disabled) && { opacity: disabled ? 0.5 : 0.85 },
      ]}
      {...rest}
    >
      <Text style={[styles.primaryText, { color: fg }]}>{title}</Text>
      {icon ? <Icon name={icon} color={fg} size={22} strokeWidth={2.6} /> : null}
    </Pressable>
  );
}

export function ListRow({ icon, iconBg, iconFg, title, subtitle, right, onPress, testID, action }: {
  icon: IconName; iconBg?: string; iconFg?: string; title: string; subtitle?: string; right?: string; onPress?: () => void; testID?: string;
  action?: ReactNode;
}) {
  const c = useTheme();
  const T = type(c);
  const content = (
    <>
      <View style={[styles.rowIcon, { backgroundColor: iconBg ?? c.surface2 }]}><Icon name={icon} color={iconFg ?? c.primary} size={20} strokeWidth={2.2} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={T.strong} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={T.sub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right ? <Text style={T.sub}>{right}</Text> : null}
      {action}
    </>
  );
  if (!onPress) return <View style={styles.row} testID={testID}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" testID={testID} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      {content}
    </Pressable>
  );
}

/** One row of a settings section: label, explanation and a switch. */
export function SwitchRow({ label, hint, value, onChange, testID }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; testID?: string }) {
  const c = useTheme();
  const T = type(c);
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={T.strong}>{label}</Text>
        {hint ? <Text style={T.sub}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        testID={testID}
        trackColor={{ false: c.surface2, true: c.primary }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={c.surface2}
      />
    </View>
  );
}

/** A segmented choice (theme, language, vehicle). */
export function Segmented<V extends string>({ options, value, onChange, label, testIDPrefix }: {
  options: { value: V; label: string }[]; value: V; onChange: (v: V) => void; label: string; testIDPrefix?: string;
}) {
  const c = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.segment, { backgroundColor: c.surface2, borderColor: c.line }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            testID={testIDPrefix ? `${testIDPrefix}-${o.value}` : undefined}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, on && { backgroundColor: c.primary }]}
          >
            <Text style={[styles.segmentText, { color: on ? c.onPrimary : c.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Pill toggle (alert types, search categories). */
export function Chip({ label, on, onPress, testID, icon }: { label: string; on: boolean; onPress: () => void; testID?: string; icon?: IconName }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      testID={testID}
      onPress={onPress}
      style={[styles.chip, { borderColor: on ? c.primary : c.line, backgroundColor: on ? c.primarySoft : c.surface }]}
    >
      {on ? <Icon name={icon ?? 'check'} color={c.primary} size={15} strokeWidth={3} /> : null}
      <Text style={[styles.chipText, { color: c.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderWidth: 1.5, borderBottomWidth: 0,
    paddingTop: 10, paddingHorizontal: 18, gap: 12,
  },
  panel: { position: 'absolute', borderRadius: radius.card, borderWidth: 1.5, overflow: 'hidden' },
  handle: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center' },
  card: { borderRadius: radius.card, borderWidth: 1.5, padding: 16 },
  primary: { height: 58, borderRadius: radius.button, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 18 },
  primaryText: { fontSize: 18, fontFamily: fonts.heavy, letterSpacing: -0.2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, minHeight: 56 },
  rowIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  segment: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 18, borderWidth: 1.5 },
  segmentItem: { flex: 1, minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentText: { fontSize: 14, fontFamily: fonts.bold },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.chip, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { fontSize: 14, fontFamily: fonts.bold },
});
