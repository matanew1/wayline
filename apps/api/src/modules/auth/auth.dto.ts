import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

const E164 = /^\+[1-9]\d{7,14}$/;

export class RequestOtpDto {
  @ApiProperty({ example: '+972501234567', description: 'E.164 phone number' })
  @Matches(E164, { message: 'phone must be in E.164 format, e.g. +972501234567' })
  phone: string;
}

export class VerifyOtpDto extends RequestOtpDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

export class OtpRequestedDto {
  @ApiProperty({ example: '+97250•••4567' })
  sentTo: string;

  @ApiProperty({ example: 300 })
  expiresInS: number;

  @ApiPropertyOptional({ description: 'Only when OTP_DEV_ECHO=true (never in production)' })
  devCode?: string;
}

export class TokenPairDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty({ example: 900 })
  expiresInS: number;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  guest: boolean;
}
