import { IsString, IsOptional, IsEnum, IsArray, ValidateNested, IsBoolean } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnalysisOptionsDto {
  @ApiPropertyOptional({
    description: 'Include historical data in analysis',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => Boolean(value))
  includeHistorical?: boolean = false;

  @ApiPropertyOptional({
    description: 'Time frame for analysis',
    enum: ['1h', '24h', '7d', '30d'],
    example: '24h',
  })
  @IsOptional()
  @IsEnum(['1h', '24h', '7d', '30d'])
  timeframe?: string = '24h';

  @ApiPropertyOptional({
    description: 'Blockchain networks to include',
    example: ['ethereum', 'polygon'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  chains?: string[];

  @ApiPropertyOptional({
    description: 'Enable detailed analysis (Pro+ only)',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  enableDetailedAnalysis?: boolean = false;

  @ApiPropertyOptional({
    description: 'Cache results for faster subsequent requests',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enableCaching?: boolean = true;
}

export class AnalysisRequestDto {
  @ApiProperty({
    description: 'Project identifier (name, symbol, or contract address)',
    example: 'uniswap',
  })
  @IsString()
  @Transform(({ value }) => value.toLowerCase().trim())
  projectId: string;

  @ApiPropertyOptional({
    description: 'Type of analysis to perform',
    enum: ['full', 'onchain', 'sentiment', 'tokenomics', 'team'],
    example: 'full',
  })
  @IsOptional()
  @IsEnum(['full', 'onchain', 'sentiment', 'tokenomics', 'team'])
  analysisType?: string = 'full';

  @ApiPropertyOptional({
    description: 'Contract address for token-specific analysis',
    example: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
  })
  @IsOptional()
  @IsString()
  tokenAddress?: string;

  @ApiPropertyOptional({
    description: 'Blockchain network ID',
    example: 1,
  })
  @IsOptional()
  chainId?: number;

  @ApiPropertyOptional({
    description: 'Analysis options',
    type: AnalysisOptionsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AnalysisOptionsDto)
  options?: AnalysisOptionsDto;

  @ApiPropertyOptional({
    description: 'Priority level for processing (Enterprise only)',
    enum: ['low', 'normal', 'high'],
    example: 'normal',
  })
  @IsOptional()
  @IsEnum(['low', 'normal', 'high'])
  priority?: string = 'normal';
}
