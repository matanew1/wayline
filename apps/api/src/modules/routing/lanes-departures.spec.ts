import { attachLanes, mapOsrmLanes } from './routing.engine';
import { parseOffsets } from './routing.controller';
import { RoutingService, type CachedRoute } from './routing.service';
import { hourOfWeek, MemoryHistoricSpeedStore, MemoryTrafficStore } from './traffic.store';
import type { ManeuverDto } from './routing.dto';

describe('lane guidance', () => {
  // trimmed from Valhalla 3.9 trace_route (format: osrm) on a road tagged turn:lanes=left|through|through;right
  const osrm = {
    matchings: [{ legs: [{ steps: [
      { maneuver: { type: 'depart' }, intersections: [{ location: [34.7705, 32.07] }] },
      { maneuver: { type: 'turn', modifier: 'left' }, intersections: [{ location: [34.774, 32.07], lanes: [
        { indications: ['left'], valid_indication: 'left', valid: true, active: true },
        { indications: ['straight'], valid: false, active: false },
        { indications: ['straight', 'right'], valid: false, active: false },
      ] }] },
    ] }] }],
  };

  it('reads lanes from OSRM-format intersections', () => {
    expect(mapOsrmLanes(osrm)).toEqual([{ at: { lat: 32.07, lng: 34.774 }, lanes: [
      { indications: ['left'], valid: true },
      { indications: ['straight'], valid: false },
      { indications: ['straight', 'right'], valid: false },
    ] }]);
    expect(mapOsrmLanes({})).toEqual([]);
  });

  it('attaches lanes to the maneuver at that intersection only', () => {
    const shape = [{ lat: 32.07, lng: 34.7705 }, { lat: 32.07, lng: 34.774 }, { lat: 32.0715, lng: 34.774 }];
    const m = (kind: ManeuverDto['kind'], i: number): ManeuverDto => ({ kind, instruction: '', streetNames: [], distanceM: 0, durationS: 0, beginShapeIndex: i });
    const out = attachLanes([m('depart', 0), m('left', 1), m('arrive', 2)], shape, mapOsrmLanes(osrm));
    expect(out[0].lanes).toBeUndefined();
    expect(out[1].lanes?.map((l) => l.valid)).toEqual([true, false, false]);
    expect(out[2].lanes).toBeUndefined();
    // all-valid lanes say nothing useful and are dropped; far-away hints don't attach
    const allValid = [{ at: shape[1], lanes: [{ indications: ['straight' as const], valid: true }, { indications: ['straight' as const], valid: true }] }];
    expect(attachLanes([m('left', 1)], shape, allValid)[0].lanes).toBeUndefined();
    const far = [{ at: { lat: 32.08, lng: 34.774 }, lanes: mapOsrmLanes(osrm)[0].lanes }];
    expect(attachLanes([m('left', 1)], shape, far)[0].lanes).toBeUndefined();
  });
});

describe('departures', () => {
  it('parses offsets', () => {
    expect(parseOffsets(undefined)).toEqual([0, 15, 30]);
    expect(parseOffsets('30, 0,30')).toEqual([0, 30]);
    expect(() => parseOffsets('-5')).toThrow();
    expect(() => parseOffsets('1.5')).toThrow();
    expect(() => parseOffsets('181')).toThrow();
  });

  it('matches the worker’s hour of week (UTC, Monday = 0)', () => {
    expect(hourOfWeek(Date.UTC(2026, 9, 19, 0, 30))).toBe(0); // Monday 00:30 UTC
    expect(hourOfWeek(Date.UTC(2026, 9, 21, 7))).toBe(2 * 24 + 7); // Wednesday 07:00
    expect(hourOfWeek(Date.UTC(2026, 9, 25, 23, 59))).toBe(167); // Sunday 23:59
  });

  it('prices later departures with the usual speed for that hour', async () => {
    const now = Date.UTC(2026, 9, 21, 7, 0); // Wednesday 07:00 UTC — rush hour
    const clock = { now: () => now };
    const historic = new MemoryHistoricSpeedStore();
    const live = new MemoryTrafficStore(clock);
    const svc = new RoutingService({} as any, {} as any, live, historic, clock, { routesPlanned: { inc() {} }, trafficLookups: { inc() {} } } as any);
    const edges = [
      { id: 'e1', wayId: 1, lengthM: 1000, speedLimitKmh: 50, freeFlowKmh: 50, beginShapeIndex: 0, endShapeIndex: 1 },
      { id: 'e2', wayId: 2, lengthM: 1000, speedLimitKmh: 50, freeFlowKmh: 50, beginShapeIndex: 1, endShapeIndex: 2 },
    ];
    const route: CachedRoute = { id: 'rt_x', origin: { lat: 0, lng: 0 }, destination: { lat: 0, lng: 0 }, distanceM: 2000, durationS: 144, polyline6: '', edges };
    const how = hourOfWeek(now);
    // jammed at 07:00, clearing by 07:30
    historic.set(1, how, 10); historic.set(2, how, 10);
    historic.set(1, how + 1, 40); historic.set(2, how + 1, 40);
    await live.setSpeed('e1', { kmh: 12, samples: 5, updatedAt: now });

    const [nowDep, at15, at60, at180] = await svc.departures(route, [0, 15, 60, 180]);
    expect(nowDep.basis).toBe('live'); // e1 live, e2 from the 07:00 baseline
    expect(at15).toMatchObject({ offsetMin: 15, basis: 'historic' });
    expect(at60.basis).toBe('historic');
    expect(at60.durationS).toBeLessThan(at15.durationS); // leaving later is faster
    expect(at180).toMatchObject({ basis: 'typical', durationS: 144 }); // no baseline that hour
    expect(Date.parse(at15.departAt)).toBe(now + 15 * 60_000);

    const noEdges = await svc.departures({ ...route, edges: null }, [0]);
    expect(noEdges).toEqual([{ offsetMin: 0, departAt: new Date(now).toISOString(), durationS: 144, basis: 'typical' }]);
  });
});
