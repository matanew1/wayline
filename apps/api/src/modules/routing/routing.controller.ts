import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/auth';
import { DepartureDto, DeparturesQueryDto, RouteOptionDto, RouteRequestDto } from './routing.dto';
import { MAX_DEPARTURE_OFFSET_MIN, MAX_DEPARTURE_OFFSETS, RoutingService } from './routing.service';

export function parseOffsets(raw: string | undefined): number[] {
  if (raw === undefined || raw === '') return [0, 15, 30];
  const parts = raw.split(',').map((x) => x.trim());
  const nums = parts.map(Number);
  if (parts.length > MAX_DEPARTURE_OFFSETS || nums.some((n) => !Number.isInteger(n) || n < 0 || n > MAX_DEPARTURE_OFFSET_MIN)) {
    throw new BadRequestException(`offsets: up to ${MAX_DEPARTURE_OFFSETS} whole minutes between 0 and ${MAX_DEPARTURE_OFFSET_MIN}`);
  }
  return [...new Set(nums)].sort((a, b) => a - b);
}

@ApiTags('routes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('routes')
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}

  @Post()
  @HttpCode(200)
  @ApiOkResponse({ type: [RouteOptionDto], description: 'Best route first, up to 3' })
  @ApiNotFoundResponse({ description: 'No route between the points' })
  plan(@Body() body: RouteRequestDto) {
    return this.routing.plan(body);
  }

  @Get(':id/departures')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOkResponse({ type: [DepartureDto], description: 'Drive time for this route when leaving now or later' })
  @ApiNotFoundResponse({ description: 'Route expired' })
  async departures(@Param('id') id: string, @Query() q: DeparturesQueryDto) {
    const offsets = parseOffsets(q.offsets);
    const route = await this.routing.get(id);
    if (!route) throw new NotFoundException('Route expired — request routes again');
    return this.routing.departures(route, offsets);
  }
}
