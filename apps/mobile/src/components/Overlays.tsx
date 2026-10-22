import type { ReportType } from '@wayline/contracts';
import { formatClock, formatDistance } from '@wayline/navigation-core';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/i18n';
import { closeArrival, report } from '@/nav/drive';
import { answerDisclosure, set, useApp } from '@/state/store';
import { elevation, fonts, REPORT_INK, reportColors, useTheme } from '@/theme';
import { Icon } from './Icon';
import { PrimaryButton, Sheet, type } from './ui';

const TYPES: (ReportType & `${string}`)[] = ['traffic', 'police', 'crash', 'hazard', 'closure', 'camera'];

/** Two taps to report: open, pick. */
export function ReportSheet() {
  const { t } = useT();
  const c = useTheme();
  const T = type(c);
  const open = useApp((s) => s.reportSheetOpen);
  const close = () => set({ reportSheetOpen: false });
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <Pressable accessibilityLabel={t('closeReport')} style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={close} />
      <Sheet>
        <Text style={[T.title, { marginTop: 4 }]}>{t('whatDoYouSee')}</Text>
        <View style={styles.grid}>
          {TYPES.map((type) => (
            <Pressable
              key={type}
              accessibilityRole="button"
              accessibilityLabel={t('reportType', { type: t(`type.${type}`) })}
              testID={`report-${type}`}
              onPress={() => void report(type)}
              style={({ pressed }) => [styles.tile, { backgroundColor: c.surface, borderColor: c.line }, pressed && { opacity: 0.7 }]}
            >
              <View style={[styles.tileIcon, { backgroundColor: reportColors[type] }]}>
                <Icon name={type} color={REPORT_INK} size={26} strokeWidth={2.4} />
              </View>
              <Text style={[styles.tileText, { color: c.ink }]}>{t(`type.${type}`)}</Text>
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
  const c = useTheme();
  const T = type(c);
  const open = useApp((s) => s.disclosureOpen);
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => answerDisclosure(false)}>
      <View style={[styles.dialogScrim, { backgroundColor: c.scrim }]}>
        <View style={[styles.dialog, { backgroundColor: c.surface, borderColor: c.line }, elevation(c)]} accessibilityViewIsModal>
          <View style={[styles.dialogIcon, { backgroundColor: c.primarySoft }]}><Icon name="recenter" color={c.primary} size={28} /></View>
          <Text style={[T.title, { textAlign: 'center' }]}>{t('bgTitle')}</Text>
          <Text style={[T.body, { textAlign: 'center', color: c.sub, lineHeight: 22 }]}>{t('bgBody')}</Text>
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
  const c = useTheme();
  const T = type(c);
  const a = useApp((s) => s.arrival);
  const posted = useApp((s) => s.reportsThisDrive);
  if (!a) return null;
  return (
    <Sheet style={{ alignItems: 'center', paddingTop: 22 }}>
      <View style={[styles.check, { backgroundColor: c.successSoft }]}><Icon name="check" color={c.success} size={36} strokeWidth={2.8} /></View>
      <Text style={[T.display, { fontSize: 30, textAlign: 'center' }]}>{t('youMadeIt')}</Text>
      <Text style={[T.sub, { fontSize: 15, textAlign: 'center' }]}>{a.name} · {formatDistance(a.distanceM, lang)} · {formatClock(a.arrivedAt)}</Text>
      {posted > 0 ? (
        <View style={[styles.pill, { backgroundColor: c.surface2 }]}>
          <Text style={[T.strong, { fontSize: 14 }]}>{t('postedReports', { n: posted })}</Text>
        </View>
      ) : null}
      <View style={{ alignSelf: 'stretch', marginTop: 6 }}>
        <PrimaryButton title={t('done')} onPress={closeArrival} testID="arrived-done" />
      </View>
    </Sheet>
  );
}

export function Toast() {
  const msg = useApp((s) => s.toast);
  const c = useTheme();
  const insets = useSafeAreaInsets();
  if (!msg) return null;
  return (
    <View pointerEvents="none" style={[styles.toastWrap, { top: insets.top + 84 }]}>
      <Text accessibilityLiveRegion="polite" style={[styles.toast, { backgroundColor: c.dark ? c.surface2 : c.ink, color: c.dark ? c.ink : '#FFFFFF' }]}>{msg}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dialogScrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { borderRadius: 28, borderWidth: 1.5, padding: 24, gap: 14, alignItems: 'center', alignSelf: 'stretch', maxWidth: 440 },
  dialogIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '30%', flexGrow: 1, alignItems: 'center', gap: 8, paddingVertical: 14, borderRadius: 20, borderWidth: 1.5 },
  tileIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  tileText: { fontSize: 15, fontFamily: fonts.bold },
  check: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  pill: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  toast: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, fontSize: 15, fontFamily: fonts.semibold, overflow: 'hidden', maxWidth: '90%', textAlign: 'center' },
});
