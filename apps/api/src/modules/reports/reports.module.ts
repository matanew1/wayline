import { Module } from '@nestjs/common';
import type Redis from 'ioredis';
import type { Pool } from 'pg';
import { CLOCK, Clock, PG, REDIS, REPORT_LOG, REPORT_STORE } from '../../common/tokens';
import { ReportEvents } from './report.events';
import { MemoryReportLog, MemoryReportStore, PgReportLog, RedisReportStore } from './report.store';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportEvents,
    {
      provide: REPORT_STORE,
      inject: [REDIS, CLOCK],
      useFactory: (redis: Redis | null, clock: Clock) => (redis ? new RedisReportStore(redis) : new MemoryReportStore(clock)),
    },
    {
      provide: REPORT_LOG,
      inject: [PG],
      useFactory: (pg: Pool | null) => (pg ? new PgReportLog(pg) : new MemoryReportLog()),
    },
  ],
  exports: [ReportEvents, ReportsService, REPORT_LOG],
})
export class ReportsModule {}
