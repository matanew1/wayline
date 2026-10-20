import createClient, { type Middleware } from 'openapi-fetch';
import type { components, paths } from './schema';

export type { components, paths } from './schema';

type S = components['schemas'];
export type TokenPair = S['TokenPairDto'];
export type Place = S['PlaceDto'];
export type SavedPlace = S['SavedPlaceDto'];
export type RouteOption = S['RouteOptionDto'];
export type Maneuver = S['ManeuverDto'];
export type TripStarted = S['TripStartedDto'];
export type Trip = S['TripDto'];
export type ProbeFix = S['ProbeFixDto'];
export type Report = S['ReportDto'];
export type ReportType = Report['type'];

/** Socket.IO namespace `/rt` — connect with `io(baseUrl + '/rt', { auth: { token } })`. */
export interface RealtimeClientEvents {
  subscribe: (body: { cells: string[] }, ack: (res: { ok: boolean; cells?: number; error?: string }) => void) => void;
}
export interface RealtimeServerEvents {
  'report.upsert': (report: Report) => void;
  'report.remove': (body: { id: string }) => void;
}

/**
 * Typed fetch client:
 *   const api = createWaylineClient('https://api.example.com', () => tokens.access);
 *   const { data, error } = await api.POST('/v1/routes', { body: { origin, destination } });
 */
export function createWaylineClient(baseUrl: string, getToken?: () => string | undefined | Promise<string | undefined>) {
  const client = createClient<paths>({ baseUrl });
  if (getToken) {
    const authMw: Middleware = {
      async onRequest({ request }) {
        const t = await getToken();
        if (t) request.headers.set('Authorization', `Bearer ${t}`);
        return request;
      },
    };
    client.use(authMw);
  }
  return client;
}
