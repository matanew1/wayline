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
  /** As the driver named the destination (place name); null when unknown. */
  destinationName: string | null;
  status: TripStatus;
  startedAt: Date;
  endedAt: Date | null;
}

export type NewTrip = Pick<Trip, 'userId' | 'routeId' | 'origin' | 'destination' | 'distanceM'> & { destinationName?: string | null };

export interface TripStats {
  /** Finished drives. */
  trips: number;
  distanceM: number;
}

export interface TripsRepository {
  create(t: NewTrip): Promise<Trip>;
  findForUser(userId: string, id: string): Promise<Trip | null>;
  update(id: string, patch: Partial<Pick<Trip, 'routeId' | 'status' | 'endedAt' | 'distanceM'>>): Promise<Trip>;
  /** Most recent finished drives first. */
  listFinished(userId: string, limit: number): Promise<Trip[]>;
  stats(userId: string): Promise<TripStats>;
  /** Trips hold origins and destinations — personal data, deleted with the account. */
  removeAll(userId: string): Promise<number>;
}

export class MemoryTripsRepository implements TripsRepository {
  private readonly trips = new Map<string, Trip>();
  async create(t: NewTrip) {
    const trip: Trip = { ...t, destinationName: t.destinationName ?? null, id: randomUUID(), status: 'active', startedAt: new Date(), endedAt: null };
    this.trips.set(trip.id, trip);
    return trip;
  }
  async findForUser(userId: string, id: string) {
    const t = this.trips.get(id);
    return t && t.userId === userId ? t : null;
  }
  async listFinished(userId: string, limit: number) {
    return [...this.trips.values()]
      .filter((t) => t.userId === userId && t.status === 'finished')
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }
  async stats(userId: string) {
    const done = [...this.trips.values()].filter((t) => t.userId === userId && t.status === 'finished');
    return { trips: done.length, distanceM: done.reduce((s, t) => s + t.distanceM, 0) };
  }
  async removeAll(userId: string) {
    let n = 0;
    for (const [id, t] of this.trips) if (t.userId === userId) { this.trips.delete(id); n++; }
    return n;
  }
  async update(id: string, patch: Partial<Trip>) {
    const t = { ...this.trips.get(id)!, ...patch };
    this.trips.set(id, t);
    return t;
  }
}

const COLS = `id, user_id, route_id, distance_m, destination_name, status, started_at, ended_at,
  ST_Y(origin::geometry) AS o_lat, ST_X(origin::geometry) AS o_lng,
  ST_Y(destination::geometry) AS d_lat, ST_X(destination::geometry) AS d_lng`;
const mapRow = (r: any): Trip => ({
  id: r.id, userId: r.user_id, routeId: r.route_id, distanceM: r.distance_m, destinationName: r.destination_name ?? null, status: r.status,
  startedAt: r.started_at, endedAt: r.ended_at,
  origin: { lat: r.o_lat, lng: r.o_lng }, destination: { lat: r.d_lat, lng: r.d_lng },
});

export class PgTripsRepository implements TripsRepository {
  constructor(private readonly pg: Pool) {}

  async create(t: NewTrip) {
    const { rows } = await this.pg.query(
      `INSERT INTO trips (user_id, route_id, distance_m, destination_name, origin, destination)
       VALUES ($1, $2, $3, $8, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography)
       RETURNING ${COLS}`,
      [t.userId, t.routeId, t.distanceM, t.origin.lng, t.origin.lat, t.destination.lng, t.destination.lat, t.destinationName ?? null],
    );
    return mapRow(rows[0]);
  }
  async listFinished(userId: string, limit: number) {
    const { rows } = await this.pg.query(
      `SELECT ${COLS} FROM trips WHERE user_id = $1 AND status = 'finished' ORDER BY started_at DESC LIMIT $2`, [userId, limit]);
    return rows.map(mapRow);
  }
  async stats(userId: string) {
    const { rows } = await this.pg.query<{ n: string; m: string | null }>(
      `SELECT count(*) AS n, sum(distance_m) AS m FROM trips WHERE user_id = $1 AND status = 'finished'`, [userId]);
    return { trips: Number(rows[0].n), distanceM: Number(rows[0].m ?? 0) };
  }
  async removeAll(userId: string) {
    const res = await this.pg.query(`DELETE FROM trips WHERE user_id = $1`, [userId]);
    return res.rowCount ?? 0;
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
