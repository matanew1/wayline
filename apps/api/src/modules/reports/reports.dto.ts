import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { REPORT_TYPES, type ReportType } from './report.rules';

export class CreateReportDto {
  @ApiProperty({ enum: REPORT_TYPES })
  @IsIn(REPORT_TYPES)
  type: ReportType;

  @ApiProperty() @IsLatitude() lat: number;
  @ApiProperty() @IsLongitude() lng: number;

  @ApiPropertyOptional({ description: 'Reporter direction of travel, degrees' })
  @IsOptional() @IsNumber() @Min(0) @Max(360)
  heading?: number;

  @ApiProperty({ description: 'Client-generated id; retries with the same id are idempotent' })
  @IsString()
  @Length(8, 64)
  clientId: string;
}

export class VoteDto {
  @ApiProperty() @IsBoolean() stillThere: boolean;
}

export class NearbyReportsQuery {
  @ApiProperty() @Type(() => Number) @IsLatitude() lat: number;
  @ApiProperty() @Type(() => Number) @IsLongitude() lng: number;

  @ApiPropertyOptional({ default: 5000, maximum: 20000 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(50) @Max(20000)
  radiusM?: number;
}

export class ReportDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: REPORT_TYPES }) type: ReportType;
  @ApiProperty() lat: number;
  @ApiProperty() lng: number;
  @ApiProperty({ nullable: true, type: Number }) heading: number | null;
  @ApiProperty({ description: '0–1' }) confidence: number;
  @ApiProperty() createdAt: string;
  @ApiProperty() expiresAt: string;
}

export class ReportCreatedDto {
  @ApiProperty() id: string;
  @ApiProperty({ description: 'true when the report was merged into an existing nearby one' }) merged: boolean;
  @ApiProperty({ type: ReportDto }) report: ReportDto;
}

export class VoteResultDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['active', 'expired'] }) status: 'active' | 'expired';
  @ApiProperty() confidence: number;
  @ApiProperty() expiresAt: string;
}
