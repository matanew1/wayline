import { Body, Controller, Delete, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiAcceptedResponse, ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser, JwtAuthGuard } from '../../common/auth';
import type { AppConfig } from '../../config/config';
import { CONFIG } from '../../common/tokens';
import { ShareService } from './share.service';
import { EtaDto, EtaRequestDto, ProbeBatchDto, ProbesAcceptedDto, ShareTripDto, StartTripDto, TripDto, TripShareDto, TripStartedDto, UpdateTripDto } from './trips.dto';
import { TripsService } from './trips.service';

@ApiTags('trips')
@Controller()
export class TripsController {
  constructor(
    private readonly trips: TripsService,
    private readonly shares: ShareService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('trips')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiCreatedResponse({ type: TripStartedDto })
  start(@CurrentUser() user: AuthUser, @Body() body: StartTripDto) {
    return this.trips.start(user.id, body.routeId, body.destinationName);
  }

  @Patch('trips/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ type: TripDto })
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateTripDto) {
    return this.trips.update(user.id, id, body);
  }

  @Post('trips/:id/eta')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @ApiOkResponse({ type: EtaDto })
  eta(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: EtaRequestDto) {
    return this.trips.eta(user.id, id, body);
  }

  @Post('trips/:id/share')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiCreatedResponse({ type: TripShareDto, description: 'A link that shows your live arrival time (not your location). Same link if already shared.' })
  share(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: ShareTripDto, @Req() req: Request) {
    const base = this.config.publicUrl ?? `${req.protocol}://${req.get('host')}`;
    return this.shares.create(user.id, id, body.remainingS, base);
  }

  @Delete('trips/:id/share')
  @HttpCode(204)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiNoContentResponse()
  unshare(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.shares.revoke(user.id, id);
  }

  /** Authenticated by probeToken only, so the probe stream never carries the user's identity. */
  @Post('probes')
  @HttpCode(202)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiAcceptedResponse({ type: ProbesAcceptedDto })
  probes(@Body() body: ProbeBatchDto) {
    return this.trips.ingestProbes(body);
  }
}
