import { destination } from './geo';
import { RouteGeometry } from './route-geometry';
import type { Fix } from './types';

export interface SimulatorOptions {
  /** m/s; ~50 km/h default */
  speedMs: number;
  /** Leave the route at this distance and keep driving straight — exercises rerouting. */
  leaveRouteAtM?: number;
  /** Gaussian-ish GPS noise in metres (0 = perfect). */
  noiseM: number;
  /** Deterministic noise. */
  seed: number;
}

/** Replays a drive along a route shape — for development, demos and tests. */
export class RouteSimulator {
  private readonly geo: RouteGeometry;
  private readonly o: SimulatorOptions;
  private along = 0;
  private offRoad: { lat: number; lng: number; bearing: number } | null = null;
  private rng: number;

  constructor(shape: string | RouteGeometry, opts: Partial<SimulatorOptions> = {}) {
    this.geo = typeof shape === 'string' ? new RouteGeometry(shape) : shape;
    this.o = { speedMs: 14, noiseM: 0, seed: 42, ...opts };
    this.rng = this.o.seed;
  }

  get done() {
    return !this.offRoad && this.along >= this.geo.lengthM;
  }

  private rand() {
    this.rng = (this.rng * 1664525 + 1013904223) % 4294967296;
    return this.rng / 4294967296;
  }

  /** Advance by dtMs and return the fix at the new position. */
  step(t: number, dtMs = 1000): Fix {
    const dist = (this.o.speedMs * dtMs) / 1000;
    let lat: number, lng: number, heading: number;
    if (this.offRoad) {
      const p = destination(this.offRoad, this.offRoad.bearing, dist);
      this.offRoad = { ...p, bearing: this.offRoad.bearing };
      ({ lat, lng } = p);
      heading = this.offRoad.bearing;
    } else {
      this.along = Math.min(this.geo.lengthM, this.along + dist);
      const at = this.geo.pointAt(this.along);
      ({ lat, lng } = at.point);
      heading = at.bearing;
      if (this.o.leaveRouteAtM !== undefined && this.along >= this.o.leaveRouteAtM) {
        // turn 90° off the route
        this.offRoad = { lat, lng, bearing: (heading + 90) % 360 };
      }
    }
    if (this.o.noiseM > 0) {
      const p = destination({ lat, lng }, this.rand() * 360, this.rand() * this.o.noiseM);
      ({ lat, lng } = p);
    }
    return { t, lat, lng, speed: this.o.speedMs, heading, acc: Math.max(3, this.o.noiseM) };
  }
}
