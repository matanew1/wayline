import { edgeAtShapeIndex, priceRoute, type RouteEdge } from './traffic.pricing';

const edge = (i: number, over: Partial<RouteEdge> = {}): RouteEdge => ({
  id: `e${i}`, wayId: i, lengthM: 500, speedLimitKmh: 50, freeFlowKmh: 50, beginShapeIndex: i, endShapeIndex: i + 1, ...over,
});
// 4 × 500 m at 50 km/h = 144 s of edge time; the router says 180 s (turns, lights)
const route = { durationS: 180, distanceM: 2000 };
const edges = [edge(0), edge(1), edge(2, { speedLimitKmh: 70, freeFlowKmh: 70 }), edge(3, { speedLimitKmh: null })];
const at = (now = Date.now()) => ({ samples: 5, updatedAt: now });

describe('priceRoute', () => {
  it('keeps the router estimate when there is no live data', () => {
    const p = priceRoute(route, edges, new Map());
    expect(p.durationS).toBe(180);
    expect(p.baseDurationS).toBe(180);
    expect(p.liveEdges).toBe(0);
    expect(p.congestion).toEqual([]);
  });

  it('merges speed-limit spans and leaves gaps for unknown limits', () => {
    expect(priceRoute(route, edges, new Map()).speedLimits).toEqual([
      { fromM: 0, toM: 1000, kmh: 50 },
      { fromM: 1000, toM: 1500, kmh: 70 },
    ]);
  });

  it('slows the route in proportion to measured speeds and marks congestion', () => {
    const speeds = new Map([['e0', { kmh: 15, ...at() }], ['e1', { kmh: 30, ...at() }]]);
    const p = priceRoute(route, edges, speeds);
    expect(p.durationS).toBeGreaterThan(180);
    expect(p.liveEdges).toBe(2);
    expect(p.congestion).toEqual([{ fromM: 0, toM: 500, level: 'jam' }, { fromM: 500, toM: 1000, level: 'slow' }]);
  });

  it('caps implausibly fast measurements', () => {
    const p = priceRoute(route, edges, new Map([['e0', { kmh: 500, ...at() }]]));
    expect(p.durationS).toBeGreaterThan(150);
  });

  it('prices only the remainder from a given edge', () => {
    const p = priceRoute(route, edges, new Map(), 2);
    expect(p.totalEdges).toBe(2);
    expect(p.baseDurationS).toBeLessThan(90);
    expect(p.speedLimits).toEqual([{ fromM: 1000, toM: 1500, kmh: 70 }]);
    expect(edgeAtShapeIndex(edges, 2)).toBe(2);
    expect(edgeAtShapeIndex(edges, 99)).toBe(4);
  });
});
