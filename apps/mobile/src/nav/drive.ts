import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
import type { Report, ReportType, RouteOption } from '@wayline/contracts';
import { cellsAround, haversineM, NavigationSession, type Fix, type LatLng } from '@wayline/navigation-core';
import { config, isDevBuild } from '@/config';
import { realtime } from '@/api/realtime';
import { ApiError, createReport, nearbyReports, planRoutes, sendProbes, startTrip, updateTrip, voteReport } from '@/api/wayline';
import { startNavGps, startSimulated, type NavLocationSource } from '@/location/location';
import { get, removeReport, selectedRoute, set, toast, upsertReport, useApp, type Destination } from '@/state/store';
import { reportLabels } from '@/theme';

const KEEP_AWAKE_TAG = 'wayline-drive';
const SPEECH_LANG = config.language === 'he' ? 'he-IL' : 'en-US';

/** Spoken for these types only — the rest still show on the map. */
const SPOKEN_ALERTS: Partial<Record<ReportType, string>> = {
  police: 'Police reported ahead',
  crash: 'Crash reported ahead',
  hazard: 'Hazard reported ahead',
  closure: 'Road closed ahead',
  camera: 'Speed camera ahead',
};

interface ActiveDrive {
  session: NavigationSession<Report>;
  tripId: string;
  source: NavLocationSource;
  unsubscribe: (() => void)[];
  finishing: boolean;
}

let drive: ActiveDrive | null = null;

