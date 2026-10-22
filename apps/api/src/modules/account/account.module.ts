import { Module } from '@nestjs/common';
import { PlacesModule } from '../places/places.module';
import { ReportsModule } from '../reports/reports.module';
import { TripsModule } from '../trips/trips.module';
import { AccountController } from './account.controller';

@Module({
  imports: [PlacesModule, TripsModule, ReportsModule],
  controllers: [AccountController],
})
export class AccountModule {}
