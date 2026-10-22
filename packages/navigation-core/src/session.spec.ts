import { haversineM } from './geo';
import { NavigationSession } from './session';
import { RouteSimulator } from './simulator';
import { makeRoute } from './test-utils';
import type { Fix, LatLng, NavRoute, ReportLike } from './types';

const route = makeRoute();
const dest = { lat: 32.0899, lng: 34.7885 };

function setup(over: Partial<ConstructorParameters<typeof NavigationSession>[2]> = {}) {
  let now = 1_800_000_000_000;
  const said: { text: string; kind: string }[] = [];
  const probes: Fix[][] = [];
  const reroutes: LatLng[] = [];
  const session = new NavigationSession<ReportLike>(route, dest, {
    now: () => now,
    speak: (text, kind) => said.push({ text, kind }),
    requestReroute: async (from) => { reroutes.push(from); return null; },
    sendProbes: async (f) => { probes.push(f); return 'ok'; },
    alertText: (r) => (r.type === 'police' ? 'Police reported ahead' : null),
    ...over,
  });
  const tick = (ms = 1000) => (now += ms);
  return { session, said, probes, reroutes, tick, now: () => now };
}

describe('NavigationSession', () => {
  it('guides a full drive to arrival and uploads probes', async () => {
    const { session, said, probes, tick, now } = setup();
    const snaps: string[] = [];
    session.subscribe((s) => snaps.push(s.phase));
    session.start();
    const sim = new RouteSimulator(route.polyline6, { speedMs: 12, noiseM: 4 });
    while (session.snapshot.phase !== 'arrived') {
      tick();
      await session.onFix(sim.step(now()));
    }
    await session.end();
    expect(said[0]).toEqual({ text: 'Drive north on Herzl St', kind: 'guidance' });
    expect(said.map((s) => s.text)).toContain('Turn left onto Rothschild Blvd');
    expect(said[said.length - 1].text).toBe('You have arrived at your destination');
    expect(snaps).not.toContain('rerouting');
    expect(probes.flat().length).toBeGreaterThan(50);
    expect(session.snapshot.etaEpochMs).toBeLessThanOrEqual(now());
  });

  it('alerts once for a police report ahead on the route', async () => {
    const { session, said, tick, now } = setup();
    session.setReports([
      { id: 'p1', type: 'police', lat: 32.0854, lng: 34.783, heading: 90 }, // on the east-bound leg
      { id: 'h1', type: 'hazard', lat: 32.0854, lng: 34.786, heading: null }, // silent type
    ]);
    const sim = new RouteSimulator(route.polyline6, { speedMs: 12 });
    let sawAlert = false;
    while (session.snapshot.phase !== 'arrived') {
      tick();
      const s = await session.onFix(sim.step(now()));
      if (s.alert?.report.id === 'p1') sawAlert = true;
    }
    expect(sawAlert).toBe(true);
    expect(said.filter((s) => s.kind === 'alert').map((s) => s.text)).toEqual(['Police reported ahead']);
  });

  it('dismissing clears the current alert', async () => {
    const { session, tick, now } = setup();
    session.setReports([{ id: 'p1', type: 'police', lat: 32.0835, lng: 34.78, heading: null }]);
    const sim = new RouteSimulator(route.polyline6, { speedMs: 12 });
    let s = session.snapshot;
    while (!s.alert) { tick(); s = await session.onFix(sim.step(now())); }
    session.dismissAlert('p1');
    expect(session.snapshot.alert).toBeNull();
    tick();
    expect((await session.onFix(sim.step(now()))).alert).toBeNull();
  });

  it('reroutes when the driver leaves the route, and rate-limits retries', async () => {
    let sim = new RouteSimulator(route.polyline6, { speedMs: 12, leaveRouteAtM: 300 });
    const changed: NavRoute[] = [];
    let fail = true;
    const ctx = setup({
      onRouteChanged: (r) => changed.push(r),
      requestReroute: async (from) => {
        ctx.reroutes.push(from);
        if (fail) { fail = false; return null; }
        // new route: from current position east, then north to destination
        return makeRoute([from, { lat: from.lat, lng: dest.lng }, dest], ['depart', 'left', 'arrive'], ['Detour Rd', 'Back St', ''], 12, 'rt_new');
      },
    });
    const { session, said, tick, now } = ctx;
    for (let i = 0; i < 400 && session.snapshot.reroutes === 0; i++) {
      tick();
      await session.onFix(sim.step(now()));
    }
    expect(ctx.reroutes).toHaveLength(2); // first failed, retried after ≥ 10 s
    expect(said.filter((s) => s.text === 'Recalculating route')).toHaveLength(2);
    expect(changed.map((r) => r.id)).toEqual(['rt_new']);
    expect(session.snapshot.route.id).toBe('rt_new');
    expect(session.snapshot.phase).toBe('navigating');

    // follow the new route to the end
    sim = new RouteSimulator(session.snapshot.route.polyline6, { speedMs: 12 });
    while (session.snapshot.phase !== 'arrived') { tick(); await session.onFix(sim.step(now())); }
    expect(haversineM(session.snapshot.progress!.raw, dest)).toBeLessThan(40);
  });
});

