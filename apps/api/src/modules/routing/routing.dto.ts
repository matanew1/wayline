import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, ValidateNested } from 'class-validator';
import { LatLngDto } from '../../common/dto';

export const AVOID_OPTIONS = ['tolls', 'highways', 'ferries'] as const;
export type AvoidOption = (typeof AVOID_OPTIONS)[number];

export const MANEUVER_KINDS = [
  'depart', 'arrive', 'continue', 'slight_right', 'right', 'sharp_right', 'uturn',
  'sharp_left', 'left', 'slight_left', 'ramp', 'exit', 'keep_right', 'keep_left',
  'merge', 'roundabout', 'ferry',
] as const;
export type ManeuverKind = (typeof MANEUVER_KINDS)[number];

export const ROUTE_FLAGS = ['toll', 'highway', 'ferry'] as const;
export type RouteFlag = (typeof ROUTE_FLAGS)[number];

export class RouteRequestDto {
  @ApiProperty({ type: LatLngDto })
  @ValidateNested()
  @Type(() => LatLngDto)
  origin: LatLngDto;

  @ApiProperty({ type: LatLngDto })
  @ValidateNested()
  @Type(() => LatLngDto)
  destination: LatLngDto;

  @ApiPropertyOptional({ enum: AVOID_OPTIONS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(AVOID_OPTIONS, { each: true })
  avoid?: AvoidOption[];

  @ApiPropertyOptional({ enum: ['he', 'en'], default: 'en', description: 'Language of maneuver instructions' })
  @IsOptional()
  @IsIn(['he', 'en'])
  language?: 'he' | 'en';
}

export class ManeuverDto {
  @ApiProperty({ enum: MANEUVER_KINDS }) kind: ManeuverKind;
  @ApiProperty({ example: 'Turn right onto Jabotinsky Street.' }) instruction: string;
  @ApiProperty({ type: [String] }) streetNames: string[];
  @ApiProperty({ description: 'Length of this maneuver segment' }) distanceM: number;
  @ApiProperty() durationS: number;
  @ApiProperty({ description: 'Index into the decoded polyline where this maneuver starts' }) beginShapeIndex: number;
}

export class SpeedLimitSpanDto {
  @ApiProperty({ description: 'metres along the route' }) fromM: number;
  @ApiProperty() toM: number;
  @ApiProperty() kmh: number;
}

export class CongestionSpanDto {
  @ApiProperty() fromM: number;
  @ApiProperty() toM: number;
  @ApiProperty({ enum: ['slow', 'jam'] }) level: 'slow' | 'jam';
}

export class RouteTrafficDto {
  @ApiProperty({ description: 'Duration without live traffic' }) baseDurationS: number;
  @ApiProperty({ description: 'Edges priced with live speeds' }) liveEdges: number;
  @ApiProperty() totalEdges: number;
  @ApiProperty({ type: [CongestionSpanDto] }) congestion: CongestionSpanDto[];
}

export class RouteOptionDto {
  @ApiProperty({ description: 'Pass to POST /trips; valid for 30 minutes' }) id: string;
  @ApiProperty({ description: 'Encoded polyline, precision 6' }) polyline6: string;
  @ApiProperty() durationS: number;
  @ApiProperty() distanceM: number;
  @ApiProperty({ type: [ManeuverDto] }) maneuvers: ManeuverDto[];
  @ApiProperty({ enum: ROUTE_FLAGS, isArray: true }) flags: RouteFlag[];
  @ApiProperty({ type: [String], description: 'Geohash-6 cells to subscribe to on the realtime gateway' }) cells: string[];
  @ApiProperty({ type: [SpeedLimitSpanDto], description: 'Posted limits along the route (gaps = unknown)' }) speedLimits: SpeedLimitSpanDto[];
  @ApiProperty({ type: RouteTrafficDto, nullable: true, description: 'null when edge data was unavailable' }) traffic: RouteTrafficDto | null;
}
