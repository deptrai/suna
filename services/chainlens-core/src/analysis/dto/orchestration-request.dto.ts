import { IsString, IsOptional, IsEnum, IsArray, ValidateNested, IsBoolean, IsNumber } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrchestrationOptionsDto {
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

  // Orchestration-specific options
  @ApiPropertyOptional({
    description: 'Enable parallel execution of services',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  parallelExecution?: boolean = true;

  @ApiPropertyOptional({
    description: 'Maximum number of concurrent service calls',
    example: 4,
    minimum: 1,
    maximum: 10,
  })
  @IsOptional()
  @IsNumber()
  maxConcurrency?: number;

  @ApiPropertyOptional({
    description: 'Timeout for service calls in milliseconds',
    example: 30000,
    minimum: 1000,
    maximum: 120000,
  })
  @IsOptional()
  @IsNumber()
  timeout?: number;

  @ApiPropertyOptional({
    description: 'Number of retry attempts for failed services',
    example: 2,
    minimum: 0,
    maximum: 5,
  })
  @IsOptional()
  @IsNumber()
  retryAttempts?: number;

  @ApiPropertyOptional({
    description: 'Fail fast on first service error',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  failFast?: boolean = false;

  @ApiPropertyOptional({
    description: 'Strategy for aggregating service responses',
    enum: ['all', 'partial', 'best_effort'],
    example: 'best_effort',
  })
  @IsOptional()
  @IsEnum(['all', 'partial', 'best_effort'])
  aggregationStrategy?: 'all' | 'partial' | 'best_effort' = 'best_effort';

  @ApiPropertyOptional({
    description: 'Required services that must succeed',
    example: ['onchain'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredServices?: string[];

  @ApiPropertyOptional({
    description: 'Optional services that can fail',
    example: ['sentiment', 'tokenomics', 'team'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  optionalServices?: string[];

  @ApiPropertyOptional({
    description: 'Enable fallback strategies when services fail',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enableFallbacks?: boolean = true;

  @ApiPropertyOptional({
    description: 'Enable priority-based execution',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  priorityExecution?: boolean = false;

  @ApiPropertyOptional({
    description: 'Enforce service dependencies',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enforceDepencies?: boolean = true;

  @ApiPropertyOptional({
    description: 'Simulate service failures for testing',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  simulateFailures?: boolean = false;

  @ApiPropertyOptional({
    description: 'Collect detailed metrics',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  collectMetrics?: boolean = true;

  @ApiPropertyOptional({
    description: 'Enable error recovery mechanisms',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  errorRecovery?: boolean = true;
}

export class OrchestrationRequestDto {
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
  @IsNumber()
  chainId?: number;

  @ApiPropertyOptional({
    description: 'Orchestration options and configuration',
    type: OrchestrationOptionsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrchestrationOptionsDto)
  options?: OrchestrationOptionsDto;

  @ApiPropertyOptional({
    description: 'Priority level for processing (Enterprise only)',
    enum: ['low', 'normal', 'high'],
    example: 'normal',
  })
  @IsOptional()
  @IsEnum(['low', 'normal', 'high'])
  priority?: string = 'normal';

  // Direct orchestration fields for backward compatibility
  @ApiPropertyOptional({
    description: 'Enable parallel execution of services',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  parallelExecution?: boolean;

  @ApiPropertyOptional({
    description: 'Maximum number of concurrent service calls',
    example: 4,
    minimum: 1,
    maximum: 10,
  })
  @IsOptional()
  @IsNumber()
  maxConcurrency?: number;

  @ApiPropertyOptional({
    description: 'Timeout for service calls in milliseconds',
    example: 30000,
    minimum: 1000,
    maximum: 120000,
  })
  @IsOptional()
  @IsNumber()
  timeout?: number;

  @ApiPropertyOptional({
    description: 'Number of retry attempts for failed services',
    example: 2,
    minimum: 0,
    maximum: 5,
  })
  @IsOptional()
  @IsNumber()
  retryAttempts?: number;

  @ApiPropertyOptional({
    description: 'Fail fast on first service error',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  failFast?: boolean;

  @ApiPropertyOptional({
    description: 'Strategy for aggregating service responses',
    enum: ['all', 'partial', 'best_effort'],
    example: 'best_effort',
  })
  @IsOptional()
  @IsEnum(['all', 'partial', 'best_effort'])
  aggregationStrategy?: 'all' | 'partial' | 'best_effort';

  @ApiPropertyOptional({
    description: 'Required services that must succeed',
    example: ['onchain'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredServices?: string[];

  @ApiPropertyOptional({
    description: 'Optional services that can fail',
    example: ['sentiment', 'tokenomics', 'team'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  optionalServices?: string[];

  @ApiPropertyOptional({
    description: 'Enable fallback strategies when services fail',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enableFallbacks?: boolean;

  @ApiPropertyOptional({
    description: 'Enable priority-based execution',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  priorityExecution?: boolean;

  @ApiPropertyOptional({
    description: 'Enforce service dependencies',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enforceDepencies?: boolean;

  @ApiPropertyOptional({
    description: 'Simulate service failures for testing',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  simulateFailures?: boolean;

  @ApiPropertyOptional({
    description: 'Collect detailed metrics',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  collectMetrics?: boolean;

  @ApiPropertyOptional({
    description: 'Enable error recovery mechanisms',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  errorRecovery?: boolean;
}
