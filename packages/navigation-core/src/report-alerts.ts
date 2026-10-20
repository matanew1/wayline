import { headingDiff } from './geo';
import type { RouteGeometry } from './route-geometry';
import type { ReportLike } from './types';

export interface AlertOptions {
  /** Max distance of a report from the route line. */
  corridorM: number;
  /** Always look at least this far ahead… */
  minLookaheadM: number;
  /** …or this many seconds ahead at the current speed… */
  lookaheadS: number;
  /** …but never further than this. */
  maxLookaheadM: number;
  /** Reports whose heading differs more than this from the route are for the other direction. */
  headingToleranceDeg: number;
}

export const DEFAULT_ALERT_OPTIONS: AlertOptions = {
  corridorM: 40, minLookaheadM: 300, lookaheadS: 30, maxLookaheadM: 1500, headingToleranceDeg: 60,
};

export interface ReportAhead<R extends ReportLike = ReportLike> {
  report: R;
  distanceAheadM: number;
}

/** Finds the nearest relevant report ahead on the route. */
export class ReportAlertPlanner<R extends ReportLike = ReportLike> {
  private readonly opts: AlertOptions;
  private readonly cache = new Map<string, { along: number; onRoute: boolean }>();
  private readonly dismissed = new Set<string>();

  constructor(private readonly geometry: RouteGeometry, opts: Partial<AlertOptions> = {}) {
    this.opts = { ...DEFAULT_ALERT_OPTIONS, ...opts };
  }

  private locate(r: R) {
    let hit = this.cache.get(r.id);
    if (!hit) {
      const pr = this.geometry.project(r);
      const sameDirection = r.heading == null || headingDiff(r.heading, pr.bearing) <= this.opts.headingToleranceDeg;
      hit = { along: pr.distanceAlongM, onRoute: pr.offsetM <= this.opts.corridorM && sameDirection };
      this.cache.set(r.id, hit);
    }
    return hit;
  }

  dismiss(id: string) {
    this.dismissed.add(id);
  }

  isDismissed(id: string) {
    return this.dismissed.has(id);
  }

  next(distanceAlongM: number, speedMs: number, reports: R[]): ReportAhead<R> | null {
    const look = Math.min(this.opts.maxLookaheadM, Math.max(this.opts.minLookaheadM, speedMs * this.opts.lookaheadS));
    let best: ReportAhead<R> | null = null;
    for (const r of reports) {
      if (this.dismissed.has(r.id)) continue;
      const { along, onRoute } = this.locate(r);
      if (!onRoute) continue;
      const ahead = along - distanceAlongM;
      if (ahead < 5 || ahead > look) continue;
      if (!best || ahead < best.distanceAheadM) best = { report: r, distanceAheadM: ahead };
    }
    return best;
  }
}
