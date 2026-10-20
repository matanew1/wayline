import { create } from 'zustand';
import type { Report, RouteOption, SavedPlace } from '@wayline/contracts';
import type { Fix, SessionSnapshot } from '@wayline/navigation-core';

export type Screen = 'home' | 'search' | 'preview' | 'nav' | 'arrived';

export interface Destination {
  name: string;
  address?: string;
  lat: number;
  lng: number;
}

export interface Arrival {
  name: string;
  distanceM: number;
  durationS: number;
  arrivedAt: number;
}

export interface AppState {
  screen: Screen;
  position: Fix | null;
  locationDenied: boolean;
  destination: Destination | null;
  routes: RouteOption[];
  selectedRouteId: string | null;
  planning: boolean;
  nav: SessionSnapshot<Report> | null;
  arrival: Arrival | null;
  reports: Record<string, Report>;
  reportSheetOpen: boolean;
  toast: string | null;
  saved: SavedPlace[];
  /** Set when search is used to pick a Home/Work address. */
  savingKind: 'home' | 'work' | null;
}

export const useApp = create<AppState>(() => ({
  screen: 'home',
  position: null,
  locationDenied: false,
  destination: null,
  routes: [],
  selectedRouteId: null,
  planning: false,
  nav: null,
  arrival: null,
  reports: {},
  reportSheetOpen: false,
  toast: null,
  saved: [],
  savingKind: null,
}));

export const set = useApp.setState;
export const get = useApp.getState;

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(message: string, ms = 2400) {
  clearTimeout(toastTimer);
  set({ toast: message });
  toastTimer = setTimeout(() => set({ toast: null }), ms);
}

export function upsertReport(r: Report) {
  set((s) => ({ reports: { ...s.reports, [r.id]: r } }));
}

export function removeReport(id: string) {
  set((s) => {
    if (!s.reports[id]) return s;
    const { [id]: _gone, ...rest } = s.reports;
    return { reports: rest };
  });
}

/** Drop reports whose expiry has passed (the server also pushes removals). */
export function pruneReports(now = Date.now()) {
  set((s) => {
    const live = Object.values(s.reports).filter((r) => Date.parse(r.expiresAt) > now);
    return live.length === Object.keys(s.reports).length ? s : { reports: Object.fromEntries(live.map((r) => [r.id, r])) };
  });
}

export const selectedRoute = (s: AppState) => s.routes.find((r) => r.id === s.selectedRouteId) ?? null;
