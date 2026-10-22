import type Redis from 'ioredis';
import type { Clock } from '../../common/tokens';

/** Live measured speed on one directed road edge (Valhalla GraphId), written by the traffic worker. */
export interface EdgeSpeed {
  kmh: number;
  samples: number;
  /** epoch ms of the newest sample */
  updatedAt: number;
}

/** Speeds older than this are ignored — traffic changes fast. */
export const LIVE_SPEED_MAX_AGE_MS = 15 * 60_000;
export const TRAFFIC_HASH = 'traffic:live';

export interface TrafficStore {
  getSpeeds(edgeIds: string[]): Promise<Map<string, EdgeSpeed>>;
  /** Used by tests and the in-memory dev setup; production writes come from the worker. */
  setSpeed(edgeId: string, s: EdgeSpeed): Promise<void>;
}

export class MemoryTrafficStore implements TrafficStore {
  private readonly speeds = new Map<string, EdgeSpeed>();
  constructor(private readonly clock: Clock) {}
  async getSpeeds(ids: string[]) {
    const now = this.clock.now();
    const out = new Map<string, EdgeSpeed>();
    for (const id of ids) {
      const s = this.speeds.get(id);
      if (s && now - s.updatedAt <= LIVE_SPEED_MAX_AGE_MS) out.set(id, s);
    }
    return out;
  }
  async setSpeed(id: string, s: EdgeSpeed) {
    this.speeds.set(id, s);
  }
}

/** One Redis hash: field = edge id, value = JSON EdgeSpeed. HMGET prices a whole route in one round trip. */
export class RedisTrafficStore implements TrafficStore {
  constructor(private readonly redis: Redis, private readonly clock: Clock) {}
  async getSpeeds(ids: string[]) {
    const out = new Map<string, EdgeSpeed>();
    if (ids.length === 0) return out;
    const unique = [...new Set(ids)];
    const vals = await this.redis.hmget(TRAFFIC_HASH, ...unique);
    const now = this.clock.now();
    vals.forEach((v, i) => {
      if (!v) return;
      const s = JSON.parse(v) as EdgeSpeed;
      if (now - s.updatedAt <= LIVE_SPEED_MAX_AGE_MS && s.kmh > 0) out.set(unique[i], s);
    });
    return out;
  }
  async setSpeed(id: string, s: EdgeSpeed) {
    await this.redis.hset(TRAFFIC_HASH, id, JSON.stringify(s));
  }
}

/** Hour of week as the traffic worker writes it: UTC, Monday 00:00 = 0 … Sunday 23:00 = 167. */
export function hourOfWeek(epochMs: number): number {
  const d = new Date(epochMs);
  return ((d.getUTCDay() + 6) % 7) * 24 + d.getUTCHours();
}

/** Below this many samples an hourly baseline is too noisy to plan with. */
export const HISTORIC_MIN_SAMPLES = 3;

/** Usual speed per OSM way and hour of week (edge_speeds_hourly), for "best time to leave". */
export interface HistoricSpeedStore {
  /** km/h by way id, for the ways that have a baseline at that hour. */
  getHourly(wayIds: number[], hourOfWeek: number): Promise<Map<number, number>>;
}

export class MemoryHistoricSpeedStore implements HistoricSpeedStore {
  private readonly speeds = new Map<string, number>();
  set(wayId: number, how: number, kmh: number) { this.speeds.set(`${wayId}:${how}`, kmh); }
  async getHourly(wayIds: number[], how: number) {
    const out = new Map<number, number>();
    for (const w of wayIds) {
      const v = this.speeds.get(`${w}:${how}`);
      if (v) out.set(w, v);
    }
    return out;
  }
}

export class PgHistoricSpeedStore implements HistoricSpeedStore {
  constructor(private readonly pg: import('pg').Pool) {}
  async getHourly(wayIds: number[], how: number) {
    const out = new Map<number, number>();
    const ids = [...new Set(wayIds)];
    if (!ids.length) return out;
    const { rows } = await this.pg.query<{ edge_id: string; p50_kmh: number }>(
      `SELECT edge_id, p50_kmh FROM edge_speeds_hourly WHERE edge_id = ANY($1::bigint[]) AND hour_of_week = $2 AND samples >= $3`,
      [ids, how, HISTORIC_MIN_SAMPLES],
    );
    for (const r of rows) if (r.p50_kmh > 0) out.set(Number(r.edge_id), Number(r.p50_kmh));
    return out;
  }
}
