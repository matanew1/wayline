import { bearingDeg, decodePolyline, haversineM, projectOnSegment } from './geo';
import type { LatLng } from './types';

export interface RouteProjection {
  segIndex: number;
  point: LatLng;
  distanceAlongM: number;
  offsetM: number;
  /** bearing of the route at the projected point */
  bearing: number;
}

/** Decoded route shape with cumulative distances, for fast projection and lookup. */
export class RouteGeometry {
  readonly points: LatLng[];
  /** cumulative[i] = distance from start to points[i] */
  readonly cumulative: number[];
  readonly lengthM: number;
  private readonly bearings: number[];

  constructor(shape: string | LatLng[]) {
    this.points = typeof shape === 'string' ? decodePolyline(shape) : shape;
    if (this.points.length < 2) throw new Error('route needs at least two points');
    this.cumulative = [0];
    this.bearings = [];
    for (let i = 1; i < this.points.length; i++) {
      this.cumulative.push(this.cumulative[i - 1] + haversineM(this.points[i - 1], this.points[i]));
      this.bearings.push(bearingDeg(this.points[i - 1], this.points[i]));
    }
    this.lengthM = this.cumulative[this.cumulative.length - 1];
  }

  get segmentCount() {
    return this.points.length - 1;
  }

  segmentBearing(i: number) {
    return this.bearings[Math.max(0, Math.min(this.bearings.length - 1, i))];
  }

  private projectRange(p: LatLng, from: number, to: number): RouteProjection | null {
    let best: RouteProjection | null = null;
    for (let i = Math.max(0, from); i <= Math.min(this.segmentCount - 1, to); i++) {
      const a = this.points[i], b = this.points[i + 1];
      const pr = projectOnSegment(p, a, b);
      if (!best || pr.offsetM < best.offsetM) {
        const segLen = this.cumulative[i + 1] - this.cumulative[i];
        best = { segIndex: i, point: pr.point, offsetM: pr.offsetM, distanceAlongM: this.cumulative[i] + segLen * pr.t, bearing: this.bearings[i] };
      }
    }
    return best;
  }

  /**
   * Nearest point on the route. With a `hint` (the last segment we were on) it searches
   * a window ahead first, so overlapping or looping routes don't make the car jump ahead.
   */
  project(p: LatLng, hint?: number, maxWindowOffsetM = 60): RouteProjection {
    if (hint !== undefined) {
      const local = this.projectRange(p, hint - 2, hint + 40);
      if (local && local.offsetM <= maxWindowOffsetM) return local;
    }
    return this.projectRange(p, 0, this.segmentCount - 1)!;
  }

  /** Point and bearing at a distance along the route. */
  pointAt(distanceAlongM: number): { point: LatLng; bearing: number; segIndex: number } {
    const d = Math.max(0, Math.min(this.lengthM, distanceAlongM));
    let lo = 0, hi = this.segmentCount - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cumulative[mid] <= d) lo = mid; else hi = mid - 1;
    }
    const segLen = this.cumulative[lo + 1] - this.cumulative[lo];
    const f = segLen === 0 ? 0 : (d - this.cumulative[lo]) / segLen;
    const a = this.points[lo], b = this.points[lo + 1];
    return { point: { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f }, bearing: this.bearings[lo], segIndex: lo };
  }

  /** Points from a distance to the end — the "remaining route" line on the map. */
  remainingFrom(distanceAlongM: number): LatLng[] {
    const { point, segIndex } = this.pointAt(distanceAlongM);
    return [point, ...this.points.slice(segIndex + 1)];
  }
}
