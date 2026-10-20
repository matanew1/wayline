import { formatClock, formatDistance, formatDuration } from '@wayline/navigation-core';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { config } from '@/config';
import { answerAlert, endDrive, toggleMute } from '@/nav/drive';
import { set, useApp } from '@/state/store';
import { colors, reportColors, reportLabels, shadow } from '@/theme';
import { Icon, maneuverIcon } from './Icon';
import { RoundButton } from './ui';
import { useNow } from './useNow';

export function NavPanel() {
  const insets = useSafeAreaInsets();
  const nav = useApp((s) => s.nav);
  const muted = useApp((s) => s.muted);
  const now = useNow();
  if (!nav) return null;
  const p = nav.progress;
  const lang = config.language;
  const rerouting = nav.phase === 'rerouting';
  const next = p?.nextManeuver ?? nav.route.maneuvers[1] ?? nav.route.maneuvers[0];
  const then = p?.thenManeuver;
  const speedKmh = Math.round(nav.speedMs * 3.6);
  const remainingS = p?.durationRemainingS ?? nav.route.durationS;

  return (
    <>
      {/* Maneuver banner */}
      <View style={[styles.banner, { top: insets.top + 8 }]} accessibilityLiveRegion="polite">
        <View style={styles.turn}>
          <Icon name={rerouting ? 'recenter' : maneuverIcon(next?.kind)} color="#FFFFFF" size={36} strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          {rerouting ? (
            <Text style={styles.instr}>Recalculating route…</Text>
          ) : (
            <>
              <Text style={styles.dist}>{p ? formatDistance(p.distanceToManeuverM, lang) : '—'}</Text>
              <Text style={styles.instr} numberOfLines={2}>{next?.instruction.replace(/\.$/, '')}</Text>
              {then && then.kind !== 'arrive' ? <Text style={styles.then} numberOfLines={1}>Then {then.instruction.replace(/\.$/, '').toLowerCase()}</Text> : null}
            </>
          )}
        </View>
      </View>

      {/* Report-ahead alert */}
      {nav.alert ? (
        <View style={[styles.alert, { top: insets.top + 140 }]} accessibilityRole="alert">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[styles.alertIcon, { backgroundColor: reportColors[nav.alert.report.type] }]}>
              <Icon name={nav.alert.report.type as 'police'} color="#FFFFFF" size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>{reportLabels[nav.alert.report.type]} reported ahead</Text>
              <Text style={styles.alertSub}>{formatDistance(nav.alert.distanceAheadM, lang)} · reported by a driver</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable accessibilityRole="button" onPress={() => answerAlert(true)} style={[styles.vote, { backgroundColor: colors.ink }]}>
              <Text style={[styles.voteText, { color: '#FFFFFF' }]}>Still there</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => answerAlert(false)} style={[styles.vote, styles.voteAlt]}>
              <Text style={styles.voteText}>Not there</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Speed + report */}
      <View style={[styles.mid, { bottom: insets.bottom + 108 }]} pointerEvents="box-none">
        <View style={styles.speed} accessibilityLabel={`Speed ${speedKmh} kilometers per hour`}>
          <Text style={styles.speedNum}>{speedKmh}</Text>
          <Text style={styles.speedUnit}>km/h</Text>
        </View>
        <RoundButton icon="alert" label="Report a hazard" size={60} bg={colors.report} fg="#FFFFFF" onPress={() => set({ reportSheetOpen: true })} />
      </View>

      {/* Bottom bar */}
      <View style={[styles.bar, { paddingBottom: Math.max(18, insets.bottom + 6) }]}>
        <RoundButton icon="close" label="End drive" bg={colors.surfaceAlt} raised={false} onPress={() => void endDrive()} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.eta}>{formatDuration(remainingS, lang)}</Text>
          <Text style={styles.etaSub}>
            {formatDistance(p?.distanceRemainingM ?? nav.route.distanceM, lang)} · arrive {formatClock(nav.etaEpochMs ?? now + remainingS * 1000)}
          </Text>
        </View>
        <RoundButton icon={muted ? 'mute' : 'volume'} label={muted ? 'Unmute voice guidance' : 'Mute voice guidance'} bg={colors.surfaceAlt} raised={false} onPress={toggleMute} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'absolute', left: 12, right: 12, backgroundColor: colors.ink, borderRadius: 20, padding: 16, flexDirection: 'row', gap: 14, alignItems: 'center', ...shadow },
  turn: { width: 60, height: 60, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  dist: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] },
  instr: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', lineHeight: 21 },
  then: { color: '#CBD5E1', fontSize: 13, marginTop: 2 },
  alert: { position: 'absolute', left: 12, right: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 14, gap: 12, ...shadow },
  alertIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  alertTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  alertSub: { fontSize: 13, color: colors.sub },
  vote: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  voteAlt: { borderWidth: 2, borderColor: '#CBD5E1', backgroundColor: colors.surface },
  voteText: { fontSize: 15, fontWeight: '700', color: colors.ink },
  mid: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  speed: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow },
  speedNum: { fontSize: 24, fontWeight: '800', color: colors.ink, lineHeight: 26, fontVariant: ['tabular-nums'] },
  speedUnit: { fontSize: 11, fontWeight: '600', color: colors.ink },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow },
  eta: { fontSize: 26, fontWeight: '800', color: colors.success, fontVariant: ['tabular-nums'] },
  etaSub: { fontSize: 14, color: colors.sub, fontVariant: ['tabular-nums'] },
});
