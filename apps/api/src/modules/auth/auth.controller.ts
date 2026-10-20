import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { OtpRequestedDto, RefreshDto, RequestOtpDto, TokenPairDto, VerifyOtpDto } from './auth.dto';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: OtpRequestedDto })
  requestOtp(@Body() body: RequestOtpDto) {
    return this.auth.requestOtp(body.phone);
  }

  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOkResponse({ type: TokenPairDto })
  verify(@Body() body: VerifyOtpDto) {
    return this.auth.verifyOtp(body.phone, body.code);
  }

  @Post('guest')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: TokenPairDto })
  guest() {
    return this.auth.guest();
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOkResponse({ type: TokenPairDto })
  refresh(@Body() body: RefreshDto) {
    return this.auth.refresh(body.refreshToken);
  }
}
