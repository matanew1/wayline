import type { LatLng } from './types';

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function headingDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Point `distM` metres from `p` along `bearing`. */
export function destination(p: LatLng, bearing: number, distM: number): LatLng {
  const d = distM / R, b = rad(bearing), la = rad(p.lat), lo = rad(p.lng);
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return { lat: deg(la2), lng: ((deg(lo2) + 540) % 360) - 180 };
}

export interface SegmentProjection {
  /** 0..1 along the segment */
  t: number;
  point: LatLng;
  /** metres from the input point to the projected point */
  offsetM: number;
}

/**
 * Projects p onto segment a→b using a local equirectangular plane — accurate to
 * centimetres at street scale, and much cheaper than spherical math.
 */
export function projectOnSegment(p: LatLng, a: LatLng, b: LatLng): SegmentProjection {
  const k = Math.cos(rad(a.lat));
  const ax = 0, ay = 0;
  const bx = (b.lng - a.lng) * k, by = b.lat - a.lat;
  const px = (p.lng - a.lng) * k, py = p.lat - a.lat;
  const len2 = bx * bx + by * by;
  let t = len2 === 0 ? 0 : ((px - ax) * bx + (py - ay) * by) / len2;
  t = Math.max(0, Math.min(1, t));
  const point = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
  return { t, point, offsetM: haversineM(p, point) };
}

export function decodePolyline(str: string, precision = 6): LatLng[] {
  const factor = 10 ** precision;
  const out: LatLng[] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const which of [0, 1]) {
      let result = 0, shift = 0, b: number;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d; else lng += d;
    }
    out.push({ lat: lat / factor, lng: lng / factor });
  }
  return out;
}

export function encodePolyline(points: LatLng[], precision = 6): string {
  const factor = 10 ** precision;
  let out = '', pLat = 0, pLng = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1, s = '';
    while (n >= 0x20) { s += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5; }
    return s + String.fromCharCode(n + 63);
  };
  for (const p of points) {
    const la = Math.round(p.lat * factor), lo = Math.round(p.lng * factor);
    out += enc(la - pLat) + enc(lo - pLng);
    pLat = la; pLng = lo;
  }
  return out;
}

// ---------- geohash (matches the API's realtime cells) ----------
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function geohashEncode(lat: number, lng: number, precision = 6): string {
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  let idx = 0, bit = 0, even = true, out = '';
  while (out.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { idx = idx * 2 + 1; lngMin = mid; } else { idx *= 2; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { idx = idx * 2 + 1; latMin = mid; } else { idx *= 2; latMax = mid; }
    }
    even = !even;
    if (++bit === 5) { out += BASE32[idx]; bit = 0; idx = 0; }
  }
  return out;
}

/** The cell containing p plus `ring` rings of neighbours (ring 1 = 3×3, ring 2 = 5×5). */
export function cellsAround(p: LatLng, ring = 2, precision = 6): string[] {
  const bits = precision * 5;
  const dLat = 180 / 2 ** Math.floor(bits / 2);
  const dLng = 360 / 2 ** Math.ceil(bits / 2);
  const out = new Set<string>();
  for (let a = -ring; a <= ring; a++) for (let b = -ring; b <= ring; b++) out.add(geohashEncode(p.lat + a * dLat, p.lng + b * dLng, precision));
  return [...out];
}