describe('NavigationSession — live ETA, faster routes, speed limits', () => {
  /** let pending promise chains (the async ETA check) settle — no timers in this platform-free package */
  const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

  it('applies the server ETA correction and offers a faster route once', async () => {
    let calls = 0;
    const faster = makeRoute(undefined, undefined, ['Fast St', 'Quick Rd', 'Swift Ave', ''], 20, 'rt_fast');
    const ctx = setup({
      checkEta: async () => { calls++; return { remainingS: 400, fasterRoute: faster, savingS: 240 }; },
      offerText: (s) => `Faster route found, saves ${Math.round(s / 60)} minutes`,
    });
    const { session, said, tick, now } = ctx;
    const sim = new RouteSimulator(route.polyline6, { speedMs: 12 });
    tick(); await session.onFix(sim.step(now())); await flush();
    expect(calls).toBe(1);
    expect(session.snapshot.offer?.route.id).toBe('rt_fast');
    expect(said.map((s) => s.text)).toContain('Faster route found, saves 4 minutes');

    tick(); const s = await session.onFix(sim.step(now()));
    // local estimate ≈ 160 s → server says 400 s → factor ≈ 2.5 applied to the displayed remaining time
    expect(s.remainingS!).toBeGreaterThan(s.progress!.durationRemainingS * 2);

    // no second check before the interval
    for (let i = 0; i < 30; i++) { tick(); await session.onFix(sim.step(now())); }
    expect(calls).toBe(1);

    session.acceptOffer();
    expect(session.snapshot.route.id).toBe('rt_fast');
    expect(session.snapshot.offer).toBeNull();
    expect(session.snapshot.reroutes).toBe(1);
  });

  it('takes an unanswered faster route after 8 s, unless the driver declines', async () => {
    const faster = makeRoute(undefined, undefined, ['Fast St', 'Quick Rd', 'Swift Ave', ''], 20, 'rt_fast');
    const ctx = setup({ checkEta: async () => ({ remainingS: 400, fasterRoute: faster, savingS: 240 }) });
    const sim = new RouteSimulator(route.polyline6, { speedMs: 6 });
    ctx.tick(); await ctx.session.onFix(sim.step(ctx.now())); await flush();
    const offeredAt = ctx.session.snapshot.offer!.offeredAt;
    expect(offeredAt).toBe(ctx.now());
    for (let i = 0; i < 7; i++) { ctx.tick(); await ctx.session.onFix(sim.step(ctx.now())); }
    expect(ctx.session.snapshot.route.id).toBe('rt_test'); // 7 s: still asking
    ctx.tick(); await ctx.session.onFix(sim.step(ctx.now()));
    expect(ctx.session.snapshot.route.id).toBe('rt_fast'); // 8 s: switched
    expect(ctx.session.snapshot.offer).toBeNull();

    const other = setup({ checkEta: async () => ({ remainingS: 400, fasterRoute: faster, savingS: 240 }) });
    other.tick(); await other.session.onFix(sim.step(other.now())); await flush();
    other.session.declineOffer();
    for (let i = 0; i < 10; i++) { other.tick(); await other.session.onFix(sim.step(other.now())); }
    expect(other.session.snapshot.route.id).toBe('rt_test');
  });

  it('does not re-offer a declined route during the cooldown', async () => {
    const faster = makeRoute(undefined, undefined, undefined, 20, 'rt_fast');
    const ctx = setup({ checkEta: async () => ({ remainingS: 300, fasterRoute: faster, savingS: 200 }) });
    const { session, tick, now } = ctx;
    const sim = new RouteSimulator(route.polyline6, { speedMs: 4 });
    tick(); await session.onFix(sim.step(now())); await flush();
    session.declineOffer();
    for (let i = 0; i < 70; i++) { tick(); await session.onFix(sim.step(now())); await flush(); }
    expect(session.snapshot.offer).toBeNull(); // a check ran at +60 s but was suppressed
  });

  it('reports the posted speed limit along the route', async () => {
    const limited = { ...route, speedLimits: [{ fromM: 0, toM: 600, kmh: 50 }, { fromM: 600, toM: 1400, kmh: 30 }] };
    const session = new NavigationSession(limited, dest, { now: () => 0, speak: () => undefined, requestReroute: async () => null });
    const sim = new RouteSimulator(limited.polyline6, { speedMs: 10 });
    const seen = new Set<number | null>();
    for (let t = 1000; session.snapshot.phase !== 'arrived' && t < 400_000; t += 1000) {
      seen.add((await session.onFix(sim.step(t))).progress?.speedLimitKmh ?? null);
    }
    expect([...seen]).toEqual([50, 30, null]);
  });
});

describe('car guidance', () => {
  it('summarises the session for a head unit', async () => {
    const { carGuidance, carPlayManeuverType, androidAutoManeuverType } = await import('./car');
    const ctx = setup();
    const sim = new RouteSimulator(route.polyline6, { speedMs: 12 });
    let s = ctx.session.snapshot;
    for (let i = 0; i < 10; i++) { ctx.tick(); s = await ctx.session.onFix(sim.step(ctx.now())); }
    const g = carGuidance(s, 'en', ctx.now());
    expect(g.state).toBe('navigating');
    expect(g.maneuver).toMatchObject({ kind: 'right', icon: 'right', instruction: 'Turn right onto Jabotinsky St', road: 'Jabotinsky St' });
    expect(g.maneuver!.distanceM).toBeGreaterThan(400);
    expect(g.then?.icon).toBe('left');
    expect(g.remainingDistanceM).toBeLessThan(route.distanceM);
    expect(g.etaEpochMs).toBeGreaterThan(ctx.now());
    expect(carGuidance(s, 'he', ctx.now()).maneuver!.distanceText).toMatch(/מ׳|ק״מ/);
    expect([carPlayManeuverType('right'), carPlayManeuverType('arrive')]).toEqual([2, 12]);
    expect([androidAutoManeuverType('right'), androidAutoManeuverType('roundabout'), androidAutoManeuverType('ferry')]).toEqual([8, 45, 37]);
  });
});
