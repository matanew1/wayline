import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Place } from '@wayline/contracts';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type LanguagePref = 'system' | 'en' | 'he';
export type AlertType = 'police' | 'crash' | 'hazard' | 'closure' | 'camera' | 'traffic';

export interface Settings {
  language: LanguagePref;
  voice: boolean;
  avoidTolls: boolean;
  avoidHighways: boolean;
  spokenAlerts: Record<AlertType, boolean>;
  simulate: boolean;
  recents: Place[];
  /** Phone number shown in Settings after sign-in (the server only stores a hash). */
  phone: string | null;
  /** The background-location disclosure was shown and accepted. */
  bgDisclosureAccepted: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'system',
  voice: true,
  avoidTolls: false,
  avoidHighways: false,
  spokenAlerts: { police: true, crash: true, hazard: true, closure: true, camera: true, traffic: false },
  simulate: false,
  recents: [],
  phone: null,
  bgDisclosureAccepted: false,
};

/** Persisted per-device preferences. Secrets (tokens) live in SecureStore, not here. */
export const useSettings = create<Settings & { hydrated: boolean }>()(
  persist(() => ({ ...DEFAULT_SETTINGS, hydrated: false as boolean }), {
    name: 'wayline.settings.v1',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: ({ hydrated: _h, ...rest }) => rest,
    merge: (persisted, current) => {
      const p = (persisted ?? {}) as Partial<Settings>;
      return { ...current, ...p, spokenAlerts: { ...current.spokenAlerts, ...p.spokenAlerts } };
    },
    onRehydrateStorage: () => () => useSettings.setState({ hydrated: true }),
  }),
);

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  useSettings.setState({ [key]: value } as Partial<Settings>);
}
export const settings = () => useSettings.getState();

export function addRecent(p: Place) {
  useSettings.setState((s) => ({ recents: [p, ...s.recents.filter((r) => r.id !== p.id)].slice(0, 10) }));
}
