import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth';
import { RouteOptionDto, RouteRequestDto } from './routing.dto';
import { RoutingService } from './routing.service';

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
}
