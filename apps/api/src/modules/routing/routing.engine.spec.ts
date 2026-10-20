import { decodePolyline } from '../../common/geo';
import { mapValhallaTrip, MockRoutingEngine, ValhallaEngine } from './routing.engine';

const valhallaTrip = {
  summary: { time: 845.2, length: 6.214, has_toll: true, has_highway: false, has_ferry: false },
  legs: [
    {
      shape: '_izlhA~rlgdF_{geC~ywl@_kwzCn`{nI',
      maneuvers: [
        { type: 1, instruction: 'Drive north on Herzl Street.', street_names: ['Herzl Street'], length: 0.6, time: 70, begin_shape_index: 0 },
        { type: 10, instruction: 'Turn right onto Jabotinsky Street.', street_names: ['Jabotinsky Street'], length: 5.614, time: 775, begin_shape_index: 1 },
        { type: 4, instruction: 'You have arrived at your destination.', length: 0, time: 0, begin_shape_index: 2 },
      ],
    },
  ],
};

describe('routing engines', () => {
  it('maps a Valhalla trip to the API shape', () => {
    const r = mapValhallaTrip(valhallaTrip);
    expect(r.distanceM).toBe(6214);
    expect(r.durationS).toBe(845);
    expect(r.flags).toEqual(['toll']);
    expect(r.maneuvers.map((m) => m.kind)).toEqual(['depart', 'right', 'arrive']);
    expect(r.maneuvers[2].streetNames).toEqual([]);
  });

  it('calls Valhalla with avoid options and returns [] for "no path"', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error_code: 442, error: 'No path could be found for input' }), { status: 400 }),
    );
    const engine = new ValhallaEngine('http://valhalla');
    const out = await engine.route({ origin: { lat: 32, lng: 34.8 }, destination: { lat: 32.1, lng: 34.9 }, avoid: ['tolls'], language: 'he' });
    expect(out).toEqual([]);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.costing_options.auto.use_tolls).toBe(0);
    expect(body.language).toBe('he-IL');
    expect(body.alternates).toBe(2);
    fetchMock.mockRestore();
  });

  it('returns primary + alternates from Valhalla', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ trip: valhallaTrip, alternates: [{ trip: valhallaTrip }, { trip: valhallaTrip }] }), { status: 200 }),
    );
    const out = await new ValhallaEngine('http://valhalla').route({ origin: { lat: 32, lng: 34.8 }, destination: { lat: 32.1, lng: 34.9 }, avoid: [], language: 'en' });
    expect(out).toHaveLength(3);
    fetchMock.mockRestore();
  });

  it('mock engine returns two decodable routes, fastest first', async () => {
    const out = await new MockRoutingEngine().route({ origin: { lat: 32.08, lng: 34.78 }, destination: { lat: 32.1, lng: 34.81 }, avoid: [], language: 'en' });
    expect(out).toHaveLength(2);
    expect(out[0].durationS).toBeLessThan(out[1].durationS);
    expect(decodePolyline(out[0].polyline6)).toHaveLength(3);
    expect(['left', 'right']).toContain(out[0].maneuvers[1].kind);
  });
});
