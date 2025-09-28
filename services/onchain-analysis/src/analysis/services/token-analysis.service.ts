/**
 * T2.1.2b: Token Analysis Service
 * Token metadata retrieval, price and market data, holder information
 */

import { Injectable, Logger } from '@nestjs/common';
import { MoralisService } from '../../external-apis/moralis.service';
import { CacheService } from '../../cache/cache.service';
import { MetricsService } from '../../metrics/metrics.service';
import { TokenAnalysisRequestDto } from '../dto/token-analysis-request.dto';
import {
  TokenAnalysisResponseDto,
  TokenMetadataDto,
  TokenPriceDataDto,
  TokenHoldersAnalysisDto,
  TokenTransactionAnalysisDto,
  TokenHolderDto,
  TokenTransactionDto,
} from '../dto/token-analysis-response.dto';
import { BigNumber } from 'bignumber.js';

@Injectable()
export class TokenAnalysisService {
  private readonly logger = new Logger(TokenAnalysisService.name);

  constructor(
    private readonly moralisService: MoralisService,
    private readonly cacheService: CacheService,
    private readonly metricsService: MetricsService,
  ) {}

  async analyzeToken(request: TokenAnalysisRequestDto): Promise<TokenAnalysisResponseDto> {
    const startTime = Date.now();
    const { projectId, tokenAddress, chainId = 'ethereum' } = request;

    this.logger.log(`Starting token analysis for ${projectId}`, {
      projectId,
      tokenAddress,
      chainId,
    });

    try {
      // Check cache first
      const cacheKey = `token:analysis:${chainId}:${tokenAddress}:${JSON.stringify(request)}`;
      const cachedResult = await this.cacheService.get<TokenAnalysisResponseDto>(cacheKey);
      
      if (cachedResult) {
        this.logger.log(`Cache hit for token analysis ${projectId}`, { projectId, cacheKey });
        this.metricsService.incrementCacheHits('token_analysis');
        return cachedResult;
      }

      // Gather data from Moralis in parallel
      const dataPromises: Promise<any>[] = [];
      const dataSources: string[] = [];

      if (request.includeMetadata !== false) {
        dataPromises.push(this.moralisService.getTokenMetadata(tokenAddress, chainId));
        dataSources.push('moralis_metadata');
      }

      if (request.includePriceData !== false) {
        dataPromises.push(this.moralisService.getTokenPrice(tokenAddress, chainId));
        dataSources.push('moralis_price');
      }

      if (request.includeHolders !== false) {
        dataPromises.push(this.moralisService.getTokenHolders(tokenAddress, chainId, request.maxHolders || 100));
        dataSources.push('moralis_holders');
      }

      if (request.includeTransactions !== false) {
        dataPromises.push(this.moralisService.getTokenTransactions(tokenAddress, chainId, request.maxTransactions || 100));
        dataSources.push('moralis_transactions');
      }

      const results = await Promise.allSettled(dataPromises);
      
      // Process results
      let metadataIndex = 0;
      const metadata = request.includeMetadata !== false ? this.extractSettledValue(results[metadataIndex++]) : null;
      const priceData = request.includePriceData !== false ? this.extractSettledValue(results[metadataIndex++]) : null;
      const holdersData = request.includeHolders !== false ? this.extractSettledValue(results[metadataIndex++]) : null;
      const transactionsData = request.includeTransactions !== false ? this.extractSettledValue(results[metadataIndex++]) : null;

      // Build response
      const response: TokenAnalysisResponseDto = {
        projectId,
        tokenAddress,
        chainId,
        riskScore: 0,
        confidence: 0,
        dataSources,
        warnings: [],
        timestamp: new Date(),
        processingTime: Date.now() - startTime,
      };

      // Process metadata
      if (metadata && request.includeMetadata !== false) {
        response.metadata = this.processTokenMetadata(metadata, tokenAddress, chainId);
      }

      // Process price data
      if (priceData && request.includePriceData !== false) {
        response.priceData = this.processTokenPriceData(priceData);
      }

      // Process holders data
      if (holdersData && request.includeHolders !== false) {
        response.holdersAnalysis = this.processTokenHolders(holdersData, response.priceData);
      }

      // Process transactions data
      if (transactionsData && request.includeTransactions !== false) {
        response.transactionAnalysis = this.processTokenTransactions(transactionsData, response.priceData);
      }

      // Calculate risk score and confidence
      response.riskScore = this.calculateRiskScore(response);
      response.confidence = this.calculateConfidence(response);

      // Add warnings
      this.addWarnings(response);

      // Cache the result
      const cacheTTL = this.getCacheTTL(response.confidence);
      await this.cacheService.set(cacheKey, response, cacheTTL);

      // Record metrics
      this.metricsService.recordResponseTime(
        'POST',
        '/onchain/analyze',
        Date.now() - startTime,
      );

      this.logger.log(`Token analysis completed for ${projectId}`, {
        projectId,
        processingTime: response.processingTime,
        riskScore: response.riskScore,
        confidence: response.confidence,
      });

      return response;

    } catch (error) {
      this.logger.error(`Token analysis failed for ${projectId}`, {
        projectId,
        error: error.message,
        processingTime: Date.now() - startTime,
      });

      this.metricsService.incrementError('token_analysis_error', '/onchain/analyze');
      throw error;
    }
  }

