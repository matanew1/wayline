import type { ReportType } from '@wayline/contracts';
import { formatClock, formatDistance } from '@wayline/navigation-core';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/i18n';
import { closeArrival, report } from '@/nav/drive';
import { answerDisclosure, set, useApp } from '@/state/store';
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
            <Pressable key={type} accessibilityRole="button" accessibilityLabel={t('reportType', { type: t(`type.${type}`) })} testID={`report-${type}`} onPress={() => void report(type)} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.7 }]}>
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

/** Google Play "prominent disclosure": our explanation before the system's background-location prompt. */
export function LocationDisclosure() {
  const { t } = useT();
  const open = useApp((s) => s.disclosureOpen);
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => answerDisclosure(false)}>
      <View style={styles.dialogScrim}>
        <View style={styles.dialog} accessibilityViewIsModal>
          <View style={styles.dialogIcon}><Icon name="recenter" color={colors.primary} size={28} /></View>
          <Text style={styles.dialogTitle}>{t('bgTitle')}</Text>
          <Text style={styles.dialogBody}>{t('bgBody')}</Text>
          <View style={{ alignSelf: 'stretch', gap: 10 }}>
            <PrimaryButton title={t('bgAllow')} onPress={() => answerDisclosure(true)} testID="disclosure-continue" />
            <PrimaryButton title={t('bgNotNow')} tone="secondary" onPress={() => answerDisclosure(false)} testID="disclosure-not-now" />
          </View>
        </View>
      </View>
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
        <PrimaryButton title={t('done')} onPress={closeArrival} testID="arrived-done" />
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
  dialogScrim: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: colors.surface, borderRadius: 24, padding: 24, gap: 14, alignItems: 'center', alignSelf: 'stretch' },
  dialogIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  dialogTitle: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  dialogBody: { fontSize: 15, lineHeight: 22, color: colors.sub, textAlign: 'center' },
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
