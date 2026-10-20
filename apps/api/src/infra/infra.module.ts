import { Global, Inject, Injectable, Logger, Module, OnApplicationShutdown, Optional } from '@nestjs/common';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { AppConfig, loadConfig } from '../config/config';
import { MemoryKvStore, RedisKvStore } from '../common/kv';
import { CLOCK, Clock, CONFIG, KV, PG, REDIS, systemClock } from '../common/tokens';

@Injectable()
class InfraLifecycle implements OnApplicationShutdown {
  private readonly log = new Logger('Infra');
  constructor(
    @Optional() @Inject(REDIS) private readonly redis: Redis | null,
    @Optional() @Inject(PG) private readonly pg: Pool | null,
  ) {}
  async onApplicationShutdown() {
    await Promise.allSettled([this.redis?.quit(), this.pg?.end()]);
    this.log.log('connections closed');
  }
}

@Global()
@Module({
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig() },
    { provide: CLOCK, useValue: systemClock },
    {
      provide: REDIS,
      inject: [CONFIG],
      useFactory: (c: AppConfig) => (c.storeDriver === 'infra' ? new Redis(c.redisUrl, { maxRetriesPerRequest: 3 }) : null),
    },
    {
      provide: PG,
      inject: [CONFIG],
      useFactory: (c: AppConfig) => (c.storeDriver === 'infra' ? new Pool({ connectionString: c.databaseUrl, max: 10 }) : null),
    },
    {
      provide: KV,
      inject: [REDIS, CLOCK],
      useFactory: (redis: Redis | null, clock: Clock) => (redis ? new RedisKvStore(redis) : new MemoryKvStore(clock)),
    },
    InfraLifecycle,
  ],
  exports: [CONFIG, CLOCK, REDIS, PG, KV],
})
export class InfraModule {}