  private processTokenMetadata(data: any, tokenAddress: string, chainId: string): TokenMetadataDto {
    const tokenData = Array.isArray(data) ? data[0] : data;
    
    return {
      name: tokenData?.name || 'Unknown Token',
      symbol: tokenData?.symbol || 'UNKNOWN',
      decimals: tokenData?.decimals || 18,
      logo: tokenData?.logo,
      description: tokenData?.description,
      address: tokenAddress,
      chain: chainId,
    };
  }

  private processTokenPriceData(data: any): TokenPriceDataDto {
    return {
      priceUsd: parseFloat(data?.usdPrice || '0'),
      priceChange24h: parseFloat(data?.['24hrPercentChange'] || '0'),
      volume24h: parseFloat(data?.['24hrVolume'] || '0'),
      marketCap: parseFloat(data?.marketCap || '0'),
      lastUpdated: new Date(),
      source: 'moralis',
    };
  }

  private processTokenHolders(data: any, priceData?: TokenPriceDataDto): TokenHoldersAnalysisDto {
    const holders = data?.result || [];
    const totalSupply = new BigNumber(data?.total || '0');
    
    const processedHolders: TokenHolderDto[] = holders.map((holder: any) => {
      const balance = new BigNumber(holder.balance || '0');
      const balanceFormatted = balance.dividedBy(new BigNumber(10).pow(holder.token_decimals || 18)).toFixed(4);
      const percentage = totalSupply.isZero() ? 0 : balance.dividedBy(totalSupply).multipliedBy(100).toNumber();
      
      return {
        address: holder.owner_address,
        balance: holder.balance,
        balanceFormatted,
        percentage,
        usdValue: priceData ? parseFloat(balanceFormatted) * priceData.priceUsd : undefined,
      };
    });

    // Calculate concentration metrics
    const top10Concentration = processedHolders.slice(0, 10).reduce((sum, holder) => sum + (holder.percentage || 0), 0);
    const top100Concentration = processedHolders.slice(0, 100).reduce((sum, holder) => sum + (holder.percentage || 0), 0);
    
    // Calculate distribution score (higher is better)
    const distributionScore = Math.max(0, 100 - top10Concentration);

    return {
      totalHolders: holders.length,
      top10Concentration,
      top100Concentration,
      distributionScore,
      topHolders: processedHolders.slice(0, 50), // Return top 50 holders
      analyzedAt: new Date(),
    };
  }

