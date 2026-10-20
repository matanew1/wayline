import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { AppConfig } from '../../config/config';
import { JwtAuthGuard } from '../../common/auth';
import { CONFIG, SMS_SENDER } from '../../common/tokens';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LogSmsSender } from './sms';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [CONFIG],
      useFactory: (c: AppConfig) => ({ secret: c.jwtSecret, signOptions: { issuer: 'wayline' }, verifyOptions: { issuer: 'wayline' } }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, { provide: SMS_SENDER, useClass: LogSmsSender }],
  exports: [JwtModule, JwtAuthGuard],
})
export class AuthModule {}
