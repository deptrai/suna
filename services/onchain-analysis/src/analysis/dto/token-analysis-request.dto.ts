/**
 * T2.1.2b: Token Analysis Request DTO
 * Request structure for token data fetching
 */

import { IsString, IsOptional, IsNumber, IsEnum, Min, Max, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum SupportedChain {
  ETHEREUM = 'ethereum',
  BSC = 'bsc',
  POLYGON = 'polygon',
  ARBITRUM = 'arbitrum',
  OPTIMISM = 'optimism',
  AVALANCHE = 'avalanche',
}

export class TokenAnalysisRequestDto {
  @ApiProperty({
    description: 'Project ID for tracking and caching',
    example: 'project-123',
  })
  @IsString()
  projectId: string;

  @ApiProperty({
    description: 'Token contract address',
    example: '0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b',
  })
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'tokenAddress must be a valid Ethereum address (0x followed by 40 hexadecimal characters)',
  })
  tokenAddress: string;

  @ApiPropertyOptional({
    description: 'Blockchain network',
    enum: SupportedChain,
    default: SupportedChain.ETHEREUM,
  })
  @IsOptional()
  @IsEnum(SupportedChain)
  chainId?: SupportedChain;

  @ApiPropertyOptional({
    description: 'Include token metadata in response',
    default: true,
  })
  @IsOptional()
  includeMetadata?: boolean;

  @ApiPropertyOptional({
    description: 'Include price data in response',
    default: true,
  })
  @IsOptional()
  includePriceData?: boolean;

  @ApiPropertyOptional({
    description: 'Include holder information in response',
    default: true,
  })
  @IsOptional()
  includeHolders?: boolean;

  @ApiPropertyOptional({
    description: 'Include transaction data in response',
    default: true,
  })
  @IsOptional()
  includeTransactions?: boolean;

  @ApiPropertyOptional({
    description: 'Maximum number of holders to fetch',
    minimum: 10,
    maximum: 500,
    default: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(500)
  maxHolders?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of transactions to fetch',
    minimum: 10,
    maximum: 500,
    default: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(500)
  maxTransactions?: number;
}
