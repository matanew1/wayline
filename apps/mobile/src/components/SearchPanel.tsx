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
import { colors } from '@/theme';
import { Icon } from './Icon';
import { ListRow } from './ui';

const DEBOUNCE_MS = 250;

export function SearchPanel() {
  const insets = useSafeAreaInsets();
  const { t, lang } = useT();
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
        const sp = await savePlace({ kind: savingKind, name: t(savingKind), address: p.address, lat: p.lat, lng: p.lng });
        set((s) => ({ saved: [...s.saved.filter((x) => x.kind !== savingKind), sp], savingKind: null, screen: 'home' }));
        toast(t('saved', { name: sp.name }));
      } catch (e) {
        toast(e instanceof Error ? e.message : t('couldNotSave'));
      }
      return;
    }
    void planTo(p);
  }

  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('back')} onPress={close} style={styles.back} hitSlop={8}>
          <Icon name="back" size={24} />
        </Pressable>
        <TextInput
          autoFocus
          value={q}
          onChangeText={setQ}
          placeholder={savingKind === 'home' ? t('searchHomePlaceholder') : savingKind === 'work' ? t('searchWorkPlaceholder') : t('searchPlaceholder')}
          placeholderTextColor={colors.muted}
          accessibilityLabel={t('searchLabel')}
          testID="search-input"
          returnKeyType="search"
          autoCorrect={false}
          style={styles.input}
        />
      </View>
      {active && loading ? <ActivityIndicator style={{ marginTop: 16 }} color={colors.primary} /> : null}
      {active && error ? <Text style={styles.empty}>{error}</Text> : null}
      {active && !loading && !error && results.length === 0 ? <Text style={styles.empty}>{t('noResults')}</Text> : null}
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }}
        renderItem={({ item, index }) => (
          <ListRow
            icon="pin" title={item.name} subtitle={item.address}
            right={item.distanceM != null ? formatDistance(item.distanceM, lang) : undefined}
            onPress={() => pick(item)}
            testID={`search-result-${index}`}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, textAlign: I18nManager.isRTL ? 'right' : 'left', height: 48, borderRadius: 12, borderWidth: 2, borderColor: colors.primary, paddingHorizontal: 14, fontSize: 16, color: colors.ink },
  empty: { textAlign: 'center', color: colors.muted, fontSize: 15, marginTop: 32 },
});
