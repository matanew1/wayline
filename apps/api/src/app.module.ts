import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { REDIS } from './common/tokens';
import { InfraModule } from './infra/infra.module';
import { RedisThrottlerStorage } from './infra/redis-throttler.storage';
import { AccountModule } from './modules/account/account.module';
import { AuthModule } from './modules/auth/auth.module';
import { LegalModule } from './modules/legal/legal.controller';
import { MetricsModule } from './observability/metrics';
import { HealthController } from './modules/health/health.controller';
import { PlacesModule } from './modules/places/places.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RoutingModule } from './modules/routing/routing.module';
import { TripsModule } from './modules/trips/trips.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    InfraModule,
    // Limits are shared across replicas through Redis when STORE_DRIVER=infra.
    ThrottlerModule.forRootAsync({
      inject: [REDIS],
      useFactory: (redis: Redis | null) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
        storage: redis ? new RedisThrottlerStorage(redis) : undefined,
      }),
    }),
    MetricsModule,
    UsersModule,
    AuthModule,
    PlacesModule,
    RoutingModule,
    TripsModule,
    ReportsModule,
    RealtimeModule,
    AccountModule,
    LegalModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
