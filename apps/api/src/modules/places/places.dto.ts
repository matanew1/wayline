import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsLatitude, IsLongitude, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export const PLACE_KINDS = ['home', 'work', 'fav'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export class SearchPlacesQuery {
  @ApiProperty({ example: 'city hall' })
  @IsString()
  @Length(1, 120)
  q: string;

  @ApiPropertyOptional({ description: 'Bias results near this point' })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ enum: ['he', 'en'], default: 'en' })
  @IsOptional()
  @IsIn(['he', 'en'])
  lang?: 'he' | 'en';
}

export class PlaceDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() address: string;
  @ApiProperty() lat: number;
  @ApiProperty() lng: number;
  @ApiPropertyOptional({ description: 'Straight-line distance from the bias point' })
  distanceM?: number;
}

export class SavePlaceDto {
  @ApiProperty({ enum: PLACE_KINDS })
  @IsIn(PLACE_KINDS)
  kind: PlaceKind;

  @ApiProperty({ example: 'Work' })
  @IsString()
  @Length(1, 80)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @ApiProperty() @IsLatitude() lat: number;
  @ApiProperty() @IsLongitude() lng: number;
}

export class SavedPlaceDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: PLACE_KINDS }) kind: PlaceKind;
  @ApiProperty() name: string;
  @ApiPropertyOptional() address?: string;
  @ApiProperty() lat: number;
  @ApiProperty() lng: number;
}
