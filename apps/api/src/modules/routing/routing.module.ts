import { Module } from '@nestjs/common';
import type { AppConfig } from '../../config/config';
import type Redis from 'ioredis';
import { CLOCK, Clock, CONFIG, REDIS, ROUTING_ENGINE } from '../../common/tokens';
import { TRAFFIC_STORE } from './routing.tokens';
import { MemoryTrafficStore, RedisTrafficStore } from './traffic.store';
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
      provide: ROUTING_ENGINE,
      inject: [CONFIG],
      useFactory: (c: AppConfig) => (c.routingDriver === 'valhalla' ? new ValhallaEngine(c.valhallaUrl) : new MockRoutingEngine()),
    },
  ],
  exports: [RoutingService, TRAFFIC_STORE],
})
export class RoutingModule {}
