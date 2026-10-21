import type { EdgeSpeed } from './traffic.store';

/** One directed road segment a route uses (from Valhalla map-matching of the route shape). */
export interface RouteEdge {
  /** Valhalla GraphId — directional, stable for a given tile build. */
  id: string;
  /** OSM way id (both directions), for historic baselines. */
  wayId: number | null;
  lengthM: number;
  speedLimitKmh: number | null;
  /** Valhalla's speed for the edge without live data. */
  freeFlowKmh: number;
  beginShapeIndex: number;
  endShapeIndex: number;
}

export interface Span {
  /** metres along the route */
  fromM: number;
  toM: number;
}
export interface SpeedLimitSpan extends Span { kmh: number }
export interface CongestionSpan extends Span { level: 'slow' | 'jam' }

export interface RoutePricing {
  /** Traffic-adjusted duration, seconds. */
  durationS: number;
  /** Duration the router estimated without live traffic. */
  baseDurationS: number;
  speedLimits: SpeedLimitSpan[];
  congestion: CongestionSpan[];
  liveEdges: number;
  totalEdges: number;
}

const SLOW = 0.7;
const JAM = 0.4;
const secs = (lengthM: number, kmh: number) => (kmh > 0 ? lengthM / (kmh / 3.6) : 0);

function merge<T extends Span>(spans: T[], same: (a: T, b: T) => boolean): T[] {
  const out: T[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && same(last, s) && Math.abs(last.toM - s.fromM) < 1) last.toM = s.toM;
    else out.push({ ...s });
  }
  return out;
}

/**
 * Prices a route (or its remainder from edge `fromEdge`) with live speeds.
 * Valhalla's own duration includes turn and intersection costs that edge speeds don't capture, so we
 * keep its estimate and scale it by live/free-flow travel time over the same edges.
 */
export function priceRoute(
  route: { durationS: number; distanceM: number },
  edges: RouteEdge[],
  speeds: Map<string, EdgeSpeed>,
  fromEdge = 0,
): RoutePricing {
  const totalLen = edges.reduce((s, e) => s + e.lengthM, 0) || 1;
  const scale = route.distanceM > 0 ? route.distanceM / totalLen : 1;

  let freeAll = 0, freeRest = 0, liveRest = 0, live = 0;
  let along = 0;
  const limits: SpeedLimitSpan[] = [];
  const cong: CongestionSpan[] = [];
  edges.forEach((e, i) => {
    const free = secs(e.lengthM, e.freeFlowKmh);
    const s = speeds.get(e.id);
    const liveKmh = s ? Math.min(s.kmh, e.freeFlowKmh * 1.5) : null; // cap optimistic outliers
    const t = liveKmh ? secs(e.lengthM, liveKmh) : free;
    freeAll += free;
    const fromM = along * scale, toM = (along + e.lengthM) * scale;
    along += e.lengthM;
    if (i < fromEdge) return;
    freeRest += free;
    liveRest += t;
    if (s) live++;
    if (e.speedLimitKmh) limits.push({ fromM, toM, kmh: e.speedLimitKmh });
    if (liveKmh && e.freeFlowKmh > 0) {
      const r = liveKmh / e.freeFlowKmh;
      if (r < JAM) cong.push({ fromM, toM, level: 'jam' });
      else if (r < SLOW) cong.push({ fromM, toM, level: 'slow' });
    }
  });

  const baseRest = freeAll > 0 ? route.durationS * (freeRest / freeAll) : route.durationS;
  const factor = freeRest > 0 ? liveRest / freeRest : 1;
  const round = (n: number) => Math.round(n);
  return {
    durationS: round(baseRest * factor),
    baseDurationS: round(baseRest),
    speedLimits: merge(limits, (a, b) => a.kmh === b.kmh).map((s) => ({ ...s, fromM: round(s.fromM), toM: round(s.toM) })),
    congestion: merge(cong, (a, b) => a.level === b.level).map((s) => ({ ...s, fromM: round(s.fromM), toM: round(s.toM) })),
    liveEdges: live,
    totalEdges: edges.length - fromEdge,
  };
}

/** Index of the first edge that ends after shape index `shapeIndex`. */
export function edgeAtShapeIndex(edges: RouteEdge[], shapeIndex: number): number {
  const i = edges.findIndex((e) => e.endShapeIndex > shapeIndex);
  return i < 0 ? edges.length : i;
}
