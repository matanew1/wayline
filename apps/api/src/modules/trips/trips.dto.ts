import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RouteOptionDto } from '../routing/routing.dto';
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

  @ApiPropertyOptional({ description: 'Destination as the driver picked it — shown in recent drives and on ETA share links', maxLength: 120 })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  destinationName?: string;
}

export class ShareTripDto {
  @ApiPropertyOptional({ description: 'Current remaining seconds from the app, to seed the page until the next ETA check' })
  @IsOptional() @IsInt() @Min(0) @Max(86_400)
  remainingS?: number;
}

export class TripShareDto {
  @ApiProperty() token: string;
  @ApiProperty({ description: 'Public page with the live ETA' }) url: string;
  @ApiProperty() expiresAt: string;
}

export const SHARE_STATUSES = ['driving', 'arrived', 'ended'] as const;

export class SharedTripDto {
  @ApiProperty() driverName: string;
  @ApiProperty({ nullable: true }) destinationName: string | null;
  @ApiProperty({ enum: SHARE_STATUSES }) status: (typeof SHARE_STATUSES)[number];
  @ApiProperty({ description: 'Expected arrival, epoch ms' }) etaEpochMs: number;
  @ApiProperty() updatedAt: string;
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

export class EtaRequestDto {
  @ApiProperty({ description: 'Current position. Used for this calculation only — not stored.' })
  @IsLatitude()
  lat: number;

  @ApiProperty() @IsLongitude() lng: number;
}

export class EtaDto {
  @ApiProperty({ description: 'Traffic-adjusted time left on the current route' }) remainingS: number;
  @ApiProperty({ description: 'Distance from the route; large values mean the driver is off route' }) offRouteM: number;
  @ApiProperty() liveEdges: number;
  @ApiPropertyOptional({ type: RouteOptionDto, description: 'Present when a route at least FASTER_ROUTE_MIN_SAVING_S faster exists' })
  fasterRoute?: RouteOptionDto;
  @ApiPropertyOptional() savingS?: number;
}
