import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { PlaceKind, SavedPlaceDto, SavePlaceDto } from './places.dto';

export const MAX_FAVOURITES = 50;

export interface SavedPlacesRepository {
  list(userId: string): Promise<SavedPlaceDto[]>;
  /** home/work replace the existing one; fav appends. */
  save(userId: string, place: SavePlaceDto): Promise<SavedPlaceDto>;
  countFavourites(userId: string): Promise<number>;
  remove(userId: string, id: string): Promise<boolean>;
}

const isSingleton = (k: PlaceKind) => k === 'home' || k === 'work';

export class MemorySavedPlacesRepository implements SavedPlacesRepository {
  private readonly rows = new Map<string, (SavedPlaceDto & { userId: string })[]>();

  private of(userId: string) {
    if (!this.rows.has(userId)) this.rows.set(userId, []);
    return this.rows.get(userId)!;
  }
  async list(userId: string) {
    return this.of(userId).map(({ userId: _u, ...p }) => p);
  }
  async save(userId: string, p: SavePlaceDto) {
    const list = this.of(userId);
    const existing = isSingleton(p.kind) ? list.find((x) => x.kind === p.kind) : undefined;
    const row = { id: existing?.id ?? randomUUID(), userId, kind: p.kind, name: p.name, address: p.address, lat: p.lat, lng: p.lng };
    if (existing) list.splice(list.indexOf(existing), 1, row); else list.push(row);
    const { userId: _u, ...out } = row;
    return out;
  }
  async countFavourites(userId: string) {
    return this.of(userId).filter((p) => p.kind === 'fav').length;
  }
  async remove(userId: string, id: string) {
    const list = this.of(userId);
    const i = list.findIndex((p) => p.id === id);
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  }
}

const SELECT = `id, kind, name, address, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng`;
const mapRow = (r: any): SavedPlaceDto => ({ id: r.id, kind: r.kind, name: r.name, address: r.address ?? undefined, lat: r.lat, lng: r.lng });

export class PgSavedPlacesRepository implements SavedPlacesRepository {
  constructor(private readonly pg: Pool) {}

  async list(userId: string) {
    const { rows } = await this.pg.query(`SELECT ${SELECT} FROM saved_places WHERE user_id = $1 ORDER BY kind, created_at`, [userId]);
    return rows.map(mapRow);
  }
  async save(userId: string, p: SavePlaceDto) {
    const params = [userId, p.kind, p.name, p.address ?? null, p.lng, p.lat];
    const values = `($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography)`;
    const sql = isSingleton(p.kind)
      ? `INSERT INTO saved_places (user_id, kind, name, address, geom) VALUES ${values}
         ON CONFLICT (user_id, kind) WHERE kind IN ('home', 'work')
         DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address, geom = EXCLUDED.geom
         RETURNING ${SELECT}`
      : `INSERT INTO saved_places (user_id, kind, name, address, geom) VALUES ${values} RETURNING ${SELECT}`;
    const { rows } = await this.pg.query(sql, params);
    return mapRow(rows[0]);
  }
  async countFavourites(userId: string) {
    const { rows } = await this.pg.query(`SELECT count(*)::int AS n FROM saved_places WHERE user_id = $1 AND kind = 'fav'`, [userId]);
    return rows[0].n as number;
  }
  async remove(userId: string, id: string) {
    const res = await this.pg.query(`DELETE FROM saved_places WHERE user_id = $1 AND id = $2`, [userId, id]);
    return (res.rowCount ?? 0) > 0;
  }
}
