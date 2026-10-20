import { BadGatewayException, Logger } from '@nestjs/common';
import { haversineM, LatLng } from '../../common/geo';
import type { PlaceDto } from './places.dto';

export interface GeocodeQuery {
  q: string;
  focus?: LatLng;
  lang: 'he' | 'en';
  limit: number;
}

export interface Geocoder {
  search(query: GeocodeQuery): Promise<PlaceDto[]>;
}

const withDistance = (p: PlaceDto, focus?: LatLng): PlaceDto =>
  focus ? { ...p, distanceM: Math.round(haversineM(focus, p)) } : p;

/** Fixed sample places — lets the app and tests run with no geocoder. */
export class MemoryGeocoder implements Geocoder {
  static readonly PLACES: PlaceDto[] = [
    { id: 'sample:central-station', name: 'Central Bus Station', address: 'Sample place', lat: 32.0565, lng: 34.7795 },
    { id: 'sample:city-hall', name: 'City Hall', address: 'Sample place', lat: 32.0812, lng: 34.7807 },
    { id: 'sample:city-park', name: 'City Park', address: 'Sample place', lat: 32.1006, lng: 34.8085 },
    { id: 'sample:grand-mall', name: 'Grand Mall', address: 'Sample place', lat: 32.0745, lng: 34.7920 },
    { id: 'sample:stadium', name: 'Stadium', address: 'Sample place', lat: 32.1037, lng: 34.8254 },
  ];
  async search({ q, focus, limit }: GeocodeQuery) {
    const needle = q.trim().toLowerCase();
    return MemoryGeocoder.PLACES.filter((p) => p.name.toLowerCase().includes(needle))
      .map((p) => withDistance(p, focus))
      .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0))
      .slice(0, limit);
  }
}

async function getJson(url: string, timeoutMs = 3000): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'wayline-api' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Photon (komoot) — OSM geocoder, simple to self-host; public instance is fine for dev only. */
export class PhotonGeocoder implements Geocoder {
  private readonly log = new Logger('Photon');
  constructor(private readonly baseUrl: string) {}

  async search({ q, focus, lang, limit }: GeocodeQuery) {
    const u = new URL(`${this.baseUrl}/api`);
    u.searchParams.set('q', q);
    u.searchParams.set('limit', String(limit));
    // Photon supports en/de/fr/default; "default" returns local-language names (Hebrew in Israel).
    u.searchParams.set('lang', lang === 'he' ? 'default' : 'en');
    if (focus) { u.searchParams.set('lat', String(focus.lat)); u.searchParams.set('lon', String(focus.lng)); }
    try {
      const body = await getJson(u.toString());
      return (body.features ?? []).map((f: any) => {
        const p = f.properties ?? {};
        const [lng, lat] = f.geometry.coordinates;
        const address = [p.street && [p.street, p.housenumber].filter(Boolean).join(' '), p.city, p.country].filter(Boolean).join(', ');
        return withDistance({ id: `osm:${p.osm_type}${p.osm_id}`, name: p.name ?? address, address, lat, lng }, focus);
      });
    } catch (e) {
      this.log.warn(`search failed: ${(e as Error).message}`);
      throw new BadGatewayException('Search is temporarily unavailable');
    }
  }
}

/** Pelias — heavier to run, better ranking and address parsing. */
export class PeliasGeocoder implements Geocoder {
  private readonly log = new Logger('Pelias');
  constructor(private readonly baseUrl: string) {}

  async search({ q, focus, lang, limit }: GeocodeQuery) {
    const u = new URL(`${this.baseUrl}/v1/autocomplete`);
    u.searchParams.set('text', q);
    u.searchParams.set('size', String(limit));
    u.searchParams.set('lang', lang);
    if (focus) { u.searchParams.set('focus.point.lat', String(focus.lat)); u.searchParams.set('focus.point.lon', String(focus.lng)); }
    try {
      const body = await getJson(u.toString());
      return (body.features ?? []).map((f: any) => {
        const [lng, lat] = f.geometry.coordinates;
        return withDistance({ id: f.properties.gid, name: f.properties.name, address: f.properties.label, lat, lng }, focus);
      });
    } catch (e) {
      this.log.warn(`search failed: ${(e as Error).message}`);
      throw new BadGatewayException('Search is temporarily unavailable');
    }
  }
}
