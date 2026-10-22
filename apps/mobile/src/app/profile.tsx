import type { RecentTrip } from '@wayline/contracts';
import { formatDistance } from '@wayline/navigation-core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { currentUser } from '@/api/auth';
import { me as fetchMe, recentTrips, savedPlaces, updateMe } from '@/api/wayline';
import { Icon } from '@/components/Icon';
import { Card, ListRow, PrimaryButton, type } from '@/components/ui';
import { useT, type StringKey } from '@/i18n';
import { planTo } from '@/nav/drive';
import { useSettings } from '@/state/settings';
import { set, toast, useApp } from '@/state/store';
import { elevation, fonts, useTheme } from '@/theme';

export default function ProfileScreen() {
  const { t, lang } = useT();
  const c = useTheme();
  const T = type(c);
  const insets = useSafeAreaInsets();
  const me = useApp((s) => s.me);
  const saved = useApp((s) => s.saved);
  const phone = useSettings((s) => s.phone);
  const [trips, setTrips] = useState<RecentTrip[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const guest = currentUser()?.guest ?? true;

  // refresh every time the screen opens (stats change after each drive)
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      fetchMe().then((m) => alive && set({ me: m })).catch(() => undefined);
      recentTrips(5).then((r) => alive && setTrips(r)).catch(() => alive && setTrips([]));
      savedPlaces().then((p) => alive && set({ saved: p })).catch(() => undefined);
      return () => { alive = false; };
    }, []),
  );

  async function saveName() {
    setBusy(true);
    try {
      const m = await updateMe(name.trim());
      set({ me: m });
      setEditing(false);
      toast(t('nameSaved'));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('somethingWrong'));
    } finally {
      setBusy(false);
    }
  }

  const home = saved.find((p) => p.kind === 'home');
  const work = saved.find((p) => p.kind === 'work');
  const favs = saved.filter((p) => p.kind === 'fav');
  const rep = me?.reputation;
  const levelKey = (l: string) => `level.${l}` as StringKey;
  const levelHint = !rep ? '' : !rep.next ? t('levelTop') : guest && rep.level === 'helper' ? t('levelGuestCap') : t('levelHint');

  const pickPlace = (kind: 'home' | 'work' | 'fav') => {
    set({ screen: 'search', savingKind: kind });
    router.back();
  };
  const driveTo = (p: { name: string; address?: string; lat: number; lng: number }) => {
    router.back();
    void planTo(p);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button" accessibilityLabel={t('backToMap')} onPress={() => router.back()} hitSlop={8} testID="profile-back"
            style={[styles.iconBtn, { backgroundColor: c.surface, borderColor: c.line }, elevation(c, 'sm')]}
          >
            <Icon name="back" size={22} color={c.ink} strokeWidth={2.6} />
          </Pressable>
          <Text style={[T.title, { flex: 1, fontSize: 26 }]} accessibilityRole="header">{t('profile')}</Text>
          <Pressable
            accessibilityRole="button" accessibilityLabel={t('settings')} onPress={() => router.push('/settings')} hitSlop={8}
            style={[styles.iconBtn, { backgroundColor: c.surface, borderColor: c.line }, elevation(c, 'sm')]}
          >
            <Icon name="settings" size={22} color={c.ink} />
          </Pressable>
        </View>

        {/* Identity */}
        <View style={[styles.hero, { backgroundColor: c.primary }, elevation(c)]} testID="profile-hero">
          <View style={styles.avatar}>
            <Text style={[styles.avatarText, { color: c.primary }]}>{(me?.nickname ?? '·').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            {editing ? (
              <>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  autoFocus
                  maxLength={24}
                  accessibilityLabel={t('nickname')}
                  testID="nickname-input"
                  placeholder={me?.nickname}
                  placeholderTextColor="rgba(255,255,255,0.6)"
                  selectionColor="#FFFFFF"
                  style={styles.nameInput}
                  onSubmitEditing={() => void saveName()}
                />
                <Text style={styles.heroSub}>{t('nickname')}</Text>
              </>
            ) : (
              <>
                <Text style={styles.heroName} numberOfLines={1}>{me?.nickname ?? ' '}</Text>
                <Text style={styles.heroSub}>{guest ? t('guestLine') : t('signedInAs', { phone: phone ?? '' })}</Text>
              </>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              {editing ? (
                busy ? <ActivityIndicator color="#FFFFFF" /> : (
                  <Pressable accessibilityRole="button" onPress={() => void saveName()} style={[styles.heroBtn, { backgroundColor: '#FFFFFF' }]} testID="nickname-save">
                    <Text style={[styles.heroBtnText, { color: c.primary }]}>{t('save')}</Text>
                  </Pressable>
                )
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => { setName(me?.nicknameIsDefault ? '' : me?.nickname ?? ''); setEditing(true); }}
                  style={styles.heroBtn}
                  testID="edit-name"
                >
                  <Icon name="edit" color="#FFFFFF" size={15} strokeWidth={2.4} />
                  <Text style={styles.heroBtnText}>{t('editName')}</Text>
                </Pressable>
              )}
              {editing && !busy ? (
                <Pressable accessibilityRole="button" onPress={() => setEditing(false)} style={styles.heroBtn}>
                  <Text style={styles.heroBtnText}>{t('cancel')}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>

        {/* Reputation */}
        <Card style={{ gap: 10 }}>
          <View style={styles.spread}>
            <Text style={T.caption}>{t('roadReputation')}</Text>
            {rep ? (
              <View style={[styles.levelPill, { backgroundColor: c.surface2 }]}>
                <Text style={[T.strong, { fontSize: 13 }]} testID="reputation-level">{t(levelKey(rep.level))}</Text>
              </View>
            ) : null}
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round((rep?.progress ?? 0) * 100) }}
            style={[styles.track, { backgroundColor: c.surface2, borderColor: c.line }]}
          >
            <View style={[styles.fill, { backgroundColor: c.primary, width: `${Math.round((rep?.progress ?? 0) * 100)}%` }]} />
          </View>
          <Text style={T.sub}>{rep?.next ? `${levelHint} → ${t(levelKey(rep.next))}` : levelHint}</Text>
        </Card>

        {/* Stats */}
        <View style={styles.stats}>
          {[
            { v: String(me?.stats.drives ?? 0), k: t('drives'), id: 'stat-drives' },
            { v: me ? formatDistance(me.stats.distanceM, lang).replace(/\s?(km|ק״מ|מ׳|m)$/, '') : '0', k: t('kmDriven'), id: 'stat-km' },
            { v: String(me?.stats.reports ?? 0), k: t('reports'), id: 'stat-reports' },
          ].map((s) => (
            <Card key={s.k} style={styles.stat} testID={s.id}>
              <Text style={[T.display, { fontSize: 28, textAlign: 'center' }]}>{s.v}</Text>
              <Text style={[T.sub, { textAlign: 'center' }]}>{s.k}</Text>
            </Card>
          ))}
        </View>

        {/* Saved places */}
        <Card style={{ paddingVertical: 10 }}>
          <Text style={[T.h2, { marginBottom: 4 }]}>{t('savedPlaces')}</Text>
          {[{ kind: 'home' as const, p: home, icon: 'home' as const }, { kind: 'work' as const, p: work, icon: 'work' as const }].map(({ kind, p, icon }) => (
            <ListRow
              key={kind}
              icon={icon}
              title={t(kind)}
              subtitle={p ? p.address ?? p.name : kind === 'home' ? t('setHome') : t('setWork')}
              onPress={p ? () => driveTo(p) : () => pickPlace(kind)}
              testID={`saved-${kind}`}
              action={
                <Pressable
                  accessibilityRole="button" accessibilityLabel={`${t(p ? 'edit' : 'setPlace')} · ${t(kind)}`} onPress={() => pickPlace(kind)}
                  style={[styles.smallBtn, { backgroundColor: c.surface2, borderColor: c.line }]}
                >
                  <Text style={[T.strong, { fontSize: 13 }]}>{p ? t('edit') : t('setPlace')}</Text>
                </Pressable>
              }
            />
          ))}
          {favs.map((p) => (
            <ListRow key={p.id} icon="pin" title={p.name} subtitle={p.address} onPress={() => driveTo(p)} />
          ))}
          <Pressable
            accessibilityRole="button" onPress={() => pickPlace('fav')} testID="add-favorite"
            style={[styles.dashed, { borderColor: c.muted }]}
          >
            <Icon name="plus" color={c.ink} size={18} strokeWidth={2.6} />
            <Text style={T.strong}>{t('addFavorite')}</Text>
          </Pressable>
        </Card>

        {/* Recent drives */}
        <Card style={{ paddingVertical: 10 }}>
          <Text style={[T.h2, { marginBottom: 4 }]}>{t('recentDrives')}</Text>
          {trips === null ? <ActivityIndicator color={c.primary} style={{ marginVertical: 12 }} /> : null}
          {trips?.length === 0 ? <Text style={T.sub}>{t('noDrives')}</Text> : null}
          {trips?.map((d) => (
            <ListRow
              key={d.id}
              icon="car"
              iconFg={c.sub}
              title={d.destinationName ? String(d.destinationName) : t('yourDestination')}
              subtitle={`${formatDistance(d.distanceM, lang)} · ${new Date(d.startedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short' })}`}
            />
          ))}
        </Card>

        {/* Account */}
        {guest ? (
          <Card style={{ gap: 10 }}>
            <Text style={T.h2}>{t('keepPlacesTitle')}</Text>
            <Text style={[T.body, { color: c.sub }]}>{t('keepPlacesBody')}</Text>
            <PrimaryButton title={t('signInWithPhone')} onPress={() => router.push('/account')} testID="profile-sign-in" />
          </Card>
        ) : (
          <PrimaryButton title={t('account')} tone="secondary" onPress={() => router.push('/account')} testID="profile-account" />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 16, width: '100%', maxWidth: 640, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  iconBtn: { width: 48, height: 48, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: 28, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 32, fontFamily: fonts.heavy },
  heroName: { color: '#FFFFFF', fontSize: 24, fontFamily: fonts.heavy, letterSpacing: -0.4, textAlign: 'left' },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontFamily: fonts.semibold, textAlign: 'left' },
  heroBtn: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1.5, borderColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroBtnText: { color: '#FFFFFF', fontSize: 13, fontFamily: fonts.heavy },
  nameInput: { color: '#FFFFFF', fontSize: 22, fontFamily: fonts.heavy, borderBottomWidth: 2, borderBottomColor: 'rgba(255,255,255,0.6)', paddingVertical: 4 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  levelPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  track: { height: 16, borderRadius: 8, borderWidth: 1.5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 8 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center', gap: 2 },
  smallBtn: { minHeight: 36, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dashed: { marginTop: 6, minHeight: 48, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
