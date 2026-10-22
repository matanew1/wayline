import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, Logger, NotFoundException, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { AppConfig } from '../../config/config';
import { AuthUser, CurrentUser, deletedUserKey, JwtAuthGuard } from '../../common/auth';
import type { KvStore } from '../../common/kv';
import { CONFIG, KV, REPORT_LOG, SAVED_PLACES_REPO, TRIPS_REPO, USERS_REPO } from '../../common/tokens';
import type { SavedPlacesRepository } from '../places/saved-places.repository';
import type { ReportLog } from '../reports/report.store';
import type { TripsRepository } from '../trips/trips.repository';
import type { UsersRepository } from '../users/users.repository';
import { defaultNickname, LEVELS, NICKNAME_RE, reputation, type LevelId } from './profile';

const LEVEL_IDS = LEVELS.map((l) => l.id);

class ReputationDto {
  @ApiProperty({ enum: LEVEL_IDS }) level: LevelId;
  @ApiProperty({ description: '0–1 progress to the next level' }) progress: number;
  @ApiProperty({ enum: LEVEL_IDS, nullable: true }) next: LevelId | null;
}

class StatsDto {
  @ApiProperty({ description: 'Finished drives' }) drives: number;
  @ApiProperty() distanceM: number;
  @ApiProperty({ description: 'Reports you made' }) reports: number;
  @ApiProperty({ description: '"Still there" votes other drivers gave your reports' }) confirmations: number;
}

class MeDto {
  @ApiProperty() id: string;
  @ApiProperty() guest: boolean;
  @ApiProperty({ description: 'Shown on your profile; a default is generated until you pick one' }) nickname: string;
  @ApiProperty({ description: 'True when nickname is the generated default' }) nicknameIsDefault: boolean;
  @ApiProperty({ description: '0–1; seeds the confidence of your reports' }) trustScore: number;
  @ApiProperty({ type: ReputationDto }) reputation: ReputationDto;
  @ApiProperty({ type: StatsDto }) stats: StatsDto;
  @ApiProperty() createdAt: string;
}

class UpdateMeDto {
  @ApiPropertyOptional({ description: '2–24 letters, digits, spaces, . _ -; empty string resets to the default', example: 'Night Owl' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  nickname?: string;
}

class RecentTripsQueryDto {
  @ApiPropertyOptional({ default: 10, maximum: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit?: number;
}

class RecentTripDto {
  @ApiProperty() id: string;
  @ApiProperty({ nullable: true }) destinationName: string | null;
  @ApiProperty() distanceM: number;
  @ApiProperty() startedAt: string;
  @ApiPropertyOptional() endedAt?: string;
}

@ApiTags('account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me')
export class AccountController {
  private readonly log = new Logger('Account');

  constructor(
    @Inject(USERS_REPO) private readonly users: UsersRepository,
    @Inject(SAVED_PLACES_REPO) private readonly places: SavedPlacesRepository,
    @Inject(TRIPS_REPO) private readonly trips: TripsRepository,
    @Inject(REPORT_LOG) private readonly reportLog: ReportLog,
    @Inject(KV) private readonly kv: KvStore,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  @ApiOkResponse({ type: MeDto })
  async me(@CurrentUser() user: AuthUser): Promise<MeDto> {
    const u = await this.users.findById(user.id);
    if (!u) throw new NotFoundException('Account not found');
    const [trips, reports] = await Promise.all([this.trips.stats(u.id), this.reportLog.statsFor(u.id)]);
    return {
      id: u.id,
      guest: u.isGuest,
      nickname: u.displayName ?? defaultNickname(u.id),
      nicknameIsDefault: !u.displayName,
      trustScore: u.trustScore,
      reputation: reputation(u.trustScore),
      stats: { drives: trips.trips, distanceM: trips.distanceM, reports: reports.reports, confirmations: reports.confirmations },
      createdAt: u.createdAt.toISOString(),
    };
  }

  @Patch()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: MeDto })
  async update(@CurrentUser() user: AuthUser, @Body() body: UpdateMeDto): Promise<MeDto> {
    if (body.nickname !== undefined) {
      const name = body.nickname.trim().replace(/\s+/g, ' ');
      if (name && !NICKNAME_RE.test(name)) throw new BadRequestException('nickname must be 2–24 letters, digits, spaces or . _ -');
      if (!(await this.users.setDisplayName(user.id, name || null))) throw new NotFoundException('Account not found');
    }
    return this.me(user);
  }

  @Get('trips')
  @ApiOkResponse({ type: [RecentTripDto] })
  async recentTrips(@CurrentUser() user: AuthUser, @Query() q: RecentTripsQueryDto): Promise<RecentTripDto[]> {
    const trips = await this.trips.listFinished(user.id, q.limit ?? 10);
    return trips.map((t) => ({
      id: t.id, destinationName: t.destinationName, distanceM: t.distanceM,
      startedAt: t.startedAt.toISOString(), endedAt: t.endedAt?.toISOString(),
    }));
  }

  /**
   * Deletes the account and personal data (saved places, trips). Reports you made stay on the map
   * for other drivers but are no longer linked to you; GPS probes were never linked to you.
   * Required by the App Store and Google Play for apps that create accounts.
   */
  @Delete()
  @HttpCode(204)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiNoContentResponse()
  async remove(@CurrentUser() user: AuthUser) {
    // revoke first: tokens issued before this moment stop working immediately
    await this.kv.set(deletedUserKey(user.id), '1', this.config.accessTtlS + 60);
    await this.places.removeAll(user.id);
    const trips = await this.trips.removeAll(user.id);
    await this.users.delete(user.id);
    this.log.log(`account deleted (${trips} trips)`);
  }
}
