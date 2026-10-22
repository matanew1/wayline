import { Module } from '@nestjs/common';
import type { AppConfig } from '../../config/config';
import type Redis from 'ioredis';
import type { Pool } from 'pg';
import { CLOCK, Clock, CONFIG, PG, REDIS, ROUTING_ENGINE } from '../../common/tokens';
import { HISTORIC_STORE, TRAFFIC_STORE } from './routing.tokens';
import { MemoryHistoricSpeedStore, MemoryTrafficStore, PgHistoricSpeedStore, RedisTrafficStore } from './traffic.store';
import { RoutingController } from './routing.controller';
import { MockRoutingEngine, ValhallaEngine } from './routing.engine';
import { RoutingService } from './routing.service';

@Module({
  controllers: [RoutingController],
  providers: [
    RoutingService,
    {
      provide: TRAFFIC_STORE,
      inject: [REDIS, CLOCK],
      useFactory: (redis: Redis | null, clock: Clock) => (redis ? new RedisTrafficStore(redis, clock) : new MemoryTrafficStore(clock)),
    },
    {
      provide: HISTORIC_STORE,
      inject: [PG],
      useFactory: (pg: Pool | null) => (pg ? new PgHistoricSpeedStore(pg) : new MemoryHistoricSpeedStore()),
    },
    {
      provide: ROUTING_ENGINE,
      inject: [CONFIG],
      useFactory: (c: AppConfig) => (c.routingDriver === 'valhalla' ? new ValhallaEngine(c.valhallaUrl) : new MockRoutingEngine()),
    },
  ],
  exports: [RoutingService, TRAFFIC_STORE, HISTORIC_STORE],
})
export class RoutingModule {}
