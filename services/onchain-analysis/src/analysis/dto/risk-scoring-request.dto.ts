import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum, Min, Max, Matches } from 'class-validator';

export enum SupportedChain {
  ETHEREUM = 'ethereum',
  BSC = 'bsc',
  POLYGON = 'polygon',
  ARBITRUM = 'arbitrum',
  OPTIMISM = 'optimism',
  AVALANCHE = 'avalanche',
}

export enum RiskScoringDepth {
  BASIC = 'basic',
  STANDARD = 'standard',
  COMPREHENSIVE = 'comprehensive',
}

export class RiskScoringRequestDto {
  @ApiProperty({
    description: 'Token contract address',
    example: '0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b',
  })
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'tokenAddress must be a valid Ethereum address (0x followed by 40 hexadecimal characters)',
  })
  tokenAddress: string;

  @ApiProperty({
    description: 'Blockchain network',
    enum: SupportedChain,
    example: SupportedChain.ETHEREUM,
  })
  @IsEnum(SupportedChain)
  chainId: SupportedChain;

  @ApiProperty({
    description: 'Depth of risk analysis',
    enum: RiskScoringDepth,
    example: RiskScoringDepth.COMPREHENSIVE,
    required: false,
  })
  @IsOptional()
  @IsEnum(RiskScoringDepth)
  analysisDepth?: RiskScoringDepth = RiskScoringDepth.STANDARD;

  @ApiProperty({
    description: 'Include historical risk trend analysis',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  includeHistoricalTrends?: boolean = false;

  @ApiProperty({
    description: 'Include peer comparison analysis',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  includePeerComparison?: boolean = false;
}

export class TokenDataInputDto {
  @ApiProperty({
    description: 'Token contract address',
    example: '0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b',
  })
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'tokenAddress must be a valid Ethereum address (0x followed by 40 hexadecimal characters)',
  })
  tokenAddress: string;

  @ApiProperty({
    description: 'Blockchain network',
    enum: SupportedChain,
    example: SupportedChain.ETHEREUM,
  })
  @IsEnum(SupportedChain)
  chainId: SupportedChain;

  @ApiProperty({
    description: 'Total liquidity in USD',
    example: 1500000,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  liquidityUsd?: number;

  @ApiProperty({
    description: '24h trading volume in USD',
    example: 750000,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  volume24h?: number;

  @ApiProperty({
    description: '24h price change percentage',
    example: 0.05,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(-1)
  @Max(10)
  priceChange24h?: number;

  @ApiProperty({
    description: '7d price change percentage',
    example: 0.15,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(-1)
  @Max(10)
  priceChange7d?: number;

  @ApiProperty({
    description: 'Market capitalization in USD',
    example: 50000000,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  marketCap?: number;

  @ApiProperty({
    description: 'Number of token holders',
    example: 5000,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  holders?: number;

  @ApiProperty({
    description: 'Top holder percentage (0-1)',
    example: 0.15,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  topHolderPercentage?: number;

  @ApiProperty({
    description: 'Contract age in days',
    example: 365,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  contractAge?: number;

  @ApiProperty({
    description: 'Whether contract is verified',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @ApiProperty({
    description: 'Audit score (0-100)',
    example: 85,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  auditScore?: number;

  @ApiProperty({
    description: '24h transaction count',
    example: 2500,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  transactionCount24h?: number;

  @ApiProperty({
    description: '24h unique traders count',
    example: 1200,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  uniqueTraders24h?: number;

  @ApiProperty({
    description: 'Liquidity concentration ratio (0-1)',
    example: 0.35,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  liquidityConcentration?: number;

  @ApiProperty({
    description: 'Estimated slippage for standard trade (0-1)',
    example: 0.02,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  slippageEstimate?: number;
}

export class BulkRiskScoringRequestDto {
  @ApiProperty({
    description: 'Array of token data for bulk risk scoring',
    type: [TokenDataInputDto],
  })
  tokens: TokenDataInputDto[];

  @ApiProperty({
    description: 'Depth of risk analysis for all tokens',
    enum: RiskScoringDepth,
    example: RiskScoringDepth.STANDARD,
    required: false,
  })
  @IsOptional()
  @IsEnum(RiskScoringDepth)
  analysisDepth?: RiskScoringDepth = RiskScoringDepth.STANDARD;

  @ApiProperty({
    description: 'Include comparative analysis between tokens',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  includeComparison?: boolean = false;
}

export class RiskFactorWeightsDto {
  @ApiProperty({
    description: 'Weight for liquidity factors (0-1)',
    example: 0.25,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  liquidity?: number;

  @ApiProperty({
    description: 'Weight for volatility factors (0-1)',
    example: 0.20,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  volatility?: number;

  @ApiProperty({
    description: 'Weight for holder factors (0-1)',
    example: 0.20,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  holder?: number;

  @ApiProperty({
    description: 'Weight for market factors (0-1)',
    example: 0.20,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  market?: number;

  @ApiProperty({
    description: 'Weight for technical factors (0-1)',
    example: 0.15,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  technical?: number;
}

export class CustomRiskScoringRequestDto extends TokenDataInputDto {
  @ApiProperty({
    description: 'Custom risk factor weights',
    type: RiskFactorWeightsDto,
    required: false,
  })
  @IsOptional()
  customWeights?: RiskFactorWeightsDto;

  @ApiProperty({
    description: 'Minimum confidence threshold (0-1)',
    example: 0.7,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minConfidence?: number;

  @ApiProperty({
    description: 'Include detailed factor breakdown',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  includeFactorBreakdown?: boolean = true;
}
