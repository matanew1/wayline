import { Controller, Delete, Get, HttpCode, Inject, Logger, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AppConfig } from '../../config/config';
import { AuthUser, CurrentUser, deletedUserKey, JwtAuthGuard } from '../../common/auth';
import type { KvStore } from '../../common/kv';
import { CONFIG, KV, SAVED_PLACES_REPO, TRIPS_REPO, USERS_REPO } from '../../common/tokens';
import type { SavedPlacesRepository } from '../places/saved-places.repository';
import type { TripsRepository } from '../trips/trips.repository';
import type { UsersRepository } from '../users/users.repository';

class MeDto {
  @ApiProperty() id: string;
  @ApiProperty() guest: boolean;
  @ApiProperty({ description: '0–1; seeds the confidence of your reports' }) trustScore: number;
  @ApiProperty() createdAt: string;
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
    @Inject(KV) private readonly kv: KvStore,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  @ApiOkResponse({ type: MeDto })
  async me(@CurrentUser() user: AuthUser): Promise<MeDto> {
    const u = await this.users.findById(user.id);
    if (!u) throw new NotFoundException('Account not found');
    return { id: u.id, guest: u.isGuest, trustScore: u.trustScore, createdAt: u.createdAt.toISOString() };
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
