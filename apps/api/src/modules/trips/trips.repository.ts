import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { LatLng } from '../../common/geo';
import type { TripStatus } from './trips.dto';

export interface Trip {
  id: string;
  userId: string;
  routeId: string;
  origin: LatLng;
  destination: LatLng;
  distanceM: number;
  status: TripStatus;
  startedAt: Date;
  endedAt: Date | null;
}

export type NewTrip = Pick<Trip, 'userId' | 'routeId' | 'origin' | 'destination' | 'distanceM'>;

export interface TripsRepository {
  create(t: NewTrip): Promise<Trip>;
  findForUser(userId: string, id: string): Promise<Trip | null>;
  update(id: string, patch: Partial<Pick<Trip, 'routeId' | 'status' | 'endedAt' | 'distanceM'>>): Promise<Trip>;
}

export class MemoryTripsRepository implements TripsRepository {
  private readonly trips = new Map<string, Trip>();
  async create(t: NewTrip) {
    const trip: Trip = { ...t, id: randomUUID(), status: 'active', startedAt: new Date(), endedAt: null };
    this.trips.set(trip.id, trip);
    return trip;
  }
  async findForUser(userId: string, id: string) {
    const t = this.trips.get(id);
    return t && t.userId === userId ? t : null;
  }
  async update(id: string, patch: Partial<Trip>) {
    const t = { ...this.trips.get(id)!, ...patch };
    this.trips.set(id, t);
    return t;
  }
}

const COLS = `id, user_id, route_id, distance_m, status, started_at, ended_at,
  ST_Y(origin::geometry) AS o_lat, ST_X(origin::geometry) AS o_lng,
  ST_Y(destination::geometry) AS d_lat, ST_X(destination::geometry) AS d_lng`;
const mapRow = (r: any): Trip => ({
  id: r.id, userId: r.user_id, routeId: r.route_id, distanceM: r.distance_m, status: r.status,
  startedAt: r.started_at, endedAt: r.ended_at,
  origin: { lat: r.o_lat, lng: r.o_lng }, destination: { lat: r.d_lat, lng: r.d_lng },
});

export class PgTripsRepository implements TripsRepository {
  constructor(private readonly pg: Pool) {}

  async create(t: NewTrip) {
    const { rows } = await this.pg.query(
      `INSERT INTO trips (user_id, route_id, distance_m, origin, destination)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography)
       RETURNING ${COLS}`,
      [t.userId, t.routeId, t.distanceM, t.origin.lng, t.origin.lat, t.destination.lng, t.destination.lat],
    );
    return mapRow(rows[0]);
  }
  async findForUser(userId: string, id: string) {
    const { rows } = await this.pg.query(`SELECT ${COLS} FROM trips WHERE id = $1 AND user_id = $2`, [id, userId]);
    return rows[0] ? mapRow(rows[0]) : null;
  }
  async update(id: string, patch: Partial<Pick<Trip, 'routeId' | 'status' | 'endedAt' | 'distanceM'>>) {
    const { rows } = await this.pg.query(
      `UPDATE trips SET
         route_id = COALESCE($2, route_id),
         status = COALESCE($3, status),
         ended_at = COALESCE($4, ended_at),
         distance_m = COALESCE($5, distance_m)
       WHERE id = $1 RETURNING ${COLS}`,
      [id, patch.routeId ?? null, patch.status ?? null, patch.endedAt ?? null, patch.distanceM ?? null],
    );
    return mapRow(rows[0]);
  }
}