  private processTokenTransactions(data: any, priceData?: TokenPriceDataDto): TokenTransactionAnalysisDto {
    const transactions = data?.result || [];
    
    const processedTransactions: TokenTransactionDto[] = transactions.map((tx: any) => {
      const value = new BigNumber(tx.value || '0');
      const valueFormatted = value.dividedBy(new BigNumber(10).pow(tx.token_decimals || 18)).toFixed(4);
      
      return {
        transactionHash: tx.transaction_hash,
        fromAddress: tx.from_address,
        toAddress: tx.to_address,
        value: tx.value,
        valueFormatted,
        timestamp: new Date(tx.block_timestamp),
        blockNumber: parseInt(tx.block_number),
        usdValue: priceData ? parseFloat(valueFormatted) * priceData.priceUsd : undefined,
        type: 'transfer',
      };
    });

    // Calculate 24h metrics
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const recent24h = processedTransactions.filter(tx => tx.timestamp >= yesterday);
    const txCount24h = recent24h.length;
    
    const volume24h = recent24h.reduce((sum, tx) => sum + (tx.usdValue || 0), 0);
    const avgTxSize = txCount24h > 0 ? volume24h / txCount24h : 0;
    
    // Detect whale activity
    const largeTxCount = recent24h.filter(tx => (tx.usdValue || 0) > 10000).length;
    const whaleActivity = largeTxCount > 10 ? 'high' : largeTxCount > 3 ? 'moderate' : 'low';

    return {
      txCount24h,
      avgTxSize,
      volume24h,
      whaleActivity,
      largeTxCount,
      recentTransactions: processedTransactions.slice(0, 20), // Return 20 most recent
      analyzedAt: new Date(),
    };
  }

  private calculateRiskScore(response: TokenAnalysisResponseDto): number {
    let riskScore = 0;
    const factors: string[] = [];

    // Market cap risk
    if (response.priceData?.marketCap) {
      if (response.priceData.marketCap < 1000000) {
        riskScore += 40;
        factors.push('low_market_cap');
      } else if (response.priceData.marketCap < 10000000) {
        riskScore += 25;
        factors.push('small_market_cap');
      }
    }

    // Holder concentration risk
    if (response.holdersAnalysis) {
      if (response.holdersAnalysis.top10Concentration > 50) {
        riskScore += 30;
        factors.push('high_concentration');
      } else if (response.holdersAnalysis.top10Concentration > 30) {
        riskScore += 15;
        factors.push('medium_concentration');
      }
    }

    // Transaction volume risk
    if (response.transactionAnalysis) {
      if (response.transactionAnalysis.txCount24h < 10) {
        riskScore += 20;
        factors.push('low_activity');
      }
      
      if (response.transactionAnalysis.whaleActivity === 'high') {
        riskScore += 15;
        factors.push('high_whale_activity');
      }
    }

    // Data availability risk
    if (response.warnings.length > 2) {
      riskScore += 15;
      factors.push('limited_data');
    }

    return Math.min(riskScore, 100);
  }

  private calculateConfidence(response: TokenAnalysisResponseDto): number {
    let confidence = 1.0;
    const dataPoints: string[] = [];

    if (response.metadata) dataPoints.push('metadata');
    if (response.priceData) dataPoints.push('price');
    if (response.holdersAnalysis) dataPoints.push('holders');
    if (response.transactionAnalysis) dataPoints.push('transactions');

    const maxDataPoints = 4;
    const dataAvailability = dataPoints.length / maxDataPoints;
    confidence *= dataAvailability;

    const warningPenalty = response.warnings.length * 0.1;
    confidence = Math.max(confidence - warningPenalty, 0.1);

    return Math.round(confidence * 100) / 100;
  }

  private addWarnings(response: TokenAnalysisResponseDto): void {
    if (!response.metadata) response.warnings.push('metadata_unavailable');
    if (!response.priceData) response.warnings.push('price_data_unavailable');
    if (!response.holdersAnalysis) response.warnings.push('holders_data_unavailable');
    if (!response.transactionAnalysis) response.warnings.push('transaction_data_unavailable');
    
    if (response.holdersAnalysis?.totalHolders && response.holdersAnalysis.totalHolders < 100) {
      response.warnings.push('low_holder_count');
    }
    
    if (response.transactionAnalysis?.txCount24h && response.transactionAnalysis.txCount24h < 10) {
      response.warnings.push('low_transaction_volume');
    }
  }

  private getCacheTTL(confidence: number): number {
    if (confidence > 0.8) return 900; // 15 minutes
    if (confidence > 0.6) return 600; // 10 minutes
    if (confidence > 0.4) return 300; // 5 minutes
    return 180; // 3 minutes
  }

  private extractSettledValue<T>(settledResult: PromiseSettledResult<T>): T | null {
    return settledResult.status === 'fulfilled' ? settledResult.value : null;
  }
}
