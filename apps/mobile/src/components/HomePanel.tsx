import { router } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/i18n';
import { planTo } from '@/nav/drive';
import { useSettings } from '@/state/settings';
import { set, toast, useApp } from '@/state/store';
import { elevation, fonts, useLayout, useTheme } from '@/theme';
import { Icon } from './Icon';
import { ListRow, RoundButton, Sheet, type } from './ui';

export function HomePanel({ onRecenter }: { onRecenter: () => void }) {
  const { t } = useT();
  const c = useTheme();
  const T = type(c);
  const { wide, panelWidth } = useLayout();
  const recents = useSettings((s) => s.recents);
  const saved = useApp((s) => s.saved);
  const denied = useApp((s) => s.locationDenied);
  const nearby = useApp((s) => Object.keys(s.reports).length);
  const nickname = useApp((s) => s.me?.nickname ?? null);
  const insets = useSafeAreaInsets();
  const home = saved.find((p) => p.kind === 'home');
  const work = saved.find((p) => p.kind === 'work');
  const nearbyText = nearby === 0 ? t('noReportsNearby') : nearby === 1 ? t('reportNearby') : t('reportsNearby', { n: nearby });
  // on wide screens the panel sits on the left, so map controls go to the right edge
  const leftEdge = wide ? panelWidth + 32 : 16;

  return (
    <>
      <View style={[styles.top, { top: insets.top + 12, left: leftEdge }]} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('openProfile')}
          testID="open-profile"
          onPress={() => router.push('/profile')}
          style={[styles.avatar, { backgroundColor: c.primary, borderColor: c.surface }, elevation(c)]}
        >
          {nickname ? <Text style={styles.avatarText}>{nickname.charAt(0).toUpperCase()}</Text> : <Icon name="user" color="#FFFFFF" size={24} />}
        </Pressable>
        {denied ? (
          <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()} style={[styles.banner, { backgroundColor: c.ink }]}>
            <Text style={[T.strong, { color: c.page }]}>{t('locationOffTitle')}</Text>
            <Text style={[T.sub, { color: c.page, opacity: 0.85 }]}>{t('locationOffBody')}</Text>
          </Pressable>
        ) : (
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => toast(nearbyText)}
              style={[styles.nearby, { backgroundColor: c.surface, borderColor: c.line }, elevation(c, 'sm')]}
            >
              <Icon name="alert" color={nearby ? c.dangerInk : c.sub} size={16} strokeWidth={2.4} />
              <Text style={[T.strong, { fontSize: 14 }]}>{nearbyText}</Text>
            </Pressable>
          </View>
        )}
        <RoundButton icon="settings" testID="open-settings" label={t('settings')} onPress={() => router.push('/settings')} />
      </View>

      <View style={[styles.fabs, wide ? { right: 16, bottom: Math.max(24, insets.bottom + 16), left: undefined, flexDirection: 'column', gap: 14 } : null]} pointerEvents="box-none">
        <RoundButton icon="recenter" label={t('recenter')} onPress={onRecenter} />
        <RoundButton icon="plus" testID="report-open" label={t('reportHazard')} size={64} bg={c.danger} fg="#FFFFFF" onPress={() => set({ reportSheetOpen: true })} />
      </View>

      <Sheet>
        <Pressable
          accessibilityRole="search"
          testID="where-to"
          accessibilityLabel={t('whereTo')}
          onPress={() => set({ screen: 'search' })}
          style={[styles.search, { backgroundColor: c.surface2, borderColor: c.line }]}
        >
          <Icon name="search" color={c.ink} size={24} strokeWidth={2.5} />
          <Text style={[T.title, { flex: 1, fontSize: 20 }]}>{t('whereTo')}</Text>
        </Pressable>
        <View style={styles.tiles}>
          <Pressable
            accessibilityRole="button"
            testID="home-row"
            onPress={() => (home ? planTo(home) : set({ screen: 'search', savingKind: 'home' }))}
            style={[styles.tile, { backgroundColor: c.surface, borderColor: c.line }]}
          >
            <View style={[styles.tileIcon, { backgroundColor: c.surface2 }]}><Icon name="home" color={c.primary} size={20} strokeWidth={2.4} /></View>
            <Text style={T.h2}>{t('home')}</Text>
            <Text style={T.sub} numberOfLines={1}>{home ? home.address ?? home.name : t('setHome')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            testID="work-row"
            onPress={() => (work ? planTo(work) : set({ screen: 'search', savingKind: 'work' }))}
            style={[styles.tile, { backgroundColor: c.surface, borderColor: c.line }]}
          >
            <View style={[styles.tileIcon, { backgroundColor: c.surface2 }]}><Icon name="work" color={c.primary} size={20} strokeWidth={2.4} /></View>
            <Text style={T.h2}>{t('work')}</Text>
            <Text style={T.sub} numberOfLines={1}>{work ? work.address ?? work.name : t('setWork')}</Text>
          </Pressable>
        </View>
        {recents.length ? (
          <View>
            <Text style={T.caption}>{t('recent')}</Text>
            {recents.slice(0, 2).map((p) => (
              <ListRow key={p.id} icon="clock" iconFg={c.sub} title={p.name} subtitle={p.address} onPress={() => planTo(p)} />
            ))}
          </View>
        ) : null}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 21, fontFamily: fonts.heavy },
  nearby: { minHeight: 40, borderRadius: 20, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  fabs: { position: 'absolute', left: 16, right: 16, bottom: 372, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  search: { height: 60, borderRadius: 20, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18 },
  banner: { flex: 1, borderRadius: 16, padding: 12, gap: 2 },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, minWidth: 0, borderRadius: 20, borderWidth: 1.5, padding: 12, gap: 4 },
  tileIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});
