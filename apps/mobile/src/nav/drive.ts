import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
import type { Report, ReportType, RouteOption } from '@wayline/contracts';
import { cellsAround, formatDuration, haversineM, NavigationSession, type Fix, type LatLng } from '@wayline/navigation-core';
import { config, isDevBuild } from '@/config';
import { lang, speechLocale, t } from '@/i18n';
import { realtime } from '@/api/realtime';
import {
  ApiError, createReport, nearbyReports, planRoutes, sendProbes, startTrip, tripEta, updateTrip, voteReport,
} from '@/api/wayline';
import { startNavGps, startSimulated, type NavLocationSource } from '@/location/location';
import { setSetting, settings, type AlertType } from '@/state/settings';
import { get, removeReport, selectedRoute, set, toast, upsertReport, useApp, type Destination } from '@/state/store';

const KEEP_AWAKE_TAG = 'wayline-drive';

interface ActiveDrive {
  session: NavigationSession<Report>;
  tripId: string;
  source: NavLocationSource;
  unsubscribe: (() => void)[];
  finishing: boolean;
}

let drive: ActiveDrive | null = null;

function speak(text: string) {
  if (!settings().voice) return;
  Speech.speak(text, { language: speechLocale(), rate: 1.0 });
}

const msg = (e: unknown) => (e instanceof Error ? e.message : t('somethingWrong'));
const typeLabel = (type: string) => t(`type.${type}` as 'type.police');

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
    toast(t('waitingLocation'));
    return;
  }
  set({ destination: dest, planning: true, screen: 'preview', routes: [], selectedRouteId: null });
  try {
    const routes = await planRoutes(from, dest);
    set({ routes, selectedRouteId: routes[0]?.id ?? null });
  } catch (e) {
    set({ screen: 'home', destination: null });
    toast(e instanceof ApiError && e.status === 404 ? t('noRoute') : msg(e));
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
      toast(t('routeExpired'));
      await planTo(s.destination);
    } else toast(msg(e));
    return;
  }

  const session = new NavigationSession<Report>(route, destination, {
    now: () => Date.now(),
    language: lang(),
    speak: (text) => speak(text),
    alertText: (r) => (settings().spokenAlerts[r.type as AlertType] ? t(`say.${r.type}` as 'say.police') : null),
    offerText: (savingS) => t('say.fasterRoute', { d: formatDuration(savingS, lang()) }),
    sendProbes: (fixes) => sendProbes(trip.probeToken, fixes),
    checkEta: async (at) => {
      const res = await tripEta(trip.tripId, at);
      return { remainingS: res.remainingS, fasterRoute: res.fasterRoute, savingS: res.savingS };
    },
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
    source = settings().simulate && isDevBuild ? startSimulated(route.polyline6, onFix) : await startNavGps(onFix);
  } catch (e) {
    updateTrip(trip.tripId, { status: 'cancelled' }).catch(() => undefined);
    toast(t('locationUnavailable', { e: msg(e) }));
    return;
  }
  if (source.kind === 'gps-foreground') toast(t('allowAlways'));

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
        name: s.destination?.name ?? t('yourDestination'),
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

export function toggleVoice() {
  const voice = !settings().voice;
  if (!voice) Speech.stop().catch(() => undefined);
  setSetting('voice', voice);
  toast(voice ? t('voiceOn') : t('voiceMuted'));
}

export function acceptFasterRoute() {
  drive?.session.acceptOffer();
  toast(t('switchedRoute'));
}

export function declineFasterRoute() {
  drive?.session.declineOffer();
}

// ---------- community ----------

export async function report(type: ReportType) {
  set({ reportSheetOpen: false });
  const at = get().position ?? (isDevBuild ? { ...config.fallbackCenter, t: Date.now() } : null);
  if (!at) {
    toast(t('waitingLocation'));
    return;
  }
  try {
    const res = await createReport(type, at);
    upsertReport(res.report);
    toast(res.merged ? t('confirmed', { type: typeLabel(type) }) : t('reported', { type: typeLabel(type) }));
  } catch (e) {
    toast(e instanceof ApiError && e.status === 429 ? t('tooManyReports') : msg(e));
  }
}

export async function answerAlert(stillThere: boolean) {
  const alert = get().nav?.alert;
  if (!alert || !drive) return;
  drive.session.dismissAlert(alert.report.id);
  try {
    const res = await voteReport(alert.report.id, stillThere);
    if (res.status === 'expired') removeReport(alert.report.id);
    toast(stillThere ? t('thanksConfirm') : t('thanksUpdate'));
  } catch (e) {
    // 409 = already voted (e.g. you reported it yourself) — nothing to tell the driver
    if (!(e instanceof ApiError && e.status === 409)) toast(msg(e));
  }
}
