import { formatClock, formatDistance, formatDuration, routeReasons, type RouteReason } from '@wayline/navigation-core';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isDevBuild } from '@/config';
import { useT, type StringKey } from '@/i18n';
import { cancelPreview, loadDepartures, startDrive } from '@/nav/drive';
import { setSetting, useSettings } from '@/state/settings';
import { set, useApp } from '@/state/store';
import { elevation, fonts, useLayout, useTheme } from '@/theme';
import { Icon } from './Icon';
import { PrimaryButton, Sheet, type } from './ui';
import { useNow } from './useNow';

export function PreviewPanel() {
  const { t, lang } = useT();
  const c = useTheme();
  const T = type(c);
  const { wide, panelWidth } = useLayout();
  const insets = useSafeAreaInsets();
  const dest = useApp((s) => s.destination);
  const routes = useApp((s) => s.routes);
  const selected = useApp((s) => s.selectedRouteId);
  const planning = useApp((s) => s.planning);
  const reports = useApp((s) => s.reports);
  const departures = useApp((s) => s.departures);
  const simulate = useSettings((s) => s.simulate);
  const now = useNow();
  const fastest = Math.min(...routes.map((r) => r.durationS));
  const reasons = useMemo(() => routeReasons(routes, Object.values(reports)), [routes, reports]);

  useEffect(() => {
    if (selected) void loadDepartures(selected);
  }, [selected]);

  const reasonText = (r: RouteReason): string => {
    switch (r.kind) {
      case 'avoidsJams': return t('reason.avoidsJams');
      case 'jams': return r.count === 1 ? t('reason.jam') : t('reason.jams', { n: r.count });
      case 'reports': {
        const type = t(`type.${r.type}` as StringKey);
        return r.count === 1 ? t('reason.report', { type }) : t('reason.reports', { n: r.count, type });
      }
      case 'toll': return t('reason.toll');
      case 'fewestTurns': return t('reason.fewestTurns');
      case 'shortest': return t('reason.shortest');
    }
  };

  const historic = departures?.some((d) => d.basis === 'historic');
  const showDepartures = !planning && departures && departures.length > 1;

  return (
    <>
      <View
        style={[
          styles.top,
          { top: insets.top + 12, backgroundColor: c.surface, borderColor: c.line },
          wide ? { left: panelWidth + 32, right: 16 } : null,
          elevation(c),
        ]}
      >
        <Pressable
          accessibilityRole="button" accessibilityLabel={t('back')} onPress={() => set({ screen: 'search' })} hitSlop={8}
          style={[styles.back, { backgroundColor: c.surface2 }]}
        >
          <Icon name="back" size={22} color={c.ink} strokeWidth={2.6} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={T.sub}>{t('fromYourLocation')}</Text>
          <Text style={[T.h2, { fontSize: 17 }]} numberOfLines={1}>{t('to', { name: dest?.name ?? '' })}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('cancel')} onPress={cancelPreview} hitSlop={8} style={[styles.back, { backgroundColor: c.surface2 }]}>
          <Icon name="close" size={20} color={c.ink} strokeWidth={2.6} />
        </Pressable>
      </View>

      <Sheet>
        <Text style={T.title}>{planning ? t('findingRoutes') : t('pickRoute')}</Text>
        {planning ? <ActivityIndicator color={c.primary} style={{ marginVertical: 24 }} /> : null}
        {routes.map((r, i) => {
          const sel = r.id === selected;
          const best = r.durationS === fastest && routes.length > 1;
          const street = r.maneuvers[1]?.streetNames[0] ?? r.maneuvers[0]?.streetNames[0] ?? t('localRoads');
          const why = (reasons[i] ?? []).map(reasonText);
          const slower = r.durationS - fastest;
          return (
            <Pressable
              key={r.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: sel }}
              onPress={() => set({ selectedRouteId: r.id })}
              testID={`route-${i}`}
              style={[
                styles.card,
                { borderColor: sel ? c.primary : c.line, backgroundColor: sel ? c.primarySoft : c.surface },
                sel && { borderWidth: 2 },
              ]}
            >
              <View style={{ minWidth: 78 }}>
                <Text style={[T.display, { fontSize: 26 }]}>{formatDuration(r.durationS, lang)}</Text>
                <Text style={T.sub}>{t('arrive', { t: formatClock(now + r.durationS * 1000) })}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={[T.strong, { fontSize: 15 }]} numberOfLines={1}>{t('via', { s: street })}</Text>
                <Text style={T.sub} numberOfLines={2}>
                  {[formatDistance(r.distanceM, lang), ...(best || slower <= 60 ? [] : [t('slower', { d: formatDuration(slower, lang) })]), ...why].join(' · ')}
                </Text>
              </View>
              {best ? (
                <View style={[styles.badge, { backgroundColor: c.primary }]}>
                  <Text style={styles.badgeText}>{t('fastest')}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}

        {showDepartures ? (
          <View style={{ gap: 8 }} testID="departures">
            <View style={styles.depHead}>
              <Text style={[T.strong, { fontSize: 15 }]}>{t('bestTimeToLeave')}</Text>
              <Text style={T.sub}>{historic ? t('fromUsualTraffic') : t('fromLiveTraffic')}</Text>
            </View>
            <View style={styles.depRow}>
              {departures.map((d) => {
                const quickest = d.durationS === Math.min(...departures.map((x) => x.durationS));
                return (
                  <View
                    key={d.offsetMin}
                    accessible
                    accessibilityLabel={`${d.offsetMin === 0 ? t('now') : formatClock(Date.parse(d.departAt))}: ${formatDuration(d.durationS, lang)}`}
                    style={[styles.dep, { borderColor: quickest ? c.primary : c.line, backgroundColor: quickest ? c.primarySoft : c.surface }]}
                  >
                    <Text style={T.sub}>{d.offsetMin === 0 ? t('now') : formatClock(Date.parse(d.departAt))}</Text>
                    <Text style={[T.strong, { fontFamily: fonts.heavy }]}>{formatDuration(d.durationS, lang)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {isDevBuild ? (
          <View style={styles.simRow}>
            <Text style={T.sub}>{t('simulateDrive')}</Text>
            <Switch
              value={simulate} onValueChange={(v) => setSetting('simulate', v)} accessibilityLabel={t('simulateDrive')} testID="simulate-switch"
              trackColor={{ false: c.surface2, true: c.primary }} thumbColor="#FFFFFF"
            />
          </View>
        ) : null}
        <PrimaryButton
          title={simulate && isDevBuild ? t('goSimulated') : t('letsGo')}
          icon="arrowRight"
          disabled={!selected || planning}
          onPress={() => void startDrive()}
          testID="go"
        />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 14, right: 14, borderRadius: 22, borderWidth: 1.5, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5 },
  badge: { position: 'absolute', top: -10, right: 12, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontFamily: fonts.heavy, letterSpacing: 0.5, textTransform: 'uppercase' },
  depHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  depRow: { flexDirection: 'row', gap: 8 },
  dep: { flex: 1, minHeight: 56, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  simRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
