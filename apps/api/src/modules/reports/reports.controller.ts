import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, JwtAuthGuard } from '../../common/auth';
import { CreateReportDto, NearbyReportsQuery, ReportCreatedDto, ReportDto, VoteDto, VoteResultDto } from './reports.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @ApiCreatedResponse({ type: ReportCreatedDto })
  create(@CurrentUser() user: AuthUser, @Body() body: CreateReportDto) {
    return this.reports.create(user, body);
  }

  @Post(':id/votes')
  @HttpCode(200)
  @ApiOkResponse({ type: VoteResultDto })
  vote(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: VoteDto) {
    return this.reports.vote(user, id, body.stillThere);
  }

  @Get('nearby')
  @ApiOkResponse({ type: [ReportDto], description: 'Initial load; live updates come over the realtime gateway' })
  nearby(@Query() q: NearbyReportsQuery) {
    return this.reports.nearby(q.lat, q.lng, q.radiusM ?? 5000);
  }
}
