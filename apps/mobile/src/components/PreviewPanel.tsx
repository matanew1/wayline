import { formatClock, formatDistance, formatDuration } from '@wayline/navigation-core';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { config, isDevBuild } from '@/config';
import { cancelPreview, startDrive } from '@/nav/drive';
import { set, useApp } from '@/state/store';
import { colors, shadow } from '@/theme';
import { Icon } from './Icon';
import { PrimaryButton, Sheet } from './ui';
import { useNow } from './useNow';

const FLAG_LABEL: Record<string, string> = { toll: 'Toll road', highway: 'Highway', ferry: 'Ferry' };

export function PreviewPanel() {
  const insets = useSafeAreaInsets();
  const dest = useApp((s) => s.destination);
  const routes = useApp((s) => s.routes);
  const selected = useApp((s) => s.selectedRouteId);
  const planning = useApp((s) => s.planning);
  const simulate = useApp((s) => s.simulate);
  const now = useNow();
  const fastest = Math.min(...routes.map((r) => r.durationS));

  return (
    <>
      <View style={[styles.top, { top: insets.top + 12 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => set({ screen: 'search' })} style={styles.back} hitSlop={8}>
          <Icon name="back" size={24} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.from}>From your location</Text>
          <Text style={styles.to} numberOfLines={1}>To {dest?.name}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={cancelPreview} style={styles.back} hitSlop={8}>
          <Icon name="close" size={22} />
        </Pressable>
      </View>

      <Sheet>
        <Text style={styles.h2}>{planning ? 'Finding routes…' : 'Choose a route'}</Text>
        {planning ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} /> : null}
        {routes.map((r, i) => {
          const sel = r.id === selected;
          const slower = r.durationS - fastest;
          const note = i === 0 ? 'Fastest' : slower > 60 ? `${formatDuration(slower, config.language)} slower` : 'Similar time';
          return (
            <Pressable
              key={r.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: sel }}
              onPress={() => set({ selectedRouteId: r.id })}
              style={[styles.card, sel && styles.cardSel]}
            >
              <View style={{ minWidth: 84 }}>
                <Text style={styles.min}>{formatDuration(r.durationS, config.language)}</Text>
                <Text style={styles.sub}>Arrive {formatClock(now + r.durationS * 1000)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {formatDistance(r.distanceM, config.language)} · via {r.maneuvers[1]?.streetNames[0] ?? r.maneuvers[0]?.streetNames[0] ?? 'local roads'}
                </Text>
                <Text style={[styles.note, { color: i === 0 ? colors.success : colors.sub }]}>{note}</Text>
                {r.flags.length ? <Text style={[styles.note, { color: colors.warning }]}>{r.flags.map((f) => FLAG_LABEL[f] ?? f).join(' · ')}</Text> : null}
              </View>
            </Pressable>
          );
        })}
        {isDevBuild ? (
          <View style={styles.simRow}>
            <Text style={styles.sub}>Simulate drive (dev)</Text>
            <Switch value={simulate} onValueChange={(v) => set({ simulate: v })} accessibilityLabel="Simulate drive" />
          </View>
        ) : null}
        <PrimaryButton title={simulate ? 'Go (simulated)' : 'Go now'} disabled={!selected || planning} onPress={() => void startDrive()} />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 12, right: 12, backgroundColor: colors.surface, borderRadius: 18, paddingVertical: 8, paddingLeft: 6, paddingRight: 6, flexDirection: 'row', alignItems: 'center', gap: 6, ...shadow },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  from: { fontSize: 13, color: colors.muted },
  to: { fontSize: 16, fontWeight: '700', color: colors.ink },
  h2: { fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 4 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.surface },
  cardSel: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  min: { fontSize: 22, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 13, color: colors.sub },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  note: { fontSize: 12, fontWeight: '600' },
  simRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
