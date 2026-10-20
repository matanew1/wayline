import { destination, haversineM } from './geo';
import { formatDistance, spokenDistance } from './format';
import { ProbeBuffer, type SendResult } from './probe-buffer';
import { ReportAlertPlanner } from './report-alerts';
import { RouteGeometry } from './route-geometry';
import { RouteTracker } from './route-tracker';
import { RouteSimulator } from './simulator';
import { makeRoute } from './test-utils';
import type { Fix, ReportLike } from './types';
import { VoicePlanner } from './voice-planner';

const route = makeRoute();

function drive(tracker: RouteTracker, sim: RouteSimulator, maxSteps = 500) {
  const out: ReturnType<RouteTracker['update']>[] = [];
  let t = 0;
  for (let i = 0; i < maxSteps; i++) {
    t += 1000;
    const p = tracker.update(sim.step(t));
    out.push(p);
    if (p.arrived) break;
  }
  return out;
}

describe('RouteGeometry', () => {
  const g = new RouteGeometry(route.polyline6);
  it('measures and interpolates', () => {
    expect(g.lengthM).toBeGreaterThan(1850);
    expect(g.lengthM).toBeLessThan(1950);
    const mid = g.pointAt(300);
    expect(haversineM(mid.point, g.points[0])).toBeCloseTo(300, 0);
    expect(Math.round(mid.bearing)).toBe(0);
  });
  it('projects a point beside the road', () => {
    const beside = destination(g.pointAt(1000).point, 0, 20); // 20 m north of the east-bound leg
    const pr = g.project(beside);
    expect(pr.segIndex).toBe(1);
    expect(pr.offsetM).toBeCloseTo(20, 0);
    expect(pr.distanceAlongM).toBeCloseTo(1000, -1);
  });
});

describe('RouteTracker', () => {
  it('follows the drive: maneuvers advance, distances fall, then arrives', () => {
    const ps = drive(new RouteTracker(route), new RouteSimulator(route.polyline6, { speedMs: 12, noiseM: 6 }));
    const last = ps[ps.length - 1];
    expect(last.arrived).toBe(true);
    expect(ps.some((p) => p.offRoute)).toBe(false);
    const order = [...new Set(ps.map((p) => p.nextManeuverIndex))];
    expect(order).toEqual([1, 2, 3]);
    expect(ps[0].currentStreet).toBe('Herzl St');
    // ETA falls roughly linearly
    expect(ps[0].durationRemainingS).toBeGreaterThan(ps[Math.floor(ps.length / 2)].durationRemainingS);
    expect(ps[Math.floor(ps.length / 2)].durationRemainingS).toBeGreaterThan(last.durationRemainingS);
    // distance to the first turn decreases while it's the next maneuver
    const first = ps.filter((p) => p.nextManeuverIndex === 1).map((p) => p.distanceToManeuverM);
    expect(first[0]).toBeGreaterThan(first[first.length - 1]);
  });

  it('declares off-route only after sustained deviation', () => {
    const tracker = new RouteTracker(route);
    const ps = drive(tracker, new RouteSimulator(route.polyline6, { leaveRouteAtM: 300, speedMs: 12 }), 60);
    const firstOff = ps.findIndex((p) => p.offRoute);
    const firstNotOn = ps.findIndex((p) => !p.onRoute);
    expect(firstOff).toBeGreaterThan(0);
    expect(firstOff - firstNotOn).toBe(2); // 3 consecutive fixes
    // progress is frozen while off route
    expect(ps[firstOff].distanceAlongM).toBeCloseTo(ps[firstNotOn - 1].distanceAlongM, -1);
  });

  it('treats driving against the route as off-route', () => {
    const tracker = new RouteTracker(route);
    const g = new RouteGeometry(route.polyline6);
    let off = false;
    for (let i = 0; i < 5; i++) {
      const p = destination(g.pointAt(400 - i * 12).point, 90, 20);
      off = tracker.update({ t: i * 1000, ...p, speed: 12, heading: 180, acc: 5 }).offRoute;
    }
    expect(off).toBe(true);
  });

  it('does not let GPS jitter move progress backwards', () => {
    const tracker = new RouteTracker(route);
    const g = new RouteGeometry(route.polyline6);
    const a = tracker.update({ t: 0, ...g.pointAt(500).point, acc: 5 });
    const b = tracker.update({ t: 1000, ...g.pointAt(470).point, acc: 5 });
    expect(b.distanceAlongM).toBeGreaterThanOrEqual(a.distanceAlongM - 5);
  });
});

