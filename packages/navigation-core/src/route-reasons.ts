import { decodePolyline, projectOnSegment } from './geo';
import type { NavRoute, ReportLike } from './types';

/** Why a route option looks the way it does — rendered as one short line under each option. */
export type RouteReason =
  | { kind: 'avoidsJams' }
  | { kind: 'jams'; count: number }
  | { kind: 'reports'; count: number; type: string }
  | { kind: 'toll' }
  | { kind: 'fewestTurns' }
  | { kind: 'shortest' };

export interface ReasonRoute extends NavRoute {
  traffic?: { congestion?: { level: 'slow' | 'jam' }[] } | null;
}

/** Reports that slow you down or close the road, most serious first. */
const SEVERITY = ['closure', 'crash', 'hazard', 'police', 'traffic', 'camera'];
const COUNTED = new Set(['closure', 'crash', 'hazard']);
const ON_ROUTE_M = 40;

const TURNS = new Set(['right', 'left', 'sharp_right', 'sharp_left', 'slight_right', 'slight_left', 'uturn', 'roundabout', 'keep_right', 'keep_left', 'ramp', 'exit']);

function reportsOn(route: NavRoute, reports: ReportLike[]): ReportLike[] {
  const pts = decodePolyline(route.polyline6);
  return reports.filter((r) => {
    if (!COUNTED.has(r.type)) return false;
    for (let i = 1; i < pts.length; i++) if (projectOnSegment(r, pts[i - 1], pts[i]).offsetM <= ON_ROUTE_M) return true;
    return false;
  });
}

/**
 * Up to two reasons per route, comparing the options with each other (a lone route gets the
 * facts only: jams, reports, toll). Same order as `routes`.
 */
export function routeReasons(routes: ReasonRoute[], reports: ReportLike[] = []): RouteReason[][] {
  const jams = routes.map((r) => (r.traffic?.congestion ?? []).filter((c) => c.level === 'jam').length);
  const turns = routes.map((r) => r.maneuvers.filter((m) => TURNS.has(m.kind)).length);
  const hits = routes.map((r) => reportsOn(r, reports));
  const several = routes.length > 1;
  const minTurns = Math.min(...turns), minDist = Math.min(...routes.map((r) => r.distanceM));

  return routes.map((r, i) => {
    const out: RouteReason[] = [];
    if (several && jams[i] === 0 && jams.some((j) => j > 0)) out.push({ kind: 'avoidsJams' });
    if (hits[i].length) {
      const worst = [...hits[i]].sort((a, b) => SEVERITY.indexOf(a.type) - SEVERITY.indexOf(b.type))[0];
      out.push({ kind: 'reports', count: hits[i].length, type: worst.type });
    }
    if (jams[i] > 0) out.push({ kind: 'jams', count: jams[i] });
    if (r.flags.includes('toll')) out.push({ kind: 'toll' });
    if (several && turns[i] === minTurns && turns.filter((t) => t === minTurns).length === 1) out.push({ kind: 'fewestTurns' });
    if (several && r.distanceM === minDist && routes.filter((x) => x.distanceM === minDist).length === 1) out.push({ kind: 'shortest' });
    return out.slice(0, 2);
  });
}
