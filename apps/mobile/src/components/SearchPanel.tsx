import type { Place } from '@wayline/contracts';
import { formatDistance } from '@wayline/navigation-core';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, I18nManager, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { savePlace, searchPlaces } from '@/api/wayline';
import { config } from '@/config';
import { useT } from '@/i18n';
import { addRecent } from '@/state/settings';
import { planTo } from '@/nav/drive';
import { get, set, toast, useApp } from '@/state/store';
import { fonts, useTheme } from '@/theme';
import { Icon } from './Icon';
import { type } from './ui';

const DEBOUNCE_MS = 250;

export function SearchPanel() {
  const insets = useSafeAreaInsets();
  const { t, lang } = useT();
  const c = useTheme();
  const T = type(c);
  const savingKind = useApp((s) => s.savingKind);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (!query) return;
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const near = get().position ?? config.fallbackCenter;
        const r = await searchPlaces(query, near);
        if (id === seq.current) { setResults(r); setError(null); }
      } catch (e) {
        if (id === seq.current) setError(e instanceof Error ? e.message : t('searchFailed'));
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, t]);

  const active = q.trim().length > 0;
  const shown = active ? results : [];

  const close = () => set({ screen: 'home', savingKind: null });

  async function pick(p: Place) {
    addRecent(p);
    if (savingKind) {
      try {
        const name = savingKind === 'fav' ? p.name : t(savingKind);
        const sp = await savePlace({ kind: savingKind, name, address: p.address, lat: p.lat, lng: p.lng });
        // Home and Work are one each; favourites add up
        set((s) => ({ saved: [...s.saved.filter((x) => savingKind === 'fav' || x.kind !== savingKind), sp], savingKind: null, screen: 'home' }));
        toast(t('saved', { name: sp.name }));
      } catch (e) {
        toast(e instanceof Error ? e.message : t('couldNotSave'));
      }
      return;
    }
    void planTo(p);
  }

  const placeholder = savingKind === 'home' ? t('searchHomePlaceholder') : savingKind === 'work' ? t('searchWorkPlaceholder') : t('searchPlaceholder');

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: c.page, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button" accessibilityLabel={t('back')} onPress={close} hitSlop={8}
          style={[styles.back, { backgroundColor: c.surface, borderColor: c.line }]}
        >
          <Icon name="back" size={22} color={c.ink} strokeWidth={2.6} />
        </Pressable>
        <TextInput
          autoFocus
          value={q}
          onChangeText={setQ}
          placeholder={placeholder}
          placeholderTextColor={c.muted}
          accessibilityLabel={t('searchLabel')}
          testID="search-input"
          returnKeyType="search"
          autoCorrect={false}
          selectionColor={c.primary}
          style={[styles.input, { backgroundColor: c.surface, borderColor: c.primary, color: c.ink, textAlign: I18nManager.isRTL ? 'right' : 'left' }]}
        />
      </View>
      {active && loading ? <ActivityIndicator style={{ marginTop: 16 }} color={c.primary} /> : null}
      {active && error ? <Text style={[T.body, styles.empty, { color: c.sub }]}>{error}</Text> : null}
      {active && !loading && !error && results.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={[T.h2, { textAlign: 'center' }]}>{t('noResults')}</Text>
        </View>
      ) : null}
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20, gap: 10 }}
        renderItem={({ item, index }) => (
          <Pressable
            accessibilityRole="button"
            testID={`search-result-${index}`}
            onPress={() => void pick(item)}
            style={({ pressed }) => [styles.result, { backgroundColor: c.surface, borderColor: c.line }, pressed && { opacity: 0.8 }]}
          >
            <View style={[styles.resultIcon, { backgroundColor: c.surface2 }]}><Icon name="pin" color={c.primary} size={20} strokeWidth={2.4} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={T.strong} numberOfLines={1}>{item.name}</Text>
              {item.address ? <Text style={T.sub} numberOfLines={1}>{item.address}</Text> : null}
            </View>
            {item.distanceM != null ? <Text style={T.sub}>{formatDistance(item.distanceM, lang)}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  back: { width: 48, height: 48, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minWidth: 0, height: 52, borderRadius: 18, borderWidth: 2, paddingHorizontal: 16, fontSize: 16, fontFamily: fonts.semibold },
  empty: { textAlign: 'center', marginTop: 32, paddingHorizontal: 24 },
  emptyBox: { paddingVertical: 40, paddingHorizontal: 24, alignItems: 'center', gap: 6 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20, borderWidth: 1.5, minHeight: 64 },
  resultIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
