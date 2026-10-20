import type Redis from 'ioredis';
import type { Clock } from './tokens';

/** Small key/value port used for OTPs, rate limits, idempotency keys, route cache, probe tokens. */
export interface KvStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlS: number): Promise<void>;
  /** Returns true when the key was created (did not exist). */
  setIfAbsent(key: string, value: string, ttlS: number): Promise<boolean>;
  del(key: string): Promise<void>;
  /** Increments a counter; the TTL starts with the first increment. */
  incr(key: string, ttlS: number): Promise<number>;
  ttl(key: string): Promise<number>;
}

export class MemoryKvStore implements KvStore {
  private readonly map = new Map<string, { v: string; exp: number }>();
  constructor(private readonly clock: Clock) {}

  private live(key: string) {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.exp <= this.clock.now()) { this.map.delete(key); return undefined; }
    return e;
  }
  async get(key: string) { return this.live(key)?.v ?? null; }
  async set(key: string, value: string, ttlS: number) {
    this.map.set(key, { v: value, exp: this.clock.now() + ttlS * 1000 });
  }
  async setIfAbsent(key: string, value: string, ttlS: number) {
    if (this.live(key)) return false;
    await this.set(key, value, ttlS);
    return true;
  }
  async del(key: string) { this.map.delete(key); }
  async incr(key: string, ttlS: number) {
    const e = this.live(key);
    if (!e) { await this.set(key, '1', ttlS); return 1; }
    e.v = String(Number(e.v) + 1);
    return Number(e.v);
  }
  async ttl(key: string) {
    const e = this.live(key);
    return e ? Math.ceil((e.exp - this.clock.now()) / 1000) : -2;
  }
}

export class RedisKvStore implements KvStore {
  constructor(private readonly redis: Redis) {}
  get(key: string) { return this.redis.get(key); }
  async set(key: string, value: string, ttlS: number) { await this.redis.set(key, value, 'EX', ttlS); }
  async setIfAbsent(key: string, value: string, ttlS: number) {
    return (await this.redis.set(key, value, 'EX', ttlS, 'NX')) === 'OK';
  }
  async del(key: string) { await this.redis.del(key); }
  async incr(key: string, ttlS: number) {
    const [[, n]] = (await this.redis.multi().incr(key).expire(key, ttlS, 'NX').exec()) as [[null, number]];
    return n;
  }
  ttl(key: string) { return this.redis.ttl(key); }
}
