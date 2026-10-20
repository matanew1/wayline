import { bearingDeg, cellsAlongPath, decodePolyline, encodePolyline, geohashEncode, haversineM, headingDiff } from './geo';

describe('geo', () => {
  it('encodes the reference geohash', () => {
    expect(geohashEncode(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
    expect(geohashEncode(32.0853, 34.7818, 6)).toHaveLength(6);
  });

  it('measures distance (Tel Aviv → Jerusalem ≈ 54 km)', () => {
    const d = haversineM({ lat: 32.0853, lng: 34.7818 }, { lat: 31.7683, lng: 35.2137 });
    expect(d).toBeGreaterThan(53_000);
    expect(d).toBeLessThan(55_000);
  });

  it('computes bearings and heading differences', () => {
    expect(Math.round(bearingDeg({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }))).toBe(0);
    expect(Math.round(bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }))).toBe(90);
    expect(headingDiff(350, 10)).toBe(20);
    expect(headingDiff(90, 270)).toBe(180);
  });

  it('round-trips polyline6', () => {
    const pts = [{ lat: 32.0853, lng: 34.7818 }, { lat: 32.09, lng: 34.79 }, { lat: 31.7683, lng: 35.2137 }];
    const back = decodePolyline(encodePolyline(pts));
    back.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(pts[i].lat, 6);
      expect(p.lng).toBeCloseTo(pts[i].lng, 6);
    });
  });

  it('covers a path with cells including the neighbours of the start', () => {
    const a = { lat: 32.08, lng: 34.78 }, b = { lat: 32.1, lng: 34.8 };
    const cells = cellsAlongPath([a, b]);
    expect(cells).toContain(geohashEncode(a.lat, a.lng, 6));
    expect(cells).toContain(geohashEncode(b.lat, b.lng, 6));
    expect(cells.length).toBeGreaterThanOrEqual(9);
    expect(new Set(cells).size).toBe(cells.length);
  });
});
