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
