import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [ReportsModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
