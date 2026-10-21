import { useEffect, useRef } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { getAccessToken } from '@/api/auth';
import { savedPlaces } from '@/api/wayline';
import { HomePanel } from '@/components/HomePanel';
import { NavPanel } from '@/components/NavPanel';
import { ArrivedPanel, LocationDisclosure, ReportSheet, Toast } from '@/components/Overlays';
import { PreviewPanel } from '@/components/PreviewPanel';
import { SearchPanel } from '@/components/SearchPanel';
import { WaylineMap, type WaylineMapHandle } from '@/components/WaylineMap';
import { ensureForegroundPermission, watchIdle } from '@/location/location';
import { cancelPreview, connectRealtime, refreshNearby } from '@/nav/drive';
import { t } from '@/i18n';
import { get, pruneReports, set, toast, useApp } from '@/state/store';

/** Bootstraps session, location and the live report feed; screens are overlays on one map. */
function useBootstrap() {
  useEffect(() => {
    let stopWatch: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        await getAccessToken();
        connectRealtime();
        savedPlaces().then((saved) => set({ saved })).catch(() => undefined);
      } catch {
        toast(t('cantReach'));
      }
      const ok = await ensureForegroundPermission().catch(() => false);
      set({ locationDenied: !ok });
      if (!ok || cancelled) return;
      stopWatch = await watchIdle((fix) => {
        // while driving, the navigation source owns `position`
        if (get().screen === 'nav') return;
        set({ position: fix });
        void refreshNearby(fix);
      });
    })();

    const prune = setInterval(() => pruneReports(), 30_000);
    return () => {
      cancelled = true;
      stopWatch?.();
      clearInterval(prune);
    };
  }, []);
}

/** Android back button walks back through the overlays instead of closing the app. */
function useBackButton() {
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const s = get();
      if (s.reportSheetOpen) { set({ reportSheetOpen: false }); return true; }
      if (s.screen === 'search') { set({ screen: 'home', savingKind: null }); return true; }
      if (s.screen === 'preview') { cancelPreview(); return true; }
      return s.screen === 'nav'; // don't exit mid-drive by accident
    });
    return () => sub.remove();
  }, []);
}

export default function MapScreen() {
  const map = useRef<WaylineMapHandle>(null);
  const screen = useApp((s) => s.screen);
  useBootstrap();
  useBackButton();

  return (
    <View style={styles.root}>
      <WaylineMap ref={map} />
      {screen === 'home' ? <HomePanel onRecenter={() => map.current?.recenter()} /> : null}
      {screen === 'preview' ? <PreviewPanel /> : null}
      {screen === 'nav' ? <NavPanel /> : null}
      {screen === 'arrived' ? <ArrivedPanel /> : null}
      {screen === 'search' ? <SearchPanel /> : null}
      <ReportSheet />
      <LocationDisclosure />
      <Toast />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#E9EDF1' } });
