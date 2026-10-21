import Redis from 'ioredis';
import { RedisThrottlerStorage } from '../src/infra/redis-throttler.storage';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379/15';

describe('RedisThrottlerStorage (shared across replicas)', () => {
  const a = new Redis(REDIS_URL);
  const b = new Redis(REDIS_URL);
  afterAll(async () => { await a.quit(); await b.quit(); });

  it('counts hits from every instance in one window and blocks over the limit', async () => {
    const key = `t-${Date.now()}`;
    const s1 = new RedisThrottlerStorage(a);
    const s2 = new RedisThrottlerStorage(b); // a second API replica
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await (i % 2 ? s2 : s1).increment(key, 2000, 4, 3000, 'default'));
    expect(results.map((r) => r.totalHits)).toEqual([1, 2, 3, 4, 5]);
    expect(results.slice(0, 4).every((r) => !r.isBlocked)).toBe(true);
    expect(results[4]).toMatchObject({ isBlocked: true, timeToBlockExpire: 3 });
    expect(results[0].timeToExpire).toBe(2);

    // while blocked, hits aren't counted
    const blocked = await s2.increment(key, 2000, 4, 3000, 'default');
    expect(blocked).toMatchObject({ isBlocked: true, totalHits: 5 });
  });

  it('starts a fresh window after ttl', async () => {
    const key = `w-${Date.now()}`;
    const s = new RedisThrottlerStorage(a);
    await s.increment(key, 150, 10, 150, 'default');
    await new Promise((r) => setTimeout(r, 250));
    expect((await s.increment(key, 150, 10, 150, 'default')).totalHits).toBe(1);
  });
});
