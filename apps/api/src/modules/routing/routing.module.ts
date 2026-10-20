import { Module } from '@nestjs/common';
import type { AppConfig } from '../../config/config';
import { CONFIG, ROUTING_ENGINE } from '../../common/tokens';
import { RoutingController } from './routing.controller';
import { MockRoutingEngine, ValhallaEngine } from './routing.engine';
import { RoutingService } from './routing.service';

@Module({
  controllers: [RoutingController],
  providers: [
    RoutingService,
    {
      provide: ROUTING_ENGINE,
      inject: [CONFIG],
      useFactory: (c: AppConfig) => (c.routingDriver === 'valhalla' ? new ValhallaEngine(c.valhallaUrl) : new MockRoutingEngine()),
    },
  ],
  exports: [RoutingService],
})
export class RoutingModule {}
