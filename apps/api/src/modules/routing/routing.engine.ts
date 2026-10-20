import { BadGatewayException, Logger } from '@nestjs/common';
import { bearingDeg, encodePolyline, haversineM, headingDiff, LatLng } from '../../common/geo';
import type { AvoidOption, ManeuverDto, ManeuverKind, RouteFlag } from './routing.dto';

export interface RouteQuery {
  origin: LatLng;
  destination: LatLng;
  avoid: AvoidOption[];
  language: 'he' | 'en';
}

/** Engine output before the API adds ids and subscription cells. */
export interface EngineRoute {
  polyline6: string;
  durationS: number;
  distanceM: number;
  maneuvers: ManeuverDto[];
  flags: RouteFlag[];
}

export interface RoutingEngine {
  /** Best route first, up to 3. Empty array = no route exists. */
  route(q: RouteQuery): Promise<EngineRoute[]>;
}

// ---------- Valhalla ----------

/** Valhalla maneuver type → our kind. https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/ */
const VALHALLA_KIND: Record<number, ManeuverKind> = {
  1: 'depart', 2: 'depart', 3: 'depart',
  4: 'arrive', 5: 'arrive', 6: 'arrive',
  7: 'continue', 8: 'continue', 22: 'continue',
  9: 'slight_right', 10: 'right', 11: 'sharp_right',
  12: 'uturn', 13: 'uturn',
  14: 'sharp_left', 15: 'left', 16: 'slight_left',
  17: 'ramp', 18: 'ramp', 19: 'ramp',
  20: 'exit', 21: 'exit',
  23: 'keep_right', 24: 'keep_left',
  25: 'merge', 37: 'merge', 38: 'merge',
  26: 'roundabout', 27: 'roundabout',
  28: 'ferry', 29: 'ferry',
};

export function mapValhallaTrip(trip: any): EngineRoute {
  const leg = trip.legs[0];
  const flags: RouteFlag[] = [];
  if (trip.summary.has_toll) flags.push('toll');
  if (trip.summary.has_highway) flags.push('highway');
  if (trip.summary.has_ferry) flags.push('ferry');
  return {
    polyline6: leg.shape,
    durationS: Math.round(trip.summary.time),
    distanceM: Math.round(trip.summary.length * 1000),
    flags,
    maneuvers: leg.maneuvers.map((m: any) => ({
      kind: VALHALLA_KIND[m.type] ?? 'continue',
      instruction: m.instruction,
      streetNames: m.street_names ?? [],
      distanceM: Math.round(m.length * 1000),
      durationS: Math.round(m.time),
      beginShapeIndex: m.begin_shape_index,
    })),
  };
}

export class ValhallaEngine implements RoutingEngine {
  private readonly log = new Logger('Valhalla');
  constructor(private readonly baseUrl: string, private readonly timeoutMs = 5000) {}

  async route(q: RouteQuery): Promise<EngineRoute[]> {
    const body = {
      locations: [
        { lat: q.origin.lat, lon: q.origin.lng, type: 'break' },
        { lat: q.destination.lat, lon: q.destination.lng, type: 'break' },
      ],
      costing: 'auto',
      costing_options: {
        auto: {
          use_tolls: q.avoid.includes('tolls') ? 0 : 0.5,
          use_highways: q.avoid.includes('highways') ? 0 : 1,
          use_ferry: q.avoid.includes('ferries') ? 0 : 0.5,
        },
      },
      alternates: 2,
      units: 'kilometers',
      language: q.language === 'he' ? 'he-IL' : 'en-US',
      directions_type: 'maneuvers',
    };
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      this.log.error(`unreachable: ${(e as Error).message}`);
      throw new BadGatewayException('Routing is temporarily unavailable');
    }
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      // 442 = no path found, 171 = no suitable edges near location
      if ([442, 171, 154].includes(json.error_code)) return [];
      this.log.error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
      throw new BadGatewayException('Routing failed');
    }
    const trips = [json.trip, ...(json.alternates ?? []).map((a: any) => a.trip)].filter(Boolean);
    return trips.slice(0, 3).map(mapValhallaTrip);
  }
}

// ---------- Mock (dev/tests, no map data needed) ----------

const MOCK_SPEED_MS = 40 / 3.6;

function turnKind(fromBearing: number, toBearing: number): ManeuverKind {
  const delta = ((toBearing - fromBearing + 540) % 360) - 180; // -180..180, positive = clockwise = right
  if (Math.abs(delta) < 20) return 'continue';
  return delta > 0 ? 'right' : 'left';
}

/** Two L-shaped routes through the corners of the origin/destination box. */
export class MockRoutingEngine implements RoutingEngine {
  async route(q: RouteQuery): Promise<EngineRoute[]> {
    if (haversineM(q.origin, q.destination) < 5) return [];
    const corners: LatLng[] = [
      { lat: q.destination.lat, lng: q.origin.lng },
      { lat: q.origin.lat, lng: q.destination.lng },
    ];
    return corners.map((corner, i) => {
      const pts = [q.origin, corner, q.destination];
      const d1 = haversineM(pts[0], pts[1]);
      const d2 = haversineM(pts[1], pts[2]);
      const slow = i === 0 ? 1 : 1.15;
      const b1 = bearingDeg(pts[0], pts[1]);
      const b2 = bearingDeg(pts[1], pts[2]);
      const turn = headingDiff(b1, b2) < 1 ? 'continue' : turnKind(b1, b2);
      const t = (m: number) => Math.round((m / MOCK_SPEED_MS) * slow);
      const maneuvers: ManeuverDto[] = [
        { kind: 'depart', instruction: 'Drive along Sample Street.', streetNames: ['Sample Street'], distanceM: Math.round(d1), durationS: t(d1), beginShapeIndex: 0 },
        { kind: turn, instruction: `Turn ${turn === 'left' ? 'left' : 'right'} onto Mock Avenue.`, streetNames: ['Mock Avenue'], distanceM: Math.round(d2), durationS: t(d2), beginShapeIndex: 1 },
        { kind: 'arrive', instruction: 'You have arrived at your destination.', streetNames: [], distanceM: 0, durationS: 0, beginShapeIndex: 2 },
      ];
      return {
        polyline6: encodePolyline(pts),
        distanceM: Math.round(d1 + d2),
        durationS: t(d1 + d2),
        maneuvers,
        flags: [] as RouteFlag[],
      };
    });
  }
}
