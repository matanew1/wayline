import type Redis from 'ioredis';
import type { Pool } from 'pg';
import { haversineM } from '../../common/geo';
import type { Clock } from '../../common/tokens';
import type { Report, ReportType } from './report.rules';

/** Hot store of ACTIVE reports — "what is near me right now". */
export interface ActiveReportStore {
  save(r: Report): Promise<void>;
  get(id: string): Promise<Report | null>;
  remove(id: string): Promise<void>;
  findNear(lat: number, lng: number, radiusM: number, type?: ReportType): Promise<Report[]>;
}

export interface VoteRecord {
  userId: string;
  stillThere: boolean;
}

/**
 * Durable history for analytics, trust scoring and moderation.
 * `record` upserts the report row and (optionally) inserts a vote atomically, so a vote
 * can never land before its report — even when another API replica created the report.
 */
export interface ReportLog {
  record(r: Report, status: 'active' | 'expired', vote?: VoteRecord): Promise<void>;
}

export class MemoryReportStore implements ActiveReportStore {
  private readonly reports = new Map<string, Report>();
  constructor(private readonly clock: Clock) {}

  async save(r: Report) { this.reports.set(r.id, r); }
  async get(id: string) {
    const r = this.reports.get(id);
    if (!r) return null;
    if (r.expiresAt <= this.clock.now()) { this.reports.delete(id); return null; }
    return r;
  }
  async remove(id: string) { this.reports.delete(id); }
  async findNear(lat: number, lng: number, radiusM: number, type?: ReportType) {
    const now = this.clock.now();
    const out: { r: Report; d: number }[] = [];
    for (const r of this.reports.values()) {
      if (r.expiresAt <= now) { this.reports.delete(r.id); continue; }
      if (type && r.type !== type) continue;
      const d = haversineM({ lat, lng }, r);
      if (d <= radiusM) out.push({ r, d });
    }
    return out.sort((a, b) => a.d - b.d).map((x) => x.r);
  }
}

const GEO_KEY = 'reports:geo';
const key = (id: string) => `report:${id}`;

/**
 * Redis: one JSON key per report expiring at report.expiresAt, plus a GEO index of ids.
 * Index entries for expired keys are cleaned lazily during reads.
 */
export class RedisReportStore implements ActiveReportStore {
  constructor(private readonly redis: Redis) {}

  async save(r: Report) {
    await this.redis
      .multi()
      .call('SET', key(r.id), JSON.stringify(r), 'PXAT', String(r.expiresAt))
      .geoadd(GEO_KEY, r.lng, r.lat, r.id)
      .exec();
  }
  async get(id: string) {
    const raw = await this.redis.get(key(id));
    return raw ? (JSON.parse(raw) as Report) : null;
  }
  async remove(id: string) {
    await this.redis.multi().del(key(id)).zrem(GEO_KEY, id).exec();
  }
  async findNear(lat: number, lng: number, radiusM: number, type?: ReportType) {
    const ids = (await this.redis.call(
      'GEOSEARCH', GEO_KEY, 'FROMLONLAT', String(lng), String(lat), 'BYRADIUS', String(radiusM), 'm', 'ASC', 'COUNT', '500',
    )) as string[];
    if (ids.length === 0) return [];
    const raws = await this.redis.mget(ids.map(key));
    const stale: string[] = [];
    const out: Report[] = [];
    raws.forEach((raw, i) => {
      if (!raw) { stale.push(ids[i]); return; }
      const r = JSON.parse(raw) as Report;
      if (!type || r.type === type) out.push(r);
    });
    if (stale.length) await this.redis.zrem(GEO_KEY, ...stale);
    return out;
  }
}

export class MemoryReportLog implements ReportLog {
  readonly events: { id: string; status: string; vote?: VoteRecord }[] = [];
  async record(r: Report, status: 'active' | 'expired', vote?: VoteRecord) {
    this.events.push({ id: r.id, status, vote });
  }
}

export class PgReportLog implements ReportLog {
  constructor(private readonly pg: Pool) {}

  async record(r: Report, status: 'active' | 'expired', vote?: VoteRecord) {
    const client = await this.pg.connect();
    try {
      await client.query('BEGIN');
      // An expired report never flips back to active (replicas may race on the last votes).
      await client.query(
        `INSERT INTO reports (id, type, geom, heading, reporter_id, status, confidence, created_at, expires_at)
         VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5, $6, $7, $8, to_timestamp($9 / 1000.0), to_timestamp($10 / 1000.0))
         ON CONFLICT (id) DO UPDATE SET
           status = CASE WHEN reports.status = 'expired' THEN 'expired' ELSE EXCLUDED.status END,
           confidence = EXCLUDED.confidence, expires_at = EXCLUDED.expires_at, updated_at = now()`,
        [r.id, r.type, r.lng, r.lat, r.heading === null ? null : Math.round(r.heading), r.reporterId, status, r.confidence, r.createdAt, r.expiresAt],
      );
      if (vote) {
        await client.query(
          `INSERT INTO report_votes (report_id, user_id, still_there) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [r.id, vote.userId, vote.stillThere],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }
}
