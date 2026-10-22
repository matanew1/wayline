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

export const VEHICLES = ['car', 'motorcycle'] as const;
export type Vehicle = (typeof VEHICLES)[number];

/** Lane arrows, as painted on the road (OSM turn:lanes). */
export const LANE_INDICATIONS = ['left', 'slight left', 'sharp left', 'straight', 'right', 'slight right', 'sharp right', 'uturn', 'none'] as const;
export type LaneIndication = (typeof LANE_INDICATIONS)[number];

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

  @ApiPropertyOptional({ enum: VEHICLES, default: 'car' })
  @IsOptional()
  @IsIn(VEHICLES)
  vehicle?: Vehicle;
}

export class LaneDto {
  @ApiProperty({ enum: LANE_INDICATIONS, isArray: true, description: 'Arrows painted on this lane, left to right order of lanes' })
  indications: LaneIndication[];
  @ApiProperty({ description: 'This lane can be used for the maneuver' }) valid: boolean;
}

export class ManeuverDto {
  @ApiProperty({ enum: MANEUVER_KINDS }) kind: ManeuverKind;
  @ApiProperty({ example: 'Turn right onto Jabotinsky Street.' }) instruction: string;
  @ApiProperty({ type: [String] }) streetNames: string[];
  @ApiProperty({ description: 'Length of this maneuver segment' }) distanceM: number;
  @ApiProperty() durationS: number;
  @ApiProperty({ description: 'Index into the decoded polyline where this maneuver starts' }) beginShapeIndex: number;
  @ApiPropertyOptional({ type: [LaneDto], description: 'Lanes before this maneuver, left to right, when the map has turn lanes' })
  lanes?: LaneDto[];
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

export class DeparturesQueryDto {
  @ApiPropertyOptional({ description: 'Minutes from now, comma-separated (0–180, up to 6)', example: '0,15,30' })
  @IsOptional()
  offsets?: string;
}

export class DepartureDto {
  @ApiProperty({ description: 'Minutes from now' }) offsetMin: number;
  @ApiProperty() departAt: string;
  @ApiProperty({ description: 'Expected drive time if leaving then' }) durationS: number;
  @ApiProperty({
    enum: ['live', 'historic', 'typical'],
    description: 'live = current traffic; historic = usual speeds for that hour of the week; typical = no traffic data, router estimate',
  })
  basis: 'live' | 'historic' | 'typical';
}
