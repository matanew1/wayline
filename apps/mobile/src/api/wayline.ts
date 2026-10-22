import { createWaylineClient, type Departure, type Me, type Place, type RecentTrip, type Report, type ReportType, type RouteOption, type SavedPlace, type TripShare } from '@wayline/contracts';
import type { Fix, LatLng, SendResult } from '@wayline/navigation-core';
import { config } from '@/config';
import { lang } from '@/i18n';
import { settings } from '@/state/settings';
import { getAccessToken } from './auth';

export const api = createWaylineClient(config.apiUrl, getAccessToken);

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Unwraps openapi-fetch results: data or a readable ApiError. */
async function call<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  let res;
  try {
    res = await p;
  } catch {
    throw new ApiError(0, 'No connection to Wayline');
  }
  if (res.data !== undefined) return res.data;
  const msg = (res.error as { message?: string | string[] } | undefined)?.message;
  throw new ApiError(res.response.status, Array.isArray(msg) ? msg.join(', ') : msg ?? `Request failed (${res.response.status})`);
}

export const searchPlaces = (q: string, near?: LatLng) =>
  call<Place[]>(api.GET('/v1/places/search', { params: { query: { q, lat: near?.lat, lng: near?.lng, lang: lang() } } }));

/** 204 No Content on success — no body, so not routed through `call`. */
export async function deleteAccount(): Promise<void> {
  let res;
  try {
    res = await api.DELETE('/v1/me');
  } catch {
    throw new ApiError(0, 'No connection to Wayline');
  }
  if (!res.response.ok) throw new ApiError(res.response.status, `Request failed (${res.response.status})`);
}

export const savedPlaces = () => call<SavedPlace[]>(api.GET('/v1/me/places'));

export const savePlace = (body: { kind: 'home' | 'work' | 'fav'; name: string; address?: string; lat: number; lng: number }) =>
  call<SavedPlace>(api.PUT('/v1/me/places', { body }));

/** The API rejects unknown fields, so strip Fix/Place objects down to coordinates. */
const pt = (p: LatLng): LatLng => ({ lat: p.lat, lng: p.lng });

export function planRoutes(origin: LatLng, destination: LatLng) {
  const s = settings();
  const avoid = [...(s.avoidTolls ? ['tolls' as const] : []), ...(s.avoidHighways ? ['highways' as const] : [])];
  return call<RouteOption[]>(api.POST('/v1/routes', {
    body: { origin: pt(origin), destination: pt(destination), language: lang(), avoid, vehicle: s.vehicle },
  }));
}

/** Drive time if leaving now / later: live traffic now, usual traffic for that hour later. */
export const departures = (routeId: string, offsetsMin: number[] = [0, 15, 30]) =>
  call<Departure[]>(api.GET('/v1/routes/{id}/departures', { params: { path: { id: routeId }, query: { offsets: offsetsMin.join(',') } } }));

/** Live ETA for the trip + a faster route when traffic makes one worthwhile. */
export const tripEta = (tripId: string, at: LatLng) =>
  call(api.POST('/v1/trips/{id}/eta', { params: { path: { id: tripId } }, body: pt(at) }));

export const startTrip = (routeId: string, destinationName?: string) =>
  call(api.POST('/v1/trips', { body: { routeId, destinationName: destinationName?.slice(0, 120) } }));

/** Public live-ETA link for this trip (arrival time only, never the location). */
export const shareTrip = (tripId: string, remainingS?: number) =>
  call<TripShare>(api.POST('/v1/trips/{id}/share', { params: { path: { id: tripId } }, body: { remainingS } }));

export async function stopSharingTrip(tripId: string): Promise<void> {
  try {
    await api.DELETE('/v1/trips/{id}/share', { params: { path: { id: tripId } } });
  } catch {
    // the link expires on its own; nothing to do offline
  }
}

export const me = () => call<Me>(api.GET('/v1/me'));
export const updateMe = (nickname: string) => call<Me>(api.PATCH('/v1/me', { body: { nickname } }));
export const recentTrips = (limit = 5) => call<RecentTrip[]>(api.GET('/v1/me/trips', { params: { query: { limit } } }));

export const updateTrip = (id: string, body: { status?: 'finished' | 'cancelled'; routeId?: string }) =>
  call(api.PATCH('/v1/trips/{id}', { params: { path: { id } }, body }));

export async function sendProbes(probeToken: string, fixes: Fix[]): Promise<SendResult> {
  try {
    const { response } = await api.POST('/v1/probes', {
      body: {
        probeToken,
        fixes: fixes.map((f) => ({
          t: Math.round(f.t), lat: f.lat, lng: f.lng,
          speed: f.speed ?? undefined, heading: f.heading ?? undefined, acc: f.acc ?? undefined,
        })),
      },
    });
    if (response.ok) return 'ok';
    if (response.status === 401 || response.status === 400) return 'drop';
    return 'retry';
  } catch {
    return 'retry';
  }
}

export const nearbyReports = (p: LatLng, radiusM = 8000) =>
  call<Report[]>(api.GET('/v1/reports/nearby', { params: { query: { lat: p.lat, lng: p.lng, radiusM } } }));

export const createReport = (type: ReportType, at: Fix) =>
  call(api.POST('/v1/reports', {
    body: {
      type, lat: at.lat, lng: at.lng,
      heading: at.heading != null && at.heading >= 0 ? at.heading : undefined,
      clientId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    },
  }));

export const voteReport = (id: string, stillThere: boolean) =>
  call(api.POST('/v1/reports/{id}/votes', { params: { path: { id } }, body: { stillThere } }));
