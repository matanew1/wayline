import { formatClock, formatDistance, formatDuration } from '@wayline/navigation-core';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/i18n';
import { acceptFasterRoute, answerAlert, declineFasterRoute, endDrive, toggleShareEta, toggleVoice } from '@/nav/drive';
import { useSettings } from '@/state/settings';
import { set, useApp } from '@/state/store';
import { elevation, fonts, REPORT_INK, reportColors, useLayout, useTheme } from '@/theme';
import { Icon, laneIcon, maneuverIcon } from './Icon';
import { RoundButton, type } from './ui';
import { useNow } from './useNow';

/** Over the limit by more than this (km/h) turns the speed bubble red. */
const SPEED_TOLERANCE_KMH = 5;
/** Matches NavigationSession's autoAcceptMs default: an unanswered faster route is taken. */
const OFFER_AUTO_ACCEPT_MS = 8_000;

/** Ticks every 250 ms while `active` — drives the offer countdown. */
function useTicker(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function NavPanel() {
  const { t, lang } = useT();
  const c = useTheme();
  const T = type(c);
  const { wide, panelWidth } = useLayout();
  const insets = useSafeAreaInsets();
  const nav = useApp((s) => s.nav);
  const sharing = useApp((s) => !!s.sharingUrl);
  const voice = useSettings((s) => s.voice);
  const now = useNow();
  const tick = useTicker(!!nav?.offer);
  if (!nav) return null;

  const p = nav.progress;
  const rerouting = nav.phase === 'rerouting';
  const next = p?.nextManeuver ?? nav.route.maneuvers[1] ?? nav.route.maneuvers[0];
  const then = p?.thenManeuver;
  const lanes = !rerouting && next?.lanes?.length ? next.lanes : null;
  const speedKmh = Math.round(nav.speedMs * 3.6);
  const limit = p?.speedLimitKmh ?? null;
  const speeding = limit != null && speedKmh > limit + SPEED_TOLERANCE_KMH;
  const remainingS = nav.remainingS ?? p?.durationRemainingS ?? nav.route.durationS;
  const strip = (s: string) => s.replace(/\.$/, '');
  const offerLeftMs = nav.offer ? Math.max(0, OFFER_AUTO_ACCEPT_MS - (tick - nav.offer.offeredAt)) : 0;

  // phones: full-width cards; tablets / landscape: one column on the left
  const col = wide ? { left: insets.left + 16, width: panelWidth } : { left: 12, right: 12 };

  return (
    <>
      {/* Maneuver card + lanes + "then" */}
      <View style={[styles.topCol, col, { top: insets.top + 10 }]} pointerEvents="box-none">
        <View style={[styles.banner, { backgroundColor: c.primary, borderColor: c.primaryDeep }, elevation(c)]} accessibilityLiveRegion="polite" testID="nav-banner">
          <View style={styles.turn}>
            <Icon name={rerouting ? 'recenter' : maneuverIcon(next?.kind)} color="#FFFFFF" size={38} strokeWidth={2.6} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            {rerouting ? (
              <Text style={styles.instr}>{t('recalculating')}</Text>
            ) : (
              <>
                <Text style={styles.dist}>{p ? formatDistance(p.distanceToManeuverM, lang) : '—'}</Text>
                <Text style={styles.instr} numberOfLines={2}>{next ? strip(next.instruction) : ''}</Text>
              </>
            )}
          </View>
        </View>
        {lanes ? (
          <View style={[styles.lanes, { backgroundColor: c.primaryDeep }]} accessible accessibilityLabel={t('useLanes')} testID="lanes">
            {lanes.map((l, i) => (
              <View key={i} style={[styles.lane, { backgroundColor: l.valid ? '#FFFFFF' : 'rgba(255,255,255,0.12)' }]}>
                <Icon name={laneIcon(l.indications)} color={l.valid ? c.primary : 'rgba(255,255,255,0.55)'} size={24} strokeWidth={2.6} />
              </View>
            ))}
          </View>
        ) : null}
        {!rerouting && then && then.kind !== 'arrive' ? (
          <View style={[styles.then, { backgroundColor: c.surface, borderColor: c.line }, elevation(c, 'sm')]}>
            <Text style={[T.strong, { fontSize: 14 }]} numberOfLines={1}>{t('then', { x: strip(then.instruction) })}</Text>
          </View>
        ) : null}

        {nav.alert && !nav.offer ? (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }, elevation(c)]} accessibilityRole="alert">
            <View style={styles.cardRow}>
              <View style={[styles.cardIcon, { backgroundColor: reportColors[nav.alert.report.type] }]}>
                <Icon name={nav.alert.report.type as 'police'} color={REPORT_INK} size={22} strokeWidth={2.4} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={T.h2}>{t('reportedAhead', { type: t(`type.${nav.alert.report.type}` as 'type.police') })}</Text>
                <Text style={T.sub}>{t('byDriver', { d: formatDistance(nav.alert.distanceAheadM, lang) })}</Text>
              </View>
            </View>
            <View style={styles.cardRow}>
              <Pressable accessibilityRole="button" onPress={() => answerAlert(true)} style={[styles.vote, { backgroundColor: c.primary }]}>
                <Text style={[styles.voteText, { color: c.onPrimary }]}>{t('stillThere')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => answerAlert(false)} style={[styles.vote, { backgroundColor: c.surface2, borderColor: c.line, borderWidth: 1.5 }]}>
                <Text style={[styles.voteText, { color: c.ink }]}>{t('notThere')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      {/* Faster route: takes itself after a few seconds unless the driver keeps the current one */}
      {nav.offer ? (
        <View
          style={[styles.offer, col, { bottom: insets.bottom + (wide ? 120 : 118), backgroundColor: c.surface, borderColor: c.line }, elevation(c)]}
          accessibilityRole="alert"
          testID="faster-route"
        >
          <View style={styles.cardRow}>
            <View style={[styles.cardIcon, { backgroundColor: c.successSoft }]}><Icon name="fast" color={c.success} size={22} strokeWidth={2.4} /></View>
            <Text style={[T.h2, { flex: 1 }]}>{t('fasterRouteSaves', { d: formatDuration(nav.offer.savingS, lang) })}</Text>
          </View>
          <View style={styles.cardRow}>
            <Pressable
              accessibilityRole="button"
              onPress={acceptFasterRoute}
              style={[styles.vote, { flex: 1.4, backgroundColor: c.primaryDeep, overflow: 'hidden' }]}
            >
              <View style={[StyleSheet.absoluteFill, { backgroundColor: c.primary, width: `${Math.round((1 - offerLeftMs / OFFER_AUTO_ACCEPT_MS) * 100)}%` }]} />
              <Text style={[styles.voteText, { color: c.onPrimary }]}>{t('switchIn', { s: Math.ceil(offerLeftMs / 1000) })}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={declineFasterRoute} style={[styles.vote, { backgroundColor: c.surface2, borderColor: c.line, borderWidth: 1.5 }]}>
              <Text style={[styles.voteText, { color: c.ink }]}>{t('keepRoute')}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View
          style={[styles.mid, wide ? { left: insets.left + panelWidth + 32, right: 16 } : { left: 14, right: 14 }, { bottom: insets.bottom + (wide ? 24 : 116) }]}
          pointerEvents="box-none"
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <View
              style={[styles.speed, { backgroundColor: speeding ? c.danger : c.surface, borderColor: speeding ? c.danger : c.line }, elevation(c)]}
              accessibilityLabel={t('speed', { n: speedKmh })}
            >
              <Text style={[styles.speedNum, { color: speeding ? '#FFFFFF' : c.ink }]}>{speedKmh}</Text>
              <Text style={[styles.speedUnit, { color: speeding ? '#FFFFFF' : c.ink }]}>{lang === 'he' ? 'קמ״ש' : 'km/h'}</Text>
            </View>
            {limit != null ? (
              <View style={styles.limit} accessibilityLabel={t('speedLimit', { n: limit })}>
                <Text style={styles.limitNum}>{limit}</Text>
              </View>
            ) : null}
          </View>
          <RoundButton icon="plus" label={t('reportHazard')} size={64} bg={c.danger} fg="#FFFFFF" onPress={() => set({ reportSheetOpen: true })} />
        </View>
      )}

      {/* Drive bar */}
      <View
        style={[
          styles.bar,
          { backgroundColor: c.surface, borderColor: c.line },
          wide
            ? { left: insets.left + 16, width: panelWidth, bottom: Math.max(16, insets.bottom + 8), borderRadius: 24, borderBottomWidth: 1.5, paddingBottom: 14 }
            : { left: 0, right: 0, bottom: 0, paddingBottom: Math.max(18, insets.bottom + 6) },
          elevation(c),
        ]}
      >
        <RoundButton icon="close" testID="end-drive" label={t('endDrive')} bg={c.dangerSoft} fg={c.dangerInk} raised={false} onPress={() => void endDrive()} />
        <View style={{ flex: 1, alignItems: 'center', minWidth: 0 }}>
          <Text style={[T.display, { fontSize: 28 }]}>{formatDuration(remainingS, lang)}</Text>
          <Text style={[T.sub, { fontVariant: ['tabular-nums'] }]} numberOfLines={1}>
            {t('remaining', {
              d: formatDistance(p?.distanceRemainingM ?? nav.route.distanceM, lang),
              t: formatClock(nav.etaEpochMs ?? now + remainingS * 1000),
            })}
          </Text>
        </View>
        <RoundButton
          icon="share" testID="share-eta" label={sharing ? t('stopSharing') : t('shareEta')} selected={sharing}
          bg={sharing ? c.primary : c.surface2} fg={sharing ? c.onPrimary : c.ink} raised={false} onPress={() => void toggleShareEta()}
        />
        <RoundButton icon={voice ? 'volume' : 'mute'} label={voice ? t('mute') : t('unmute')} bg={c.surface2} raised={false} onPress={toggleVoice} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  topCol: { position: 'absolute', gap: 8, alignItems: 'stretch' },
  banner: { borderRadius: 26, borderWidth: 1.5, padding: 14, flexDirection: 'row', gap: 14, alignItems: 'center' },
  turn: { width: 64, height: 64, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  dist: { color: '#FFFFFF', fontSize: 36, fontFamily: fonts.heavy, letterSpacing: -0.6, fontVariant: ['tabular-nums'], textAlign: 'left' },
  instr: { color: '#FFFFFF', fontSize: 17, fontFamily: fonts.bold, lineHeight: 22, textAlign: 'left' },
  lanes: { borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  lane: { width: 44, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  then: { alignSelf: 'flex-start', marginStart: 12, maxWidth: '92%', borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 6 },
  card: { borderRadius: 24, borderWidth: 1.5, padding: 14, gap: 12 },
  offer: { position: 'absolute', borderRadius: 24, borderWidth: 1.5, padding: 14, gap: 12 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  vote: { flex: 1, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  voteText: { fontSize: 15, fontFamily: fonts.heavy },
  mid: { position: 'absolute', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  speed: { width: 70, height: 70, borderRadius: 35, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  speedNum: { fontSize: 26, fontFamily: fonts.heavy, lineHeight: 28, fontVariant: ['tabular-nums'] },
  speedUnit: { fontSize: 11, fontFamily: fonts.bold },
  limit: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFFFFF', borderWidth: 5, borderColor: '#E0262D', alignItems: 'center', justifyContent: 'center' },
  limitNum: { fontSize: 16, fontFamily: fonts.heavy, color: '#1B1838', fontVariant: ['tabular-nums'] },
  bar: {
    position: 'absolute', borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1.5, borderBottomWidth: 0,
    paddingTop: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
});
