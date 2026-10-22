import Constants from 'expo-constants';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { currentUser } from '@/api/auth';
import { Icon } from '@/components/Icon';
import { Card, Chip, Segmented, SwitchRow, type } from '@/components/ui';
import { config } from '@/config';
import { applyLayoutDirection, useT, type StringKey } from '@/i18n';
import { setSetting, useSettings, type AlertType, type LanguagePref, type ThemePref, type Vehicle } from '@/state/settings';
import { toast } from '@/state/store';
import { elevation, useTheme } from '@/theme';

const ALERTS: AlertType[] = ['police', 'crash', 'hazard', 'closure', 'camera', 'traffic'];

function Section({ title, children }: { title: string; children: ReactNode }) {
  const c = useTheme();
  return (
    <Card style={{ gap: 12 }}>
      <Text style={type(c).h2} accessibilityRole="header">{title}</Text>
      {children}
    </Card>
  );
}

function Label({ children }: { children: string }) {
  const c = useTheme();
  return <Text style={[type(c).sub, { fontSize: 14 }]}>{children}</Text>;
}

export default function SettingsScreen() {
  const { t, lang } = useT();
  const c = useTheme();
  const T = type(c);
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
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button" accessibilityLabel={t('back')} onPress={() => router.back()} hitSlop={8}
            style={[styles.back, { backgroundColor: c.surface, borderColor: c.line }, elevation(c, 'sm')]}
          >
            <Icon name="back" size={22} color={c.ink} strokeWidth={2.6} />
          </Pressable>
          <Text style={[T.title, { fontSize: 26 }]} accessibilityRole="header">{t('settingsTitle')}</Text>
        </View>

        <Card style={{ paddingVertical: 6 }}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/account')} style={styles.row} testID="open-account">
            <View style={[styles.rowIcon, { backgroundColor: c.surface2 }]}><Icon name="user" color={c.primary} size={20} /></View>
            <Text style={[T.strong, { flex: 1 }]}>
              {user && !user.guest && s.phone ? t('signedInAs', { phone: s.phone }) : t('guestAccount')}
            </Text>
            <Icon name="chevron" color={c.muted} size={18} />
          </Pressable>
        </Card>

        <Section title={t('appearance')}>
          <Label>{t('theme')}</Label>
          <Segmented<ThemePref>
            label={t('theme')}
            testIDPrefix="theme"
            value={s.theme}
            onChange={(v) => setSetting('theme', v)}
            options={[{ value: 'auto', label: t('themeAuto') }, { value: 'light', label: t('themeLight') }, { value: 'dark', label: t('themeDark') }]}
          />
          <Label>{t('language')}</Label>
          <Segmented<LanguagePref>
            label={t('language')}
            testIDPrefix="language"
            value={s.language}
            onChange={(v) => void chooseLanguage(v)}
            options={[{ value: 'system', label: t('languageSystem') }, { value: 'en', label: t('english') }, { value: 'he', label: t('hebrew') }]}
          />
        </Section>

        <Section title={t('driving')}>
          <Label>{t('vehicle')}</Label>
          <Segmented<Vehicle>
            label={t('vehicle')}
            testIDPrefix="vehicle"
            value={s.vehicle}
            onChange={(v) => setSetting('vehicle', v)}
            options={[{ value: 'car', label: t('car') }, { value: 'motorcycle', label: t('motorcycle') }]}
          />
          <SwitchRow label={t('avoidTolls')} hint={t('avoidTollsHint')} value={s.avoidTolls} onChange={(v) => setSetting('avoidTolls', v)} />
          <SwitchRow label={t('avoidHighways')} hint={t('avoidHighwaysHint')} value={s.avoidHighways} onChange={(v) => setSetting('avoidHighways', v)} />
        </Section>

        <Section title={t('voiceAndAlerts')}>
          <SwitchRow label={t('voiceGuidance')} hint={t('voiceHint')} value={s.voice} onChange={(v) => setSetting('voice', v)} />
          <Label>{t('speakTheseAlerts')}</Label>
          <View style={styles.chips}>
            {ALERTS.map((a) => (
              <Chip
                key={a}
                label={t(`type.${a}` as StringKey)}
                on={s.spokenAlerts[a]}
                testID={`alert-${a}`}
                onPress={() => setSetting('spokenAlerts', { ...s.spokenAlerts, [a]: !s.spokenAlerts[a] })}
              />
            ))}
          </View>
        </Section>

        <Section title={t('privacy')}>
          <SwitchRow
            label={t('helpLiveTraffic')} hint={t('helpLiveTrafficHint')} value={s.shareTraffic}
            onChange={(v) => setSetting('shareTraffic', v)} testID="share-traffic"
          />
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`${config.apiUrl}/privacy?lang=${lang}`)} style={styles.row}>
            <Text style={[T.strong, { flex: 1 }]}>{t('privacyPolicy')}</Text>
            <Icon name="chevron" color={c.muted} size={18} />
          </Pressable>
        </Section>

        <Text style={[T.sub, { textAlign: 'center' }]}>{t('aboutLine', { v: Constants.expoConfig?.version ?? '—' })}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 16, width: '100%', maxWidth: 640, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  back: { width: 48, height: 48, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
