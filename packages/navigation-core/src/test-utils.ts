import { encodePolyline, haversineM } from './geo';
import type { LatLng, NavRoute, RouteManeuver } from './types';

/**
 * Builds a NavRoute through waypoints, one maneuver per corner — the same shape Valhalla returns.
 * Default: 600 m north, turn right, 800 m east, turn left, 500 m north, arrive.
 */
export function makeRoute(
  pts: LatLng[] = [
    { lat: 32.08, lng: 34.78 },
    { lat: 32.0854, lng: 34.78 },
    { lat: 32.0854, lng: 34.7885 },
    { lat: 32.0899, lng: 34.7885 },
  ],
  kinds: string[] = ['depart', 'right', 'left', 'arrive'],
  streets: string[] = ['Herzl St', 'Jabotinsky St', 'Rothschild Blvd', ''],
  speedMs = 12,
  id = 'rt_test',
): NavRoute {
  const verbs: Record<string, string> = {
    depart: 'Drive north on', right: 'Turn right onto', left: 'Turn left onto', slight_right: 'Bear right onto', continue: 'Continue on',
  };
  const maneuvers: RouteManeuver[] = pts.map((p, i) => {
    const len = i < pts.length - 1 ? haversineM(p, pts[i + 1]) : 0;
    const kind = kinds[i] ?? 'continue';
    return {
      kind,
      instruction: kind === 'arrive' ? 'You have arrived at your destination.' : `${verbs[kind] ?? 'Continue on'} ${streets[i]}.`,
      streetNames: streets[i] ? [streets[i]] : [],
      distanceM: Math.round(len),
      durationS: Math.round(len / speedMs),
      beginShapeIndex: i,
    };
  });
  const distanceM = maneuvers.reduce((s, m) => s + m.distanceM, 0);
  return {
    id, polyline6: encodePolyline(pts), distanceM, durationS: maneuvers.reduce((s, m) => s + m.durationS, 0),
    maneuvers, flags: [], cells: [],
  };
}