function speak(text: string) {
  if (get().muted) return;
  Speech.speak(text, { language: SPEECH_LANG, rate: 1.0 });
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

/** Where planning starts: GPS, or the fallback centre in dev builds (emulators without a GPS fix). */
function origin(): LatLng | null {
  const p = get().position;
  if (p) return p;
  return isDevBuild ? config.fallbackCenter : null;
}

// ---------- reports near the driver (when not navigating) ----------

let lastNearbyAt: LatLng | null = null;

export async function refreshNearby(p: LatLng, force = false) {
  if (!force && lastNearbyAt && haversineM(lastNearbyAt, p) < 1000) return;
  lastNearbyAt = p;
  if (!drive) realtime.setCells(cellsAround(p, 2));
  try {
    for (const r of await nearbyReports(p)) upsertReport(r);
  } catch {
    /* offline — the realtime feed will catch up */
  }
}

export function connectRealtime() {
  realtime.connect({ upsert: upsertReport, remove: removeReport });
}

// ---------- planning ----------

export async function planTo(dest: Destination) {
  const from = origin();
  if (!from) {
    toast('Waiting for your location…');
    return;
  }
  set({ destination: dest, planning: true, screen: 'preview', routes: [], selectedRouteId: null });
  try {
    const routes = await planRoutes(from, dest);
    set({ routes, selectedRouteId: routes[0]?.id ?? null });
  } catch (e) {
    set({ screen: 'home', destination: null });
    toast(e instanceof ApiError && e.status === 404 ? 'No route found to this place' : msg(e));
  } finally {
    set({ planning: false });
  }
}

export function cancelPreview() {
  set({ screen: 'home', destination: null, routes: [], selectedRouteId: null });
}

// ---------- driving ----------

export async function startDrive() {
  const s = get();
  const route = selectedRoute(s);
  if (!route || !s.destination || drive) return;
  const destination = { lat: s.destination.lat, lng: s.destination.lng };

  let trip;
  try {
    trip = await startTrip(route.id);
  } catch (e) {
    // routes are cached server-side for 30 min; re-plan if they expired
    if (e instanceof ApiError && e.status === 404) {
      toast('Route expired — updating');
      await planTo(s.destination);
    } else toast(msg(e));
    return;
  }

  const session = new NavigationSession<Report>(route, destination, {
    now: () => Date.now(),
    language: config.language,
    speak: (text) => speak(text),
    alertText: (r) => SPOKEN_ALERTS[r.type] ?? null,
    sendProbes: (fixes) => sendProbes(trip.probeToken, fixes),
    requestReroute: async (from) => {
      const [best] = await planRoutes(from, destination);
      return best ?? null;
    },
    onRouteChanged: (r) => {
      const next = r as RouteOption;
      realtime.setCells(next.cells);
      drive?.source.followRoute?.(next.polyline6);
      updateTrip(trip.tripId, { routeId: next.id }).catch(() => undefined);
    },
  });

  const onFix = (fix: Fix) => {
    set({ position: fix });
    void session.onFix(fix);
  };

  let source: NavLocationSource;
  try {
    source = s.simulate ? startSimulated(route.polyline6, onFix) : await startNavGps(onFix);
  } catch (e) {
    updateTrip(trip.tripId, { status: 'cancelled' }).catch(() => undefined);
    toast(`Location unavailable: ${msg(e)}`);
    return;
  }
  if (source.kind === 'gps-foreground') toast('Guidance pauses if you leave the app — allow location "Always" in Settings');

  const unsubscribe: (() => void)[] = [];
  unsubscribe.push(session.subscribe((snap) => {
    set({ nav: snap });
    if (snap.phase === 'arrived') void finish('arrived');
  }));
  // keep the session's report list in sync with the store
  session.setReports(Object.values(get().reports));
  unsubscribe.push(useApp.subscribe((st, prev) => {
    if (st.reports !== prev.reports) session.setReports(Object.values(st.reports));
  }));

  drive = { session, tripId: trip.tripId, source, unsubscribe, finishing: false };
  realtime.setCells(route.cells);
  await activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
  set({ screen: 'nav', arrival: null });
  session.start();
}

async function finish(how: 'arrived' | 'cancelled') {
  const d = drive;
  if (!d || d.finishing) return;
  d.finishing = true;
  const s = get();
  const route = s.nav?.route ?? selectedRoute(s);
  d.unsubscribe.forEach((u) => u());
  await d.source.stop().catch(() => undefined);
  await d.session.end();
  deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
  updateTrip(d.tripId, { status: how === 'arrived' ? 'finished' : 'cancelled' }).catch(() => undefined);
  drive = null;
  lastNearbyAt = null;

  if (how === 'arrived') {
    set({
      screen: 'arrived',
      arrival: {
        name: s.destination?.name ?? 'your destination',
        distanceM: route?.distanceM ?? 0,
        durationS: route?.durationS ?? 0,
        arrivedAt: Date.now(),
      },
    });
  } else {
    Speech.stop().catch(() => undefined);
    set({ screen: 'home', nav: null, destination: null, routes: [], selectedRouteId: null });
  }
  const p = get().position;
  if (p) void refreshNearby(p, true);
}

export const endDrive = () => finish('cancelled');

export function closeArrival() {
  set({ screen: 'home', nav: null, arrival: null, destination: null, routes: [], selectedRouteId: null });
}

export function toggleMute() {
  const muted = !get().muted;
  if (muted) Speech.stop().catch(() => undefined);
  set({ muted });
  toast(muted ? 'Voice guidance muted' : 'Voice guidance on');
}

// ---------- community ----------

export async function report(type: ReportType) {
  set({ reportSheetOpen: false });
  const at = get().position ?? (isDevBuild ? { ...config.fallbackCenter, t: Date.now() } : null);
  if (!at) {
    toast('Waiting for your location…');
    return;
  }
  try {
    const res = await createReport(type, at);
    upsertReport(res.report);
    toast(res.merged ? `${reportLabels[type]} confirmed — thanks!` : `${reportLabels[type]} reported — thanks!`);
  } catch (e) {
    toast(e instanceof ApiError && e.status === 429 ? 'You’ve reported a lot recently — try again later' : msg(e));
  }
}

export async function answerAlert(stillThere: boolean) {
  const alert = get().nav?.alert;
  if (!alert || !drive) return;
  drive.session.dismissAlert(alert.report.id);
  try {
    const res = await voteReport(alert.report.id, stillThere);
    if (res.status === 'expired') removeReport(alert.report.id);
    toast(stillThere ? 'Thanks for confirming' : 'Thanks — we’ll update the map');
  } catch (e) {
    // 409 = already voted (e.g. you reported it yourself) — nothing to tell the driver
    if (!(e instanceof ApiError && e.status === 409)) toast(msg(e));
  }
}
