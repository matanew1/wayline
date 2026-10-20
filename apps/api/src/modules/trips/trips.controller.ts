import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiAcceptedResponse, ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser, JwtAuthGuard } from '../../common/auth';
import { EtaDto, EtaRequestDto, ProbeBatchDto, ProbesAcceptedDto, StartTripDto, TripDto, TripStartedDto, UpdateTripDto } from './trips.dto';
import { TripsService } from './trips.service';

@ApiTags('trips')
@Controller()
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Post('trips')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiCreatedResponse({ type: TripStartedDto })
  start(@CurrentUser() user: AuthUser, @Body() body: StartTripDto) {
    return this.trips.start(user.id, body.routeId);
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

  /** Authenticated by probeToken only, so the probe stream never carries the user's identity. */
  @Post('probes')
  @HttpCode(202)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiAcceptedResponse({ type: ProbesAcceptedDto })
  probes(@Body() body: ProbeBatchDto) {
    return this.trips.ingestProbes(body);
  }
}
