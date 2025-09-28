/**
 * T2.1.2b: Token Analysis Response DTO
 * Response structure for token data fetching
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TokenMetadataDto {
  @ApiProperty({ description: 'Token name', example: 'Ethereum' })
  name: string;

  @ApiProperty({ description: 'Token symbol', example: 'ETH' })
  symbol: string;

  @ApiProperty({ description: 'Token decimals', example: 18 })
  decimals: number;

  @ApiPropertyOptional({ description: 'Token logo URL' })
  logo?: string;

  @ApiPropertyOptional({ description: 'Token description' })
  description?: string;

  @ApiProperty({ description: 'Token contract address' })
  address: string;

  @ApiProperty({ description: 'Blockchain network' })
  chain: string;
}

export class TokenPriceDataDto {
  @ApiProperty({ description: 'Current price in USD', example: 2500.50 })
  priceUsd: number;

  @ApiPropertyOptional({ description: 'Price change in 24h (%)', example: 5.2 })
  priceChange24h?: number;

  @ApiPropertyOptional({ description: '24h trading volume in USD', example: 1250000 })
  volume24h?: number;

  @ApiPropertyOptional({ description: 'Market capitalization in USD', example: 300000000 })
  marketCap?: number;

  @ApiProperty({ description: 'Last updated timestamp' })
  lastUpdated: Date;

  @ApiPropertyOptional({ description: 'Data source', example: 'moralis' })
  source?: string;
}

export class TokenHolderDto {
  @ApiProperty({ description: 'Holder wallet address' })
  address: string;

  @ApiProperty({ description: 'Token balance (raw)', example: '1000000000000000000' })
  balance: string;

  @ApiProperty({ description: 'Token balance (formatted)', example: '1.0' })
  balanceFormatted: string;

  @ApiPropertyOptional({ description: 'Percentage of total supply', example: 0.5 })
  percentage?: number;

  @ApiPropertyOptional({ description: 'USD value of holdings', example: 2500.50 })
  usdValue?: number;
}

export class TokenTransactionDto {
  @ApiProperty({ description: 'Transaction hash' })
  transactionHash: string;

  @ApiProperty({ description: 'From address' })
  fromAddress: string;

  @ApiProperty({ description: 'To address' })
  toAddress: string;

  @ApiProperty({ description: 'Token amount transferred (raw)' })
  value: string;

  @ApiProperty({ description: 'Token amount transferred (formatted)' })
  valueFormatted: string;

  @ApiProperty({ description: 'Transaction timestamp' })
  timestamp: Date;

  @ApiProperty({ description: 'Block number' })
  blockNumber: number;

  @ApiPropertyOptional({ description: 'USD value at time of transaction' })
  usdValue?: number;

  @ApiPropertyOptional({ description: 'Transaction type', example: 'transfer' })
  type?: string;
}

export class TokenHoldersAnalysisDto {
  @ApiProperty({ description: 'Total number of holders', example: 15000 })
  totalHolders: number;

  @ApiProperty({ description: 'Top 10 holders concentration (%)', example: 25.5 })
  top10Concentration: number;

  @ApiProperty({ description: 'Top 100 holders concentration (%)', example: 65.2 })
  top100Concentration: number;

  @ApiProperty({ description: 'Distribution score (0-100)', example: 75 })
  distributionScore: number;

  @ApiProperty({ description: 'List of top holders', type: [TokenHolderDto] })
  topHolders: TokenHolderDto[];

  @ApiProperty({ description: 'Analysis timestamp' })
  analyzedAt: Date;
}

export class TokenTransactionAnalysisDto {
  @ApiProperty({ description: '24h transaction count', example: 2500 })
  txCount24h: number;

  @ApiProperty({ description: 'Average transaction size (USD)', example: 500 })
  avgTxSize: number;

  @ApiProperty({ description: 'Total volume 24h (USD)', example: 1250000 })
  volume24h: number;

  @ApiProperty({ description: 'Whale activity level', example: 'moderate' })
  whaleActivity: 'low' | 'moderate' | 'high';

  @ApiProperty({ description: 'Large transactions (>$10k) count', example: 15 })
  largeTxCount: number;

  @ApiProperty({ description: 'Recent transactions', type: [TokenTransactionDto] })
  recentTransactions: TokenTransactionDto[];

  @ApiProperty({ description: 'Analysis timestamp' })
  analyzedAt: Date;
}

export class TokenAnalysisResponseDto {
  @ApiProperty({ description: 'Project ID' })
  projectId: string;

  @ApiProperty({ description: 'Token contract address' })
  tokenAddress: string;

  @ApiProperty({ description: 'Blockchain network' })
  chainId: string;

  @ApiProperty({ description: 'Overall risk score (0-100)', example: 75 })
  riskScore: number;

  @ApiProperty({ description: 'Analysis confidence (0-1)', example: 0.85 })
  confidence: number;

  @ApiPropertyOptional({ description: 'Token metadata', type: TokenMetadataDto })
  metadata?: TokenMetadataDto;

  @ApiPropertyOptional({ description: 'Price data', type: TokenPriceDataDto })
  priceData?: TokenPriceDataDto;

  @ApiPropertyOptional({ description: 'Holders analysis', type: TokenHoldersAnalysisDto })
  holdersAnalysis?: TokenHoldersAnalysisDto;

  @ApiPropertyOptional({ description: 'Transaction analysis', type: TokenTransactionAnalysisDto })
  transactionAnalysis?: TokenTransactionAnalysisDto;

  @ApiProperty({ description: 'Data sources used', example: ['moralis', 'cache'] })
  dataSources: string[];

  @ApiProperty({ description: 'Analysis warnings', example: ['low_liquidity'] })
  warnings: string[];

  @ApiProperty({ description: 'Analysis timestamp' })
  timestamp: Date;

  @ApiProperty({ description: 'Processing time in milliseconds', example: 1250 })
  processingTime: number;
}
