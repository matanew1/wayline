export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6371008.8;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial compass bearing from a to b, 0–360. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Smallest angle between two headings, 0–180. */
export function headingDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// ---------- geohash ----------
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
export const GEOHASH_RE = /^[0123456789bcdefghjkmnpqrstuvwxyz]{1,12}$/;

export function geohashEncode(lat: number, lng: number, precision = 6): string {
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  let idx = 0, bit = 0, evenBit = true, out = '';
  while (out.length < precision) {
    if (evenBit) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { idx = idx * 2 + 1; lngMin = mid; } else { idx = idx * 2; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { idx = idx * 2 + 1; latMin = mid; } else { idx = idx * 2; latMax = mid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) { out += BASE32[idx]; bit = 0; idx = 0; }
  }
  return out;
}

/** Cell size in degrees for a geohash precision. */
export function geohashCellSize(precision: number): { dLat: number; dLng: number } {
  const bits = precision * 5;
  const lngBits = Math.ceil(bits / 2);
  const latBits = Math.floor(bits / 2);
  return { dLat: 180 / 2 ** latBits, dLng: 360 / 2 ** lngBits };
}

/**
 * Geohash cells covering a path plus their 8 neighbours — what a client subscribes to
 * on the realtime gateway so it hears about reports along (and beside) its route.
 */
export function cellsAlongPath(points: LatLng[], precision = 6, stepM = 250): string[] {
  const { dLat, dLng } = geohashCellSize(precision);
  const cells = new Set<string>();
  const addWithNeighbours = (p: LatLng) => {
    for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) {
      const lat = Math.max(-89.999, Math.min(89.999, p.lat + a * dLat));
      cells.add(geohashEncode(lat, p.lng + b * dLng, precision));
    }
  };
  if (points.length === 0) return [];
  addWithNeighbours(points[0]);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const n = Math.max(1, Math.ceil(haversineM(a, b) / stepM));
    for (let k = 1; k <= n; k++) {
      const f = k / n;
      addWithNeighbours({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f });
    }
  }
  return [...cells];
}

// ---------- polyline (precision 6, as Valhalla emits) ----------
export function decodePolyline(str: string, precision = 6): LatLng[] {
  const factor = 10 ** precision;
  const out: LatLng[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < str.length) {
    for (const which of [0, 1]) {
      let result = 0, shift = 0, byte: number;
      do {
        byte = str.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta; else lng += delta;
    }
    out.push({ lat: lat / factor, lng: lng / factor });
  }
  return out;
}

export function encodePolyline(points: LatLng[], precision = 6): string {
  const factor = 10 ** precision;
  let out = '', prevLat = 0, prevLng = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (n >= 0x20) { s += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5; }
    return s + String.fromCharCode(n + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * factor), lng = Math.round(p.lng * factor);
    out += enc(lat - prevLat) + enc(lng - prevLng);
    prevLat = lat; prevLng = lng;
  }
  return out;
}

/** Index of the polyline segment nearest to p (segment i = points[i]→points[i+1]) and the distance to it. */
export function nearestSegment(points: LatLng[], p: LatLng): { index: number; offsetM: number } {
  let best = { index: 0, offsetM: Infinity };
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const k = Math.cos((a.lat * Math.PI) / 180);
    const bx = (b.lng - a.lng) * k, by = b.lat - a.lat;
    const px = (p.lng - a.lng) * k, py = p.lat - a.lat;
    const len2 = bx * bx + by * by;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
    const d = haversineM(p, { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
    if (d < best.offsetM) best = { index: i, offsetM: d };
  }
  return best;
}
