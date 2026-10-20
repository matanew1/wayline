import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Length, Max, Min, ValidateNested,
} from 'class-validator';

export const TRIP_STATUSES = ['active', 'finished', 'cancelled'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export class StartTripDto {
  @ApiProperty({ description: 'Route id from POST /routes' })
  @IsString()
  @Length(4, 64)
  routeId: string;
}

export class UpdateTripDto {
  @ApiPropertyOptional({ enum: ['finished', 'cancelled'] })
  @IsOptional()
  @IsIn(['finished', 'cancelled'])
  status?: 'finished' | 'cancelled';

  @ApiPropertyOptional({ description: 'New route id after a reroute' })
  @IsOptional()
  @IsString()
  @Length(4, 64)
  routeId?: string;
}

export class TripStartedDto {
  @ApiProperty() tripId: string;
  @ApiProperty({ description: 'Credential for POST /probes. Not linked to the user in the probe stream.' }) probeToken: string;
  @ApiProperty() probeTokenExpiresInS: number;
  @ApiProperty() startedAt: string;
}

export class TripDto {
  @ApiProperty() id: string;
  @ApiProperty() routeId: string;
  @ApiProperty({ enum: TRIP_STATUSES }) status: TripStatus;
  @ApiProperty() distanceM: number;
  @ApiProperty() startedAt: string;
  @ApiPropertyOptional() endedAt?: string;
}

export class ProbeFixDto {
  @ApiProperty({ description: 'Unix epoch milliseconds' })
  @IsInt()
  @Min(1_600_000_000_000)
  t: number;

  @ApiProperty() @IsLatitude() lat: number;
  @ApiProperty() @IsLongitude() lng: number;

  @ApiPropertyOptional({ description: 'm/s' })
  @IsOptional() @IsNumber() @Min(0) @Max(100)
  speed?: number;

  @ApiPropertyOptional({ description: 'degrees, 0 = north' })
  @IsOptional() @IsNumber() @Min(0) @Max(360)
  heading?: number;

  @ApiPropertyOptional({ description: 'horizontal accuracy, metres' })
  @IsOptional() @IsNumber() @Min(0)
  acc?: number;
}

export class ProbeBatchDto {
  @ApiProperty()
  @IsString()
  @Length(16, 128)
  probeToken: string;

  @ApiProperty({ type: [ProbeFixDto], description: '1–600 fixes (10 min at 1 Hz)' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(600)
  @ValidateNested({ each: true })
  @Type(() => ProbeFixDto)
  fixes: ProbeFixDto[];
}

export class ProbesAcceptedDto {
  @ApiProperty() accepted: number;
  @ApiProperty({ description: 'Fixes dropped for poor accuracy or bad timestamps' }) dropped: number;
}
