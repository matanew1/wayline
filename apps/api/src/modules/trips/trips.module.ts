import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import type { Pool } from 'pg';
import type { AppConfig } from '../../config/config';
import { CONFIG, PG, PROBE_SINK, TRIPS_REPO } from '../../common/tokens';
import { RoutingModule } from '../routing/routing.module';
import { KafkaProbeSink, MemoryProbeSink, type ProbeSink } from './probe-sink';
import { TripsController } from './trips.controller';
import { MemoryTripsRepository, PgTripsRepository } from './trips.repository';
import { TripsService } from './trips.service';

@Module({
  imports: [RoutingModule],
  controllers: [TripsController],
  providers: [
    TripsService,
    {
      provide: TRIPS_REPO,
      inject: [PG],
      useFactory: (pg: Pool | null) => (pg ? new PgTripsRepository(pg) : new MemoryTripsRepository()),
    },
    {
      provide: PROBE_SINK,
      inject: [CONFIG],
      useFactory: (c: AppConfig) => (c.storeDriver === 'infra' ? new KafkaProbeSink(c.kafkaBrokers) : new MemoryProbeSink()),
    },
  ],
})
export class TripsModule implements OnModuleDestroy {
  constructor(@Inject(PROBE_SINK) private readonly sink: ProbeSink) {}
  async onModuleDestroy() {
    await this.sink.close?.();
  }
}
