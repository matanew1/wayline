import type { ThrottlerStorage } from '@nestjs/throttler';
import type Redis from 'ioredis';

/**
 * Atomic fixed-window counter with blocking, shared by every API replica.
 * Mirrors @nestjs/throttler's in-memory semantics: ttl/blockDuration in ms in, seconds out;
 * no counting while blocked.
 */
const SCRIPT = `
local hits_key, block_key = KEYS[1], KEYS[2]
local ttl, limit, block = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
local blocked = redis.call('PTTL', block_key)
if blocked > 0 then
  local hits = tonumber(redis.call('GET', hits_key) or '0')
  return {hits, redis.call('PTTL', hits_key), 1, blocked}
end
local hits = redis.call('INCR', hits_key)
if hits == 1 then redis.call('PEXPIRE', hits_key, ttl) end
local expire = redis.call('PTTL', hits_key)
if hits > limit then
  redis.call('SET', block_key, '1', 'PX', block)
  return {hits, expire, 1, block}
end
return {hits, expire, 0, 0}
`;

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis, private readonly prefix = 'throttle') {}

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string) {
    const base = `${this.prefix}:${throttlerName}:${key}`;
    const [hits, expireMs, blocked, blockMs] = (await this.redis.eval(
      SCRIPT, 2, base, `${base}:block`, String(ttl), String(limit), String(blockDuration || ttl),
    )) as [number, number, number, number];
    return {
      totalHits: hits,
      timeToExpire: Math.max(0, Math.ceil(expireMs / 1000)),
      isBlocked: blocked === 1,
      timeToBlockExpire: Math.max(0, Math.ceil(blockMs / 1000)),
    };
  }
}
