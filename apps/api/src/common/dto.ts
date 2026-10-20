import { ApiProperty } from '@nestjs/swagger';
import { IsLatitude, IsLongitude } from 'class-validator';

export class LatLngDto {
  @ApiProperty({ example: 32.0853 })
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: 34.7818 })
  @IsLongitude()
  lng: number;
}
