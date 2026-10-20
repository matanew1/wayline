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
