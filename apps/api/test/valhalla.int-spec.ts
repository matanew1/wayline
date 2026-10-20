/**
 * Against a real Valhalla built from the synthetic grid in test/fixtures/valhalla (see scripts/valhalla-test.sh).
 * Skipped unless VALHALLA_URL is set.
 */
import { decodePolyline } from '../src/common/geo';
import { ValhallaEngine } from '../src/modules/routing/routing.engine';

const URL = process.env.VALHALLA_URL;
const d = URL ? describe : describe.skip;

d('ValhallaEngine against real Valhalla', () => {
  const engine = new ValhallaEngine(URL!);
  const q = { origin: { lat: 32.0702, lng: 34.7702 }, destination: { lat: 32.0826, lng: 34.7845 }, avoid: [] as const, language: 'en' as const };

  it('returns routes with spoken instructions and street names', async () => {
    const routes = await engine.route({ ...q, avoid: [] });
    expect(routes.length).toBeGreaterThanOrEqual(2);
    const r = routes[0];
    expect(r.maneuvers[0].kind).toBe('depart');
    expect(r.maneuvers.at(-1)!.kind).toBe('arrive');
    expect(r.maneuvers.every((m) => m.instruction.length > 0)).toBe(true);
    expect(r.maneuvers[1].instruction).toMatch(/^Turn (left|right) onto /);
    expect(decodePolyline(r.polyline6).length).toBeGreaterThan(r.maneuvers.length);
  });

  it('localises instructions to Hebrew', async () => {
    const [r] = await engine.route({ ...q, avoid: [], language: 'he' });
    expect(r.maneuvers.at(-1)!.instruction).toBe('הגעת ליעד.');
  });

  it('flags and avoids toll roads (Namir Rd is tagged toll=yes)', async () => {
    const [withToll] = await engine.route({ ...q, avoid: [] });
    const [noToll] = await engine.route({ ...q, avoid: ['tolls'] });
    expect(withToll.flags).toContain('toll');
    expect(noToll.flags).not.toContain('toll');
  });

  it('walks route edges with ids, lengths and speed limits', async () => {
    const [r] = await engine.route({ ...q, avoid: [] });
    const edges = await engine.edges(r.polyline6);
    expect(edges.length).toBeGreaterThan(3);
    const total = edges.reduce((s, e) => s + e.lengthM, 0);
    expect(Math.abs(total - r.distanceM)).toBeLessThan(r.distanceM * 0.05);
    expect(new Set(edges.map((e) => e.speedLimitKmh))).toEqual(expect.objectContaining({}));
    expect(edges.every((e) => /^\d+$/.test(e.id) && e.freeFlowKmh > 0 && e.endShapeIndex > e.beginShapeIndex)).toBe(true);
    expect(edges.map((e) => e.speedLimitKmh)).toEqual(expect.arrayContaining([50]));
  });

  it('returns [] when no route exists', async () => {
    expect(await engine.route({ ...q, avoid: [], destination: { lat: 40.7, lng: -74 } })).toEqual([]);
  });
});
