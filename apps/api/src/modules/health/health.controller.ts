import { Controller, Get, Inject, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type Redis from 'ioredis';
import type { Pool } from 'pg';
import type { AppConfig } from '../../config/config';
import { CONFIG, PG, REDIS } from '../../common/tokens';

class HealthDto {
  @ApiProperty({ enum: ['ok'] }) status: 'ok';
  @ApiProperty() storeDriver: string;
  @ApiProperty() routingDriver: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } }) checks: Record<string, string>;
}

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Optional() @Inject(REDIS) private readonly redis: Redis | null,
    @Optional() @Inject(PG) private readonly pg: Pool | null,
  ) {}

  /** Liveness: the process is up. */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: dependencies reachable. */
  @Get()
  @ApiOkResponse({ type: HealthDto })
  async ready(): Promise<HealthDto> {
    const checks: Record<string, string> = {};
    if (this.redis) checks.redis = await this.redis.ping().then(() => 'ok', (e) => `down: ${e.message}`);
    if (this.pg) checks.postgres = await this.pg.query('SELECT 1').then(() => 'ok', (e) => `down: ${e.message}`);
    const body: HealthDto = {
      status: 'ok', storeDriver: this.config.storeDriver, routingDriver: this.config.routingDriver, checks,
    };
    if (Object.values(checks).some((v) => v !== 'ok')) throw new ServiceUnavailableException(body);
    return body;
  }
}
