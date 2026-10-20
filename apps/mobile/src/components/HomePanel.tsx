import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { planTo } from '@/nav/drive';
import { set, useApp } from '@/state/store';
import { colors, shadow } from '@/theme';
import { Icon } from './Icon';
import { ListRow, RoundButton, Sheet } from './ui';

export function HomePanel({ onRecenter }: { onRecenter: () => void }) {
  const recents = useApp((s) => s.recents);
  const saved = useApp((s) => s.saved);
  const denied = useApp((s) => s.locationDenied);
  const insets = useSafeAreaInsets();
  const home = saved.find((p) => p.kind === 'home');
  const work = saved.find((p) => p.kind === 'work');

  return (
    <>
      {denied ? (
        <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()} style={[styles.banner, { top: insets.top + 12 }]}>
          <Text style={styles.bannerTitle}>Location is off</Text>
          <Text style={styles.bannerBody}>Wayline needs your location to navigate. Tap to open Settings.</Text>
        </Pressable>
      ) : null}

      <View style={styles.fabs} pointerEvents="box-none">
        <RoundButton icon="recenter" label="Recenter map" onPress={onRecenter} />
        <RoundButton icon="alert" label="Report a hazard" size={60} bg={colors.report} fg="#FFFFFF" onPress={() => set({ reportSheetOpen: true })} />
      </View>

      <Sheet>
        <Pressable accessibilityRole="search" accessibilityLabel="Where to?" onPress={() => set({ screen: 'search' })} style={styles.search}>
          <Icon name="search" />
          <Text style={styles.searchText}>Where to?</Text>
        </Pressable>
        <View>
          <ListRow
            icon="home" iconBg={colors.primarySoft} iconFg={colors.primaryDark} title="Home"
            subtitle={home?.address ?? (home ? undefined : 'Set your home address')}
            onPress={() => (home ? planTo(home) : set({ screen: 'search', savingKind: 'home' }))}
          />
          <ListRow
            icon="work" iconBg={colors.primarySoft} iconFg={colors.primaryDark} title="Work"
            subtitle={work?.address ?? (work ? undefined : 'Set your work address')}
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
  fabs: { position: 'absolute', left: 16, right: 16, bottom: 340, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  search: { height: 52, borderRadius: 14, backgroundColor: colors.surfaceAlt, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  searchText: { fontSize: 17, fontWeight: '600', color: colors.sub },
  banner: { position: 'absolute', left: 12, right: 12, backgroundColor: colors.ink, borderRadius: 16, padding: 14, gap: 2, ...shadow },
  bannerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  bannerBody: { color: '#CBD5E1', fontSize: 14 },
});
