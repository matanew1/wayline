import { createWaylineClient, type Place, type Report, type ReportType, type RouteOption, type SavedPlace } from '@wayline/contracts';
import type { Fix, LatLng, SendResult } from '@wayline/navigation-core';
import { config } from '@/config';
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
  call<Place[]>(api.GET('/v1/places/search', { params: { query: { q, lat: near?.lat, lng: near?.lng } } }));

export const savedPlaces = () => call<SavedPlace[]>(api.GET('/v1/me/places'));

export const savePlace = (body: { kind: 'home' | 'work' | 'fav'; name: string; address?: string; lat: number; lng: number }) =>
  call<SavedPlace>(api.PUT('/v1/me/places', { body }));

/** The API rejects unknown fields, so strip Fix/Place objects down to coordinates. */
const pt = (p: LatLng): LatLng => ({ lat: p.lat, lng: p.lng });

export const planRoutes = (origin: LatLng, destination: LatLng) =>
  call<RouteOption[]>(api.POST('/v1/routes', { body: { origin: pt(origin), destination: pt(destination), language: config.language } }));

export const startTrip = (routeId: string) => call(api.POST('/v1/trips', { body: { routeId } }));

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
