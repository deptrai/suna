/**
 * T2.1.4: DexScreener Analysis Request DTOs
 * Data Transfer Objects for DEX analysis requests
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsEthereumAddress, IsIn } from 'class-validator';

export enum SupportedChain {
  ETHEREUM = 'ethereum',
  BSC = 'bsc',
  POLYGON = 'polygon',
  ARBITRUM = 'arbitrum',
  OPTIMISM = 'optimism',
  AVALANCHE = 'avalanche',
  FANTOM = 'fantom',
  CRONOS = 'cronos',
}

export enum AnalysisDepth {
  BASIC = 'basic',
  DETAILED = 'detailed',
  COMPREHENSIVE = 'comprehensive',
}

export class DexPairAnalysisRequestDto {
  @ApiProperty({
    description: 'DEX pair address to analyze',
    example: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
  })
  @IsString()
  @IsEthereumAddress()
  pairAddress: string;

  @ApiPropertyOptional({
    description: 'Blockchain network',
    enum: SupportedChain,
    example: SupportedChain.ETHEREUM,
  })
  @IsOptional()
  @IsEnum(SupportedChain)
  chainId?: SupportedChain;

  @ApiPropertyOptional({
    description: 'Analysis depth level',
    enum: AnalysisDepth,
    default: AnalysisDepth.DETAILED,
  })
  @IsOptional()
  @IsEnum(AnalysisDepth)
  analysisDepth?: AnalysisDepth = AnalysisDepth.DETAILED;
}

export class TokenLiquidityAnalysisRequestDto {
  @ApiProperty({
    description: 'Token contract address',
    example: '0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b',
  })
  @IsString()
  @IsEthereumAddress()
  tokenAddress: string;

  @ApiPropertyOptional({
    description: 'Specific blockchain to analyze (if not provided, analyzes all chains)',
    enum: SupportedChain,
    example: SupportedChain.ETHEREUM,
  })
  @IsOptional()
  @IsEnum(SupportedChain)
  chainId?: SupportedChain;

  @ApiPropertyOptional({
    description: 'Analysis depth level',
    enum: AnalysisDepth,
    default: AnalysisDepth.COMPREHENSIVE,
  })
  @IsOptional()
  @IsEnum(AnalysisDepth)
  analysisDepth?: AnalysisDepth = AnalysisDepth.COMPREHENSIVE;

  @ApiPropertyOptional({
    description: 'Include impermanent loss calculations',
    default: true,
  })
  @IsOptional()
  includeImpermanentLoss?: boolean = true;

  @ApiPropertyOptional({
    description: 'Include slippage estimations',
    default: true,
  })
  @IsOptional()
  includeSlippageAnalysis?: boolean = true;
}

export class DexTradingAnalysisRequestDto {
  @ApiProperty({
    description: 'Token contract address',
    example: '0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b',
  })
  @IsString()
  @IsEthereumAddress()
  tokenAddress: string;

  @ApiPropertyOptional({
    description: 'Blockchain network',
    enum: SupportedChain,
    example: SupportedChain.ETHEREUM,
  })
  @IsOptional()
  @IsEnum(SupportedChain)
  chainId?: SupportedChain;

  @ApiPropertyOptional({
    description: 'Time period for analysis',
    enum: ['5m', '1h', '6h', '24h'],
    default: '24h',
  })
  @IsOptional()
  @IsIn(['5m', '1h', '6h', '24h'])
  timePeriod?: string = '24h';

  @ApiPropertyOptional({
    description: 'Include whale activity analysis',
    default: true,
  })
  @IsOptional()
  includeWhaleActivity?: boolean = true;

  @ApiPropertyOptional({
    description: 'Include buy/sell pressure analysis',
    default: true,
  })
  @IsOptional()
  includeBuySellPressure?: boolean = true;
}

export class MultiDexComparisonRequestDto {
  @ApiProperty({
    description: 'Token contract address',
    example: '0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b',
  })
  @IsString()
  @IsEthereumAddress()
  tokenAddress: string;

  @ApiPropertyOptional({
    description: 'Blockchain networks to compare',
    type: [String],
    enum: SupportedChain,
    example: [SupportedChain.ETHEREUM, SupportedChain.BSC],
  })
  @IsOptional()
  @IsEnum(SupportedChain, { each: true })
  chainIds?: SupportedChain[];

  @ApiPropertyOptional({
    description: 'Minimum liquidity threshold (USD)',
    default: 1000,
  })
  @IsOptional()
  minLiquidityUsd?: number = 1000;

  @ApiPropertyOptional({
    description: 'Include arbitrage opportunities',
    default: true,
  })
  @IsOptional()
  includeArbitrageOpportunities?: boolean = true;
}
