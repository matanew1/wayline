import type { ReportType } from '@wayline/contracts';
import { formatClock, formatDistance } from '@wayline/navigation-core';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/i18n';
import { closeArrival, report } from '@/nav/drive';
import { set, useApp } from '@/state/store';
import { colors, reportColors } from '@/theme';
import { Icon } from './Icon';
import { PrimaryButton, Sheet } from './ui';

const TYPES: (ReportType & `${string}`)[] = ['traffic', 'police', 'crash', 'hazard', 'closure', 'camera'];

/** Two taps to report: open, pick. */
export function ReportSheet() {
  const { t } = useT();
  const open = useApp((s) => s.reportSheetOpen);
  const close = () => set({ reportSheetOpen: false });
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <Pressable accessibilityLabel={t('closeReport')} style={styles.scrim} onPress={close} />
      <Sheet>
        <Text style={styles.h2}>{t('whatDoYouSee')}</Text>
        <View style={styles.grid}>
          {TYPES.map((type) => (
            <Pressable key={type} accessibilityRole="button" accessibilityLabel={t('reportType', { type: t(`type.${type}`) })} onPress={() => void report(type)} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.7 }]}>
              <View style={[styles.tileIcon, { backgroundColor: reportColors[type] }]}>
                <Icon name={type} color="#FFFFFF" size={26} />
              </View>
              <Text style={styles.tileText}>{t(`type.${type}`)}</Text>
            </Pressable>
          ))}
        </View>
        <PrimaryButton title={t('cancel')} tone="secondary" onPress={close} />
      </Sheet>
    </Modal>
  );
}

export function ArrivedPanel() {
  const { t, lang } = useT();
  const a = useApp((s) => s.arrival);
  if (!a) return null;
  return (
    <Sheet style={{ alignItems: 'center', paddingTop: 20 }}>
      <View style={styles.check}><Icon name="check" color={colors.success} size={32} strokeWidth={2.6} /></View>
      <Text style={styles.arrived}>{t('arrived')}</Text>
      <Text style={styles.sub}>{a.name} · {formatDistance(a.distanceM, lang)} · {formatClock(a.arrivedAt)}</Text>
      <View style={{ alignSelf: 'stretch' }}>
        <PrimaryButton title={t('done')} onPress={closeArrival} />
      </View>
    </Sheet>
  );
}

export function Toast() {
  const msg = useApp((s) => s.toast);
  const insets = useSafeAreaInsets();
  if (!msg) return null;
  return (
    <View pointerEvents="none" style={[styles.toastWrap, { top: insets.top + 120 }]}>
      <Text accessibilityLiveRegion="polite" style={styles.toast}>{msg}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  h2: { fontSize: 20, fontWeight: '800', color: colors.ink, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '31%', flexGrow: 1, alignItems: 'center', gap: 8, paddingVertical: 14, borderRadius: 16, backgroundColor: colors.surfaceSoft },
  tileIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  tileText: { fontSize: 14, fontWeight: '700', color: colors.ink },
  check: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' },
  arrived: { fontSize: 24, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 15, color: colors.sub, textAlign: 'center' },
  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  toast: { backgroundColor: colors.ink, color: '#FFFFFF', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, fontSize: 14, fontWeight: '600', overflow: 'hidden', maxWidth: '90%', textAlign: 'center' },
});