describe('VoicePlanner', () => {
  function spokenOver(speedMs: number, r = route) {
    const tracker = new RouteTracker(r);
    const voice = new VoicePlanner(r.maneuvers);
    const sim = new RouteSimulator(r.polyline6, { speedMs });
    const said: string[] = [];
    for (let t = 1000; !sim.done && t < 1e6; t += 1000) {
      const p = tracker.update(sim.step(t));
      const s = voice.update(p, speedMs, (i) => tracker.maneuverDistance(i + 1) - tracker.maneuverDistance(i));
      if (s) said.push(s);
      if (p.arrived) break;
    }
    return said;
  }

  it('announces each turn early and at the turn, once, then arrival', () => {
    const said = spokenOver(12);
    // city speed: far (~400 m), near (~10 s ahead), now — in that order
    const jab = said.filter((s) => s.toLowerCase().includes('turn right onto jabotinsky st'));
    expect(jab).toEqual(['In 400 meters, turn right onto Jabotinsky St', 'In 100 meters, turn right onto Jabotinsky St', 'Turn right onto Jabotinsky St']);
    expect(said.filter((s) => s.includes('Rothschild Blvd'))).toHaveLength(3);
    expect(said[said.length - 1]).toBe('You have arrived at your destination');
    expect(said.filter((s) => s.includes('arrived'))).toHaveLength(1);
    expect(said).toContain('Your destination is in 100 meters');
    expect(said.some((s) => /^In .*arrived/.test(s))).toBe(false);
    expect(new Set(said).size).toBe(said.length);
  });

  it('adds a "far" warning on long fast stretches', () => {
    const long = makeRoute([{ lat: 32, lng: 34.8 }, { lat: 32.05, lng: 34.8 }, { lat: 32.05, lng: 34.83 }]);
    const said = spokenOver(25, long);
    expect(said.some((s) => s.startsWith('In 2 kilometers'))).toBe(true);
  });

  it('formats spoken and displayed distances', () => {
    expect(spokenDistance(347)).toBe('300 meters');
    expect(spokenDistance(130)).toBe('150 meters');
    expect(spokenDistance(42)).toBe('40 meters');
    expect(spokenDistance(1000)).toBe('1 kilometer');
    expect(spokenDistance(1540)).toBe('1.5 kilometers');
    expect(spokenDistance(300, 'he')).toBe('300 מטר');
    expect(formatDistance(1234)).toBe('1.2 km');
    expect(formatDistance(347)).toBe('350 m');
  });
});

describe('ReportAlertPlanner', () => {
  const g = new RouteGeometry(route.polyline6);
  const at = (d: number, offset = 0, heading: number | null = null, id = `r${d}`): ReportLike => ({
    id, type: 'police', heading, ...destination(g.pointAt(d).point, g.pointAt(d).bearing + 90, offset),
  });

  it('picks the nearest relevant report ahead', () => {
    const p = new ReportAlertPlanner(g);
    const reports = [at(100, 0, null, 'behind'), at(450, 10, 0, 'ahead'), at(600, 10, null, 'further'), at(420, 200, null, 'off-corridor'), at(430, 0, 180, 'opposite')];
    // 15 m/s → 450 m lookahead
    expect(p.next(200, 15, reports)?.report.id).toBe('ahead');
    p.dismiss('ahead');
    expect(p.next(200, 15, reports)?.report.id).toBe('further');
  });

  it('scales lookahead with speed', () => {
    const p = new ReportAlertPlanner(g);
    const reports = [at(1300)];
    expect(p.next(0, 8, reports)).toBeNull(); // 300 m lookahead at low speed
    expect(p.next(0, 30, reports)).toBeNull(); // 900 m
    expect(p.next(0, 50, reports)?.distanceAheadM).toBeCloseTo(1300, -1); // capped at 1500 m
  });
});

describe('ProbeBuffer', () => {
  const origin = { lat: 32.08, lng: 34.78 };
  const dest = { lat: 32.0899, lng: 34.7885 };
  const g = new RouteGeometry(route.polyline6);
  const fixAt = (d: number, t: number): Fix => ({ t, ...g.pointAt(d).point, acc: 5 });

  it('trims the start and end of the trip and batches uploads', async () => {
    let now = 0;
    const batches: Fix[][] = [];
    const b = new ProbeBuffer({ origin, destination: dest, now: () => now, send: async (f) => { batches.push(f); return 'ok'; } });
    for (let d = 0; d <= g.lengthM; d += 10) { now += 1000; b.add(fixAt(d, now)); await b.maybeFlush(); }
    await b.flush();
    const all = batches.flat();
    expect(all.every((f) => haversineM(f, origin) >= 300 && haversineM(f, dest) >= 300)).toBe(true);
    expect(all.length).toBeGreaterThan(100);
    expect(batches.length).toBeGreaterThan(5); // ~every 10 s
    expect(b.size).toBe(0);
  });

  it('backs off on retry and stops on drop', async () => {
    let now = 0;
    const results: SendResult[] = ['retry', 'retry', 'ok', 'drop'];
    const attempts: number[] = [];
    const b = new ProbeBuffer({ origin, destination: dest, trimM: 0, now: () => now, send: async () => { attempts.push(now); return results.shift()!; } });
    for (let i = 0; i < 120; i++) {
      now += 1000;
      b.add(fixAt(400 + i, now));
      await b.maybeFlush();
    }
    expect(attempts[1] - attempts[0]).toBeGreaterThanOrEqual(10_000); // max(flush interval, 5 s backoff)
    expect(attempts[2] - attempts[1]).toBeGreaterThanOrEqual(10_000);
    expect(b.isStopped).toBe(true);
    expect(b.size).toBe(0);
  });

  it('drops inaccurate fixes', () => {
    const b = new ProbeBuffer({ origin, destination: dest, trimM: 0, now: () => 0, send: async () => 'ok' });
    b.add({ ...fixAt(500, 0), acc: 80 });
    expect(b.size).toBe(0);
  });
});

describe('geohash', () => {
  it('matches the reference encoding used by the API', async () => {
    const { geohashEncode, cellsAround } = await import('./geo');
    expect(geohashEncode(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
    expect(cellsAround({ lat: 32.08, lng: 34.78 }, 1)).toHaveLength(9);
  });
});
