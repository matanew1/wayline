import { haversineM } from './geo';
import { ProbeBuffer, type SendResult } from './probe-buffer';
import { type ReportAhead, ReportAlertPlanner } from './report-alerts';
import { type Progress, RouteTracker, type TrackerOptions } from './route-tracker';
import type { Fix, Language, LatLng, NavRoute, ReportLike } from './types';
import { phrase, VoicePlanner } from './voice-planner';

export type SessionPhase = 'navigating' | 'rerouting' | 'arrived';

export interface SessionDeps<R extends ReportLike = ReportLike> {
  now: () => number;
  speak: (text: string, kind: 'guidance' | 'alert' | 'status') => void;
  /** New route from the current position, or null if none could be found. */
  requestReroute: (from: LatLng, headingDeg: number | null) => Promise<NavRoute | null>;
  sendProbes?: (fixes: Fix[]) => Promise<SendResult>;
  /** Called when the route is replaced (so the app can PATCH the trip). */
  onRouteChanged?: (route: NavRoute) => void;
  /** Which report types should produce a spoken alert. */
  alertText?: (r: R) => string | null;
  language?: Language;
}

export interface SessionOptions {
  minRerouteIntervalMs: number;
  tracker: Partial<TrackerOptions>;
}

export interface SessionSnapshot<R extends ReportLike = ReportLike> {
  phase: SessionPhase;
  route: NavRoute;
  progress: Progress | null;
  /** m/s, from GPS or derived from consecutive fixes */
  speedMs: number;
  etaEpochMs: number | null;
  alert: ReportAhead<R> | null;
  reroutes: number;
}

type Listener<R extends ReportLike> = (s: SessionSnapshot<R>) => void;

/**
 * One active drive. Feed it GPS fixes; it tracks progress, speaks guidance,
 * reroutes when off-route, raises report alerts and uploads probes.
 * Platform-free: the app injects speech, networking and the clock.
 */
export class NavigationSession<R extends ReportLike = ReportLike> {
  private readonly o: SessionOptions;
  private readonly lang: Language;
  private tracker: RouteTracker;
  private voice: VoicePlanner;
  private alerts: ReportAlertPlanner<R>;
  private probes: ProbeBuffer | null = null;
  private reports: R[] = [];
  private listeners = new Set<Listener<R>>();
  private lastFix: Fix | null = null;
  private lastRerouteAt = -Infinity;
  private alertedId: string | null = null;
  private snap: SessionSnapshot<R>;
  private ended = false;

  constructor(route: NavRoute, private readonly destination: LatLng, private readonly deps: SessionDeps<R>, opts: Partial<SessionOptions> = {}) {
    this.o = { minRerouteIntervalMs: 10_000, tracker: {}, ...opts };
    this.lang = deps.language ?? 'en';
    this.tracker = new RouteTracker(route, this.o.tracker);
    this.voice = new VoicePlanner(route.maneuvers, this.lang);
    this.alerts = new ReportAlertPlanner<R>(this.tracker.geometry);
    if (deps.sendProbes) {
      this.probes = new ProbeBuffer({
        origin: this.tracker.geometry.points[0], destination, send: deps.sendProbes, now: deps.now,
      });
    }
    this.snap = { phase: 'navigating', route, progress: null, speedMs: 0, etaEpochMs: null, alert: null, reroutes: 0 };
  }

  get snapshot() {
    return this.snap;
  }

  subscribe(fn: Listener<R>) {
    this.listeners.add(fn);
    fn(this.snap);
    return () => this.listeners.delete(fn);
  }

  private emit(patch: Partial<SessionSnapshot<R>>) {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l(this.snap);
  }

  /** Speak the first instruction. */
  start() {
    const s = this.voice.start();
    if (s) this.deps.speak(s, 'guidance');
  }

  setReports(reports: R[]) {
    this.reports = reports;
  }

  dismissAlert(id: string) {
    this.alerts.dismiss(id);
    if (this.snap.alert?.report.id === id) this.emit({ alert: null });
  }

  private speedOf(fix: Fix): number {
    if (fix.speed != null && fix.speed >= 0) return fix.speed;
    const prev = this.lastFix;
    if (!prev || fix.t <= prev.t) return this.snap.speedMs;
    return haversineM(prev, fix) / ((fix.t - prev.t) / 1000);
  }

  async onFix(fix: Fix): Promise<SessionSnapshot<R>> {
    if (this.ended || this.snap.phase === 'arrived') return this.snap;
    const speedMs = this.speedOf(fix);
    this.lastFix = fix;
    this.probes?.add(fix);
    void this.probes?.maybeFlush();

    const progress = this.tracker.update(fix);
    const now = this.deps.now();

    if (progress.arrived) {
      const text = this.voice.update(progress, speedMs);
      if (text) this.deps.speak(text, 'guidance');
      this.emit({ phase: 'arrived', progress, speedMs, etaEpochMs: now, alert: null });
      void this.probes?.flush();
      return this.snap;
    }

    if (progress.offRoute && this.snap.phase !== 'rerouting' && now - this.lastRerouteAt >= this.o.minRerouteIntervalMs) {
      await this.reroute(fix, speedMs, progress);
      return this.snap;
    }

    if (progress.onRoute) {
      const text = this.voice.update(progress, speedMs, (i) => this.tracker.maneuverDistance(i + 1) - this.tracker.maneuverDistance(i));
      if (text) this.deps.speak(text, 'guidance');
    }

    const alert = this.alerts.next(progress.distanceAlongM, speedMs, this.reports);
    if (alert && alert.report.id !== this.alertedId) {
      this.alertedId = alert.report.id;
      const text = this.deps.alertText?.(alert.report);
      if (text) this.deps.speak(text, 'alert');
    }

    this.emit({ progress, speedMs, etaEpochMs: now + progress.durationRemainingS * 1000, alert });
    return this.snap;
  }

  private async reroute(fix: Fix, speedMs: number, progress: Progress) {
    this.lastRerouteAt = this.deps.now();
    this.emit({ phase: 'rerouting', progress, speedMs });
    this.deps.speak(phrase(this.lang).rerouting, 'status');
    let route: NavRoute | null = null;
    try {
      route = await this.deps.requestReroute({ lat: fix.lat, lng: fix.lng }, fix.heading ?? null);
    } catch {
      route = null;
    }
    if (this.ended) return;
    if (!route) {
      // keep the old route; we'll try again after minRerouteIntervalMs
      this.emit({ phase: 'navigating' });
      return;
    }
    this.tracker = new RouteTracker(route, this.o.tracker);
    this.voice = new VoicePlanner(route.maneuvers, this.lang);
    this.alerts = new ReportAlertPlanner<R>(this.tracker.geometry);
    this.alertedId = null;
    this.deps.onRouteChanged?.(route);
    const p = this.tracker.update(fix);
    this.emit({ phase: 'navigating', route, progress: p, reroutes: this.snap.reroutes + 1, etaEpochMs: this.deps.now() + p.durationRemainingS * 1000 });
  }

  /** Ends the session and uploads any buffered probes. */
  async end() {
    this.ended = true;
    await this.probes?.flush();
    this.listeners.clear();
  }

  /** Destination used for probe trimming and arrival UI. */
  get destinationPoint() {
    return this.destination;
  }
}
