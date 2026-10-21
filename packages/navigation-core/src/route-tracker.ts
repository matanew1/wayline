import { haversineM, headingDiff } from './geo';
import { RouteGeometry } from './route-geometry';
import type { Fix, LatLng, NavRoute, RouteManeuver } from './types';

export interface TrackerOptions {
  /** Base distance from the route that counts as off-route; grows with GPS inaccuracy. */
  offRouteM: number;
  /** Consecutive off-route fixes before we declare it (debounces GPS jumps). */
  offRouteFixes: number;
  /** Within this distance of the end we're arrived. */
  arriveM: number;
  /** Faster than this (m/s) with heading against the route counts as off-route (wrong way). */
  wrongWayMinSpeed: number;
}

export const DEFAULT_TRACKER_OPTIONS: TrackerOptions = { offRouteM: 50, offRouteFixes: 3, arriveM: 30, wrongWayMinSpeed: 4 };

export interface Progress {
  /** Position snapped onto the route (use for the puck while on route). */
  snapped: LatLng;
  raw: LatLng;
  /** This fix is close enough to the route. */
  onRoute: boolean;
  /** Sustained off-route — time to reroute. */
  offRoute: boolean;
  distanceAlongM: number;
  distanceRemainingM: number;
  durationRemainingS: number;
  /** 0..1 */
  fraction: number;
  /** Index of the next maneuver to perform. */
  nextManeuverIndex: number;
  nextManeuver: RouteManeuver;
  /** The maneuver after next (for "then …"). */
  thenManeuver: RouteManeuver | null;
  distanceToManeuverM: number;
  currentStreet: string | null;
  routeBearing: number;
  /** Posted limit here, when known. */
  speedLimitKmh: number | null;
  arrived: boolean;
}

export class RouteTracker {
  readonly geometry: RouteGeometry;
  private readonly opts: TrackerOptions;
  private readonly maneuverAlong: number[];
  private hint = 0;
  private offCount = 0;
  private maxAlong = 0;

  constructor(readonly route: NavRoute, opts: Partial<TrackerOptions> = {}) {
    this.opts = { ...DEFAULT_TRACKER_OPTIONS, ...opts };
    this.geometry = new RouteGeometry(route.polyline6);
    const last = this.geometry.points.length - 1;
    this.maneuverAlong = route.maneuvers.map((m) => this.geometry.cumulative[Math.min(last, Math.max(0, m.beginShapeIndex))]);
  }

  /** Distance along the route at which maneuver i happens. */
  maneuverDistance(i: number) {
    return this.maneuverAlong[i];
  }

  /** Posted speed limit at a distance along the route (spans are in route.distanceM scale). */
  speedLimitAt(alongM: number): number | null {
    const spans = this.route.speedLimits;
    if (!spans?.length) return null;
    const d = this.route.distanceM > 0 ? (alongM * this.route.distanceM) / this.geometry.lengthM : alongM;
    return spans.find((s) => d >= s.fromM && d < s.toM)?.kmh ?? null;
  }

  update(fix: Fix): Progress {
    const raw = { lat: fix.lat, lng: fix.lng };
    const pr = this.geometry.project(raw, this.hint);

    const tolerance = Math.max(this.opts.offRouteM, (fix.acc ?? 0) * 1.5);
    const wrongWay =
      (fix.speed ?? 0) >= this.opts.wrongWayMinSpeed &&
      fix.heading != null && fix.heading >= 0 &&
      pr.offsetM > 15 &&
      headingDiff(fix.heading, pr.bearing) > 120;
    const onRoute = pr.offsetM <= tolerance && !wrongWay;

    if (onRoute) {
      this.offCount = 0;
      this.hint = pr.segIndex;
      // GPS jitter can project slightly backwards; never let progress run backwards by more than a few metres.
      this.maxAlong = Math.max(this.maxAlong, pr.distanceAlongM);
    } else {
      this.offCount += 1;
    }
    const along = onRoute ? Math.max(pr.distanceAlongM, this.maxAlong - 5) : this.maxAlong;
    const total = this.geometry.lengthM;
    const remaining = Math.max(0, total - along);

    // Next maneuver = first one strictly ahead of us (skip index 0, the departure).
    let next = this.maneuverAlong.findIndex((d, i) => i > 0 && d > along + 1);
    if (next < 0) next = this.route.maneuvers.length - 1;

    const dest = this.geometry.points[this.geometry.points.length - 1];
    const arrived = (remaining <= this.opts.arriveM && onRoute) || haversineM(raw, dest) <= this.opts.arriveM;

    return {
      snapped: onRoute ? this.geometry.pointAt(along).point : raw,
      raw,
      onRoute,
      offRoute: this.offCount >= this.opts.offRouteFixes,
      distanceAlongM: along,
      distanceRemainingM: remaining,
      durationRemainingS: this.durationRemaining(along, next),
      fraction: total === 0 ? 1 : along / total,
      nextManeuverIndex: next,
      nextManeuver: this.route.maneuvers[next],
      thenManeuver: this.route.maneuvers[next + 1] ?? null,
      distanceToManeuverM: Math.max(0, this.maneuverAlong[next] - along),
      currentStreet: this.route.maneuvers[next - 1]?.streetNames[0] ?? null,
      routeBearing: pr.bearing,
      speedLimitKmh: this.speedLimitAt(along),
      arrived,
    };
  }

  /** Each maneuver's durationS covers the stretch until the next maneuver. */
  private durationRemaining(along: number, next: number): number {
    const m = this.route.maneuvers;
    const cur = next - 1;
    let s = 0;
    if (cur >= 0) {
      const start = this.maneuverAlong[cur], end = this.maneuverAlong[next];
      const span = end - start;
      s += span > 0 ? m[cur].durationS * Math.max(0, Math.min(1, (end - along) / span)) : 0;
    }
    for (let i = next; i < m.length; i++) s += m[i].durationS;
    return Math.round(s);
  }
}
