import { routeReasons, type ReasonRoute } from './route-reasons';
import { makeRoute } from './test-utils';

const jam = { level: 'jam' as const }, slow = { level: 'slow' as const };
const r = (id: string, over: Partial<ReasonRoute> = {}, pts?: Parameters<typeof makeRoute>[0], kinds?: string[]): ReasonRoute =>
  ({ ...makeRoute(pts, kinds, undefined, 12, id), ...over });

describe('routeReasons', () => {
  it('explains options relative to each other', () => {
    const fast = r('a', { traffic: { congestion: [slow] } });
    const jammed = r('b', { traffic: { congestion: [jam, jam] }, flags: ['toll'] });
    const straight = r('c', {}, [{ lat: 32.08, lng: 34.78 }, { lat: 32.09, lng: 34.78 }], ['depart', 'arrive']);
    const [ra, rb, rc] = routeReasons([fast, jammed, straight]);
    expect(ra).toEqual([{ kind: 'avoidsJams' }]);
    expect(rb).toEqual([{ kind: 'jams', count: 2 }, { kind: 'toll' }]);
    expect(rc).toEqual([{ kind: 'avoidsJams' }, { kind: 'fewestTurns' }]);
  });

  it('counts serious reports on the route, worst first', () => {
    const a = r('a');
    const reports = [
      { id: '1', type: 'police', lat: 32.082, lng: 34.78, heading: null }, // not counted (not a slowdown)
      { id: '2', type: 'hazard', lat: 32.082, lng: 34.7801, heading: null },
      { id: '3', type: 'crash', lat: 32.0854, lng: 34.784, heading: null },
      { id: '4', type: 'closure', lat: 32.2, lng: 34.9, heading: null }, // far away
    ];
    expect(routeReasons([a], reports)[0]).toEqual([{ kind: 'reports', count: 2, type: 'crash' }]);
  });

  it('a lone route only states facts', () => {
    expect(routeReasons([r('a', { flags: ['toll'] })])[0]).toEqual([{ kind: 'toll' }]);
    expect(routeReasons([])).toEqual([]);
  });
});
