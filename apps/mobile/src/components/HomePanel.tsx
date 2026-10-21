import { router } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/i18n';
import { planTo } from '@/nav/drive';
import { useSettings } from '@/state/settings';
import { set, useApp } from '@/state/store';
import { colors, shadow } from '@/theme';
import { Icon } from './Icon';
import { ListRow, RoundButton, Sheet } from './ui';

export function HomePanel({ onRecenter }: { onRecenter: () => void }) {
  const { t } = useT();
  const recents = useSettings((s) => s.recents);
  const saved = useApp((s) => s.saved);
  const denied = useApp((s) => s.locationDenied);
  const insets = useSafeAreaInsets();
  const home = saved.find((p) => p.kind === 'home');
  const work = saved.find((p) => p.kind === 'work');

  return (
    <>
      <View style={[styles.top, { top: insets.top + 12 }]} pointerEvents="box-none">
        {denied ? (
          <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()} style={styles.banner}>
            <Text style={styles.bannerTitle}>{t('locationOffTitle')}</Text>
            <Text style={styles.bannerBody}>{t('locationOffBody')}</Text>
          </Pressable>
        ) : <View style={{ flex: 1 }} />}
        <RoundButton icon="settings" testID="open-settings" label={t('settings')} onPress={() => router.push('/settings')} />
      </View>

      <View style={styles.fabs} pointerEvents="box-none">
        <RoundButton icon="recenter" label={t('recenter')} onPress={onRecenter} />
        <RoundButton icon="alert" testID="report-open" label={t('reportHazard')} size={60} bg={colors.report} fg="#FFFFFF" onPress={() => set({ reportSheetOpen: true })} />
      </View>

      <Sheet>
        <Pressable accessibilityRole="search" testID="where-to" accessibilityLabel={t('whereTo')} onPress={() => set({ screen: 'search' })} style={styles.search}>
          <Icon name="search" />
          <Text style={styles.searchText}>{t('whereTo')}</Text>
        </Pressable>
        <View>
          <ListRow
            icon="home" iconBg={colors.primarySoft} iconFg={colors.primaryDark} title={t('home')} testID="home-row"
            subtitle={home ? home.address : t('setHome')}
            onPress={() => (home ? planTo(home) : set({ screen: 'search', savingKind: 'home' }))}
          />
          <ListRow
            icon="work" iconBg={colors.primarySoft} iconFg={colors.primaryDark} title={t('work')} testID="work-row"
            subtitle={work ? work.address : t('setWork')}
            onPress={() => (work ? planTo(work) : set({ screen: 'search', savingKind: 'work' }))}
          />
          {recents.slice(0, 2).map((p) => (
            <ListRow key={p.id} icon="clock" title={p.name} subtitle={p.address} onPress={() => planTo(p)} />
          ))}
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  fabs: { position: 'absolute', left: 16, right: 16, bottom: 340, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  search: { height: 52, borderRadius: 14, backgroundColor: colors.surfaceAlt, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  searchText: { fontSize: 17, fontWeight: '600', color: colors.sub },
  banner: { flex: 1, backgroundColor: colors.ink, borderRadius: 16, padding: 14, gap: 2, ...shadow },
  bannerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', textAlign: 'left' },
  bannerBody: { color: '#CBD5E1', fontSize: 14, textAlign: 'left' },
});
