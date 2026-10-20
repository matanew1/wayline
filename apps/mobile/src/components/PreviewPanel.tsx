import { formatClock, formatDistance, formatDuration } from '@wayline/navigation-core';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isDevBuild } from '@/config';
import { useT, type StringKey } from '@/i18n';
import { cancelPreview, startDrive } from '@/nav/drive';
import { setSetting, useSettings } from '@/state/settings';
import { set, useApp } from '@/state/store';
import { colors, shadow } from '@/theme';
import { Icon } from './Icon';
import { PrimaryButton, Sheet } from './ui';
import { useNow } from './useNow';

const FLAG_KEY: Record<string, StringKey> = { toll: 'toll', highway: 'highway', ferry: 'ferry' };

export function PreviewPanel() {
  const { t, lang } = useT();
  const insets = useSafeAreaInsets();
  const dest = useApp((s) => s.destination);
  const routes = useApp((s) => s.routes);
  const selected = useApp((s) => s.selectedRouteId);
  const planning = useApp((s) => s.planning);
  const simulate = useSettings((s) => s.simulate);
  const now = useNow();
  const fastest = Math.min(...routes.map((r) => r.durationS));

  return (
    <>
      <View style={[styles.top, { top: insets.top + 12 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('back')} onPress={() => set({ screen: 'search' })} style={styles.back} hitSlop={8}>
          <Icon name="back" size={24} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.from}>{t('fromYourLocation')}</Text>
          <Text style={styles.to} numberOfLines={1}>{t('to', { name: dest?.name ?? '' })}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('cancel')} onPress={cancelPreview} style={styles.back} hitSlop={8}>
          <Icon name="close" size={22} />
        </Pressable>
      </View>

      <Sheet>
        <Text style={styles.h2}>{planning ? t('findingRoutes') : t('chooseRoute')}</Text>
        {planning ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} /> : null}
        {routes.map((r, i) => {
          const sel = r.id === selected;
          const slower = r.durationS - fastest;
          const note = i === 0 ? t('fastest') : slower > 60 ? t('slower', { d: formatDuration(slower, lang) }) : t('similarTime');
          const delay = r.traffic ? r.durationS - r.traffic.baseDurationS : 0;
          const street = r.maneuvers[1]?.streetNames[0] ?? r.maneuvers[0]?.streetNames[0] ?? t('localRoads');
          return (
            <Pressable
              key={r.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: sel }}
              onPress={() => set({ selectedRouteId: r.id })}
              style={[styles.card, sel && styles.cardSel]}
            >
              <View style={{ minWidth: 84 }}>
                <Text style={styles.min}>{formatDuration(r.durationS, lang)}</Text>
                <Text style={styles.sub}>{t('arrive', { t: formatClock(now + r.durationS * 1000) })}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {formatDistance(r.distanceM, lang)} · {t('via', { s: street })}
                </Text>
                <Text style={[styles.note, { color: i === 0 ? colors.success : colors.sub }]}>{note}</Text>
                {delay >= 120 ? <Text style={[styles.note, { color: colors.danger }]}>{t('traffic', { d: formatDuration(delay, lang) })}</Text> : null}
                {r.flags.length ? <Text style={[styles.note, { color: colors.warning }]}>{r.flags.map((f) => (FLAG_KEY[f] ? t(FLAG_KEY[f]) : f)).join(' · ')}</Text> : null}
              </View>
            </Pressable>
          );
        })}
        {isDevBuild ? (
          <View style={styles.simRow}>
            <Text style={styles.sub}>{t('simulateDrive')}</Text>
            <Switch value={simulate} onValueChange={(v) => setSetting('simulate', v)} accessibilityLabel={t('simulateDrive')} />
          </View>
        ) : null}
        <PrimaryButton title={simulate && isDevBuild ? t('goSimulated') : t('goNow')} disabled={!selected || planning} onPress={() => void startDrive()} />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 12, right: 12, backgroundColor: colors.surface, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 6, ...shadow },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  from: { fontSize: 13, color: colors.muted, textAlign: 'left' },
  to: { fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'left' },
  h2: { fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 4, textAlign: 'left' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.surface },
  cardSel: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  min: { fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'left' },
  sub: { fontSize: 13, color: colors.sub, textAlign: 'left' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.ink, textAlign: 'left' },
  note: { fontSize: 12, fontWeight: '600', textAlign: 'left' },
  simRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
