import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { config } from '@/config';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { currentUser } from '@/api/auth';
import { Icon } from '@/components/Icon';
import { applyLayoutDirection, useT, type StringKey } from '@/i18n';
import { setSetting, useSettings, type AlertType, type LanguagePref } from '@/state/settings';
import { toast } from '@/state/store';
import { colors } from '@/theme';

const LANGS: { value: LanguagePref; key: StringKey }[] = [
  { value: 'system', key: 'languageSystem' },
  { value: 'he', key: 'hebrew' },
  { value: 'en', key: 'english' },
];
const ALERTS: AlertType[] = ['police', 'camera', 'crash', 'hazard', 'closure', 'traffic'];

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.group}>{children}</View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowText}>{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

export default function SettingsScreen() {
  const { t, lang } = useT();
  const insets = useSafeAreaInsets();
  const s = useSettings();
  const user = currentUser();

  async function chooseLanguage(value: LanguagePref) {
    if (value === s.language) return;
    setSetting('language', value);
    // give persistence a tick to write before a possible restart
    await new Promise((r) => setTimeout(r, 150));
    const willRestart = await applyLayoutDirection();
    if (willRestart) toast(t('restartForLanguage'));
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surfaceSoft }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('back')} onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Icon name="back" size={24} />
        </Pressable>
        <Text style={styles.title}>{t('settingsTitle')}</Text>
      </View>

      <Section title={t('account')}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/account')} style={styles.row} testID="open-account">
          <Icon name="user" color={colors.primaryDark} />
          <Text style={[styles.rowText, { flex: 1 }]}>
            {user && !user.guest && s.phone ? t('signedInAs', { phone: s.phone }) : t('guestAccount')}
          </Text>
          <Icon name="chevron" color={colors.muted} size={18} />
        </Pressable>
      </Section>

      <Section title={t('language')}>
        {LANGS.map((l) => (
          <Pressable
            key={l.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: s.language === l.value }}
            onPress={() => void chooseLanguage(l.value)}
            testID={`language-${l.value}`}
            style={styles.row}
          >
            <Text style={[styles.rowText, { flex: 1 }]}>{t(l.key)}</Text>
            {s.language === l.value ? <Icon name="check" color={colors.primary} /> : null}
          </Pressable>
        ))}
      </Section>

      <Section title={t('routeOptions')}>
        <ToggleRow label={t('voiceGuidance')} value={s.voice} onChange={(v) => setSetting('voice', v)} />
        <ToggleRow label={t('avoidTolls')} value={s.avoidTolls} onChange={(v) => setSetting('avoidTolls', v)} />
        <ToggleRow label={t('avoidHighways')} value={s.avoidHighways} onChange={(v) => setSetting('avoidHighways', v)} />
      </Section>

      <Section title={t('spokenAlerts')} hint={t('spokenAlertsHint')}>
        {ALERTS.map((a) => (
          <ToggleRow
            key={a}
            label={t(`type.${a}` as StringKey)}
            value={s.spokenAlerts[a]}
            onChange={(v) => setSetting('spokenAlerts', { ...s.spokenAlerts, [a]: v })}
          />
        ))}
      </Section>

      <Section title={t('privacy')}>
        <Text style={[styles.rowText, styles.para]}>{t('privacyBody')}</Text>
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`${config.apiUrl}/privacy?lang=${lang}`)} style={styles.row}>
          <Text style={[styles.rowText, { flex: 1, color: colors.primary }]}>{t('privacyPolicy')}</Text>
          <Icon name="chevron" color={colors.muted} size={18} />
        </Pressable>
      </Section>

      <Text style={styles.version}>{t('version', { v: Constants.expoConfig?.version ?? '—' })}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, marginBottom: 8 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink },
  section: { marginTop: 18, paddingHorizontal: 16, gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left' },
  group: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowText: { fontSize: 16, color: colors.ink, textAlign: 'left' },
  para: { padding: 16, lineHeight: 22, color: colors.sub },
  hint: { fontSize: 13, color: colors.muted, paddingHorizontal: 4, textAlign: 'left' },
  version: { textAlign: 'center', color: colors.muted, fontSize: 13, marginTop: 24 },
});
