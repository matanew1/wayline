import { formatClock, formatDistance, formatDuration } from '@wayline/navigation-core';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/i18n';
import { acceptFasterRoute, answerAlert, declineFasterRoute, endDrive, toggleVoice } from '@/nav/drive';
import { useSettings } from '@/state/settings';
import { set, useApp } from '@/state/store';
import { colors, reportColors, shadow } from '@/theme';
import { Icon, maneuverIcon } from './Icon';
import { RoundButton } from './ui';
import { useNow } from './useNow';

/** Over the limit by more than this (km/h) turns the speed bubble orange. */
const SPEED_TOLERANCE_KMH = 5;

export function NavPanel() {
  const { t, lang } = useT();
  const insets = useSafeAreaInsets();
  const nav = useApp((s) => s.nav);
  const voice = useSettings((s) => s.voice);
  const now = useNow();
  if (!nav) return null;
  const p = nav.progress;
  const rerouting = nav.phase === 'rerouting';
  const next = p?.nextManeuver ?? nav.route.maneuvers[1] ?? nav.route.maneuvers[0];
  const then = p?.thenManeuver;
  const speedKmh = Math.round(nav.speedMs * 3.6);
  const limit = p?.speedLimitKmh ?? null;
  const speeding = limit != null && speedKmh > limit + SPEED_TOLERANCE_KMH;
  const remainingS = nav.remainingS ?? p?.durationRemainingS ?? nav.route.durationS;
  const strip = (s: string) => s.replace(/\.$/, '');

  return (
    <>
      {/* Maneuver banner */}
      <View style={[styles.banner, { top: insets.top + 8 }]} accessibilityLiveRegion="polite" testID="nav-banner">
        <View style={styles.turn}>
          <Icon name={rerouting ? 'recenter' : maneuverIcon(next?.kind)} color="#FFFFFF" size={36} strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          {rerouting ? (
            <Text style={styles.instr}>{t('recalculating')}</Text>
          ) : (
            <>
              <Text style={styles.dist}>{p ? formatDistance(p.distanceToManeuverM, lang) : '—'}</Text>
              <Text style={styles.instr} numberOfLines={2}>{next ? strip(next.instruction) : ''}</Text>
              {then && then.kind !== 'arrive' ? <Text style={styles.then} numberOfLines={1}>{t('then', { x: strip(then.instruction) })}</Text> : null}
            </>
          )}
        </View>
      </View>

      {/* Faster route offer (from the live-traffic ETA check) */}
      {nav.offer ? (
        <View style={[styles.card, { top: insets.top + 140 }]} accessibilityRole="alert">
          <View style={styles.cardRow}>
            <View style={[styles.cardIcon, { backgroundColor: colors.success }]}><Icon name="fast" color="#FFFFFF" size={22} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{t('fasterRoute')}</Text>
              <Text style={styles.cardSub}>{t('saves', { d: formatDuration(nav.offer.savingS, lang) })}</Text>
            </View>
          </View>
          <View style={styles.cardRow}>
            <Pressable accessibilityRole="button" onPress={acceptFasterRoute} style={[styles.vote, { backgroundColor: colors.success }]}>
              <Text style={[styles.voteText, { color: '#FFFFFF' }]}>{t('takeIt')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={declineFasterRoute} style={[styles.vote, styles.voteAlt]}>
              <Text style={styles.voteText}>{t('keepRoute')}</Text>
            </Pressable>
          </View>
        </View>
      ) : nav.alert ? (
        /* Report-ahead alert */
        <View style={[styles.card, { top: insets.top + 140 }]} accessibilityRole="alert">
          <View style={styles.cardRow}>
            <View style={[styles.cardIcon, { backgroundColor: reportColors[nav.alert.report.type] }]}>
              <Icon name={nav.alert.report.type as 'police'} color="#FFFFFF" size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{t('reportedAhead', { type: t(`type.${nav.alert.report.type}` as 'type.police') })}</Text>
              <Text style={styles.cardSub}>{t('byDriver', { d: formatDistance(nav.alert.distanceAheadM, lang) })}</Text>
            </View>
          </View>
          <View style={styles.cardRow}>
            <Pressable accessibilityRole="button" onPress={() => answerAlert(true)} style={[styles.vote, { backgroundColor: colors.ink }]}>
              <Text style={[styles.voteText, { color: '#FFFFFF' }]}>{t('stillThere')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => answerAlert(false)} style={[styles.vote, styles.voteAlt]}>
              <Text style={styles.voteText}>{t('notThere')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Speed, speed limit, report */}
      <View style={[styles.mid, { bottom: insets.bottom + 108 }]} pointerEvents="box-none">
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
          <View
            style={[styles.speed, speeding && { backgroundColor: colors.report }]}
            accessibilityLabel={t('speed', { n: speedKmh })}
          >
            <Text style={[styles.speedNum, speeding && { color: '#FFFFFF' }]}>{speedKmh}</Text>
            <Text style={[styles.speedUnit, speeding && { color: '#FFFFFF' }]}>{lang === 'he' ? 'קמ״ש' : 'km/h'}</Text>
          </View>
          {limit != null ? (
            <View style={styles.limit} accessibilityLabel={t('speedLimit', { n: limit })}>
              <Text style={styles.limitNum}>{limit}</Text>
            </View>
          ) : null}
        </View>
        <RoundButton icon="alert" label={t('reportHazard')} size={60} bg={colors.report} fg="#FFFFFF" onPress={() => set({ reportSheetOpen: true })} />
      </View>

      {/* Bottom bar */}
      <View style={[styles.bar, { paddingBottom: Math.max(18, insets.bottom + 6) }]}>
        <RoundButton icon="close" testID="end-drive" label={t('endDrive')} bg={colors.surfaceAlt} raised={false} onPress={() => void endDrive()} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.eta}>{formatDuration(remainingS, lang)}</Text>
          <Text style={styles.etaSub}>
            {t('remaining', {
              d: formatDistance(p?.distanceRemainingM ?? nav.route.distanceM, lang),
              t: formatClock(nav.etaEpochMs ?? now + remainingS * 1000),
            })}
          </Text>
        </View>
        <RoundButton icon={voice ? 'volume' : 'mute'} label={voice ? t('mute') : t('unmute')} bg={colors.surfaceAlt} raised={false} onPress={toggleVoice} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'absolute', left: 12, right: 12, backgroundColor: colors.ink, borderRadius: 20, padding: 16, flexDirection: 'row', gap: 14, alignItems: 'center', ...shadow },
  turn: { width: 60, height: 60, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  dist: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'], textAlign: 'left' },
  instr: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', lineHeight: 21, textAlign: 'left' },
  then: { color: '#CBD5E1', fontSize: 13, marginTop: 2, textAlign: 'left' },
  card: { position: 'absolute', left: 12, right: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 14, gap: 12, ...shadow },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, textAlign: 'left' },
  cardSub: { fontSize: 13, color: colors.sub, textAlign: 'left' },
  vote: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  voteAlt: { borderWidth: 2, borderColor: '#CBD5E1', backgroundColor: colors.surface },
  voteText: { fontSize: 15, fontWeight: '700', color: colors.ink },
  mid: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  speed: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow },
  speedNum: { fontSize: 24, fontWeight: '800', color: colors.ink, lineHeight: 26, fontVariant: ['tabular-nums'] },
  speedUnit: { fontSize: 11, fontWeight: '600', color: colors.ink },
  limit: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 4, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center', ...shadow },
  limitNum: { fontSize: 15, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow },
  eta: { fontSize: 26, fontWeight: '800', color: colors.success, fontVariant: ['tabular-nums'] },
  etaSub: { fontSize: 14, color: colors.sub, fontVariant: ['tabular-nums'] },
});
