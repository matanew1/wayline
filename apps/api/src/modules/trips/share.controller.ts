import { Controller, Get, Header, Headers, Inject, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CLOCK, Clock } from '../../common/tokens';
import { sharePage } from './share.page';
import { ShareService } from './share.service';
import { SharedTripDto } from './trips.dto';

/** Public: whoever has the link. Tokens are 144-bit random and expire with the drive. */
@ApiTags('trips')
@Controller()
export class ShareController {
  constructor(private readonly shares: ShareService, @Inject(CLOCK) private readonly clock: Clock) {}

  @Get('share/:token')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: SharedTripDto })
  @ApiNotFoundResponse({ description: 'Unknown or expired link' })
  async json(@Param('token') token: string) {
    const v = await this.shares.view(token);
    if (!v) throw new NotFoundException('This link has expired');
    return v;
  }

  @Get('s/:token')
  @ApiExcludeEndpoint()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async page(@Param('token') token: string, @Query('lang') lang: string | undefined, @Headers('accept-language') al: string | undefined, @Res() res: Response) {
    const l = lang === 'he' || lang === 'en' ? lang : /^he\b/i.test(al ?? '') ? 'he' : 'en';
    const v = await this.shares.view(token);
    res.status(v ? 200 : 404).type('text/html').setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.send(sharePage(v, l, this.clock.now()));
  }
}
