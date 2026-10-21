import { Module } from '@nestjs/common';
import { PlacesModule } from '../places/places.module';
import { TripsModule } from '../trips/trips.module';
import { AccountController } from './account.controller';

@Module({
  imports: [PlacesModule, TripsModule],
  controllers: [AccountController],
})
export class AccountModule {}
