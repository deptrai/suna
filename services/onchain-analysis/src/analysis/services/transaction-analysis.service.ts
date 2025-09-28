/**
 * T2.1.2c: Transaction Analysis Service
 * Recent transaction fetching, volume analysis, whale activity detection
 */

import { Injectable, Logger } from '@nestjs/common';
import { MoralisService } from '../../external-apis/moralis.service';
import { CacheService } from '../../cache/cache.service';
import { MetricsService } from '../../metrics/metrics.service';
import { BigNumber } from 'bignumber.js';

export interface TransactionAnalysisRequest {
  tokenAddress: string;
  chainId?: string;
  timeframe?: '1h' | '24h' | '7d' | '30d';
  includeWhaleActivity?: boolean;
  includeVolumeAnalysis?: boolean;
  maxTransactions?: number;
}

export interface WhaleTransaction {
  hash: string;
  fromAddress: string;
  toAddress: string;
  value: string;
  valueFormatted: string;
  usdValue: number;
  timestamp: Date;
  blockNumber: number;
  whaleType: 'large_holder' | 'exchange' | 'unknown';
}

export interface VolumeAnalysis {
  totalVolume24h: number;
  totalVolumeUsd24h: number;
  transactionCount24h: number;
  averageTransactionSize: number;
  medianTransactionSize: number;
  volumeByHour: Array<{
    hour: number;
    volume: number;
    volumeUsd: number;
    txCount: number;
  }>;
  topTransactions: WhaleTransaction[];
}

export interface WhaleActivityAnalysis {
  whaleTransactionCount: number;
  whaleVolumeUsd: number;
  whaleVolumePercentage: number;
  activityLevel: 'low' | 'moderate' | 'high' | 'extreme';
  largeTransactions: WhaleTransaction[];
  suspiciousPatterns: string[];
}

export interface TransactionAnalysisResponse {
  tokenAddress: string;
  chainId: string;
  timeframe: string;
  volumeAnalysis?: VolumeAnalysis;
  whaleActivity?: WhaleActivityAnalysis;
  riskFactors: string[];
  confidence: number;
  analyzedAt: Date;
  processingTime: number;
}

@Injectable()
export class TransactionAnalysisService {
  private readonly logger = new Logger(TransactionAnalysisService.name);

  // Whale thresholds in USD
  private readonly WHALE_THRESHOLDS = {
    large: 10000,    // $10k+
    whale: 100000,   // $100k+
    mega: 1000000,   // $1M+
  };

  constructor(
    private readonly moralisService: MoralisService,
    private readonly cacheService: CacheService,
    private readonly metricsService: MetricsService,
  ) {}

  async analyzeTransactions(request: TransactionAnalysisRequest): Promise<TransactionAnalysisResponse> {
    const startTime = Date.now();
    const { tokenAddress, chainId = 'ethereum', timeframe = '24h' } = request;

    this.logger.log(`Starting transaction analysis for ${tokenAddress}`, {
      tokenAddress,
      chainId,
      timeframe,
    });

    try {
      // Check cache first
      const cacheKey = `transaction:analysis:${chainId}:${tokenAddress}:${timeframe}`;
      const cached = await this.cacheService.get<TransactionAnalysisResponse>(cacheKey);
      
      if (cached) {
        this.logger.log(`Cache hit for transaction analysis`, { tokenAddress, cacheKey });
        this.metricsService.incrementCacheHits('transaction_analysis');
        return cached;
      }

      // Fetch transaction data
      const [transactionsData, priceData] = await Promise.allSettled([
        this.moralisService.getTokenTransactions(tokenAddress, chainId, request.maxTransactions || 500),
        this.moralisService.getTokenPrice(tokenAddress, chainId),
      ]);

      const transactions = this.extractSettledValue(transactionsData);
      const price = this.extractSettledValue(priceData);

      if (!transactions) {
        throw new Error('Failed to fetch transaction data');
      }

      // Build response
      const response: TransactionAnalysisResponse = {
        tokenAddress,
        chainId,
        timeframe,
        riskFactors: [],
        confidence: 0,
        analyzedAt: new Date(),
        processingTime: Date.now() - startTime,
      };

      // Analyze volume if requested
      if (request.includeVolumeAnalysis !== false) {
        response.volumeAnalysis = this.analyzeVolume(transactions, price, timeframe);
      }

      // Analyze whale activity if requested
      if (request.includeWhaleActivity !== false) {
        response.whaleActivity = this.analyzeWhaleActivity(transactions, price);
      }

      // Calculate risk factors and confidence
      response.riskFactors = this.calculateRiskFactors(response);
      response.confidence = this.calculateConfidence(response);

      // Cache the result
      const cacheTTL = this.getCacheTTL(timeframe);
      await this.cacheService.set(cacheKey, response, cacheTTL);

      // Record metrics
      this.metricsService.recordResponseTime(
        'POST',
        '/transaction/analyze',
        Date.now() - startTime,
      );

      this.logger.log(`Transaction analysis completed for ${tokenAddress}`, {
        tokenAddress,
        processingTime: response.processingTime,
        confidence: response.confidence,
        riskFactors: response.riskFactors.length,
      });

      return response;

    } catch (error) {
      this.logger.error(`Transaction analysis failed for ${tokenAddress}`, {
        tokenAddress,
        error: error.message,
        processingTime: Date.now() - startTime,
      });

      this.metricsService.incrementError('transaction_analysis_error', '/transaction/analyze');
      throw error;
    }
  }

  private analyzeVolume(transactions: any, priceData: any, timeframe: string): VolumeAnalysis {
    const txList = transactions?.result || [];
    const currentPrice = parseFloat(priceData?.usdPrice || '0');
    
    // Filter transactions by timeframe
    const now = new Date();
    const timeframeDuration = this.getTimeframeDuration(timeframe);
    const cutoffTime = new Date(now.getTime() - timeframeDuration);
    
    const recentTxs = txList.filter((tx: any) => 
      new Date(tx.block_timestamp) >= cutoffTime
    );

    // Calculate volume metrics
    let totalVolume = new BigNumber(0);
    let totalVolumeUsd = 0;
    const transactionSizes: number[] = [];
    const volumeByHour: Array<{ hour: number; volume: number; volumeUsd: number; txCount: number }> = [];

    // Initialize hourly buckets
    for (let i = 0; i < 24; i++) {
      volumeByHour.push({ hour: i, volume: 0, volumeUsd: 0, txCount: 0 });
    }

    const topTransactions: WhaleTransaction[] = [];

    recentTxs.forEach((tx: any) => {
      const value = new BigNumber(tx.value || '0');
      const valueFormatted = value.dividedBy(new BigNumber(10).pow(tx.token_decimals || 18));
      const usdValue = valueFormatted.multipliedBy(currentPrice).toNumber();
      
      totalVolume = totalVolume.plus(valueFormatted);
      totalVolumeUsd += usdValue;
      transactionSizes.push(usdValue);

      // Add to hourly bucket
      const txTime = new Date(tx.block_timestamp);
      const hour = txTime.getHours();
      volumeByHour[hour].volume += valueFormatted.toNumber();
      volumeByHour[hour].volumeUsd += usdValue;
      volumeByHour[hour].txCount += 1;

      // Track large transactions
      if (usdValue >= this.WHALE_THRESHOLDS.large) {
        topTransactions.push({
          hash: tx.transaction_hash,
          fromAddress: tx.from_address,
          toAddress: tx.to_address,
          value: tx.value,
          valueFormatted: valueFormatted.toFixed(4),
          usdValue,
          timestamp: new Date(tx.block_timestamp),
          blockNumber: parseInt(tx.block_number),
          whaleType: this.classifyWhaleType(tx.from_address, tx.to_address, usdValue),
        });
      }
    });

    // Sort top transactions by USD value
    topTransactions.sort((a, b) => b.usdValue - a.usdValue);

    // Calculate statistics
    transactionSizes.sort((a, b) => a - b);
    const medianIndex = Math.floor(transactionSizes.length / 2);
    const medianTransactionSize = transactionSizes.length > 0 ? 
      (transactionSizes.length % 2 === 0 ? 
        (transactionSizes[medianIndex - 1] + transactionSizes[medianIndex]) / 2 : 
        transactionSizes[medianIndex]) : 0;

    return {
      totalVolume24h: totalVolume.toNumber(),
      totalVolumeUsd24h: totalVolumeUsd,
      transactionCount24h: recentTxs.length,
      averageTransactionSize: recentTxs.length > 0 ? totalVolumeUsd / recentTxs.length : 0,
      medianTransactionSize,
      volumeByHour,
      topTransactions: topTransactions.slice(0, 10),
    };
  }

  private analyzeWhaleActivity(transactions: any, priceData: any): WhaleActivityAnalysis {
    const txList = transactions?.result || [];
    const currentPrice = parseFloat(priceData?.usdPrice || '0');
    
    // Filter for recent transactions (24h)
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const recentTxs = txList.filter((tx: any) => 
      new Date(tx.block_timestamp) >= yesterday
    );

    let whaleVolumeUsd = 0;
    let totalVolumeUsd = 0;
    const largeTransactions: WhaleTransaction[] = [];
    const suspiciousPatterns: string[] = [];

    // Analyze each transaction
    recentTxs.forEach((tx: any) => {
      const value = new BigNumber(tx.value || '0');
      const valueFormatted = value.dividedBy(new BigNumber(10).pow(tx.token_decimals || 18));
      const usdValue = valueFormatted.multipliedBy(currentPrice).toNumber();
      
      totalVolumeUsd += usdValue;

      if (usdValue >= this.WHALE_THRESHOLDS.large) {
        whaleVolumeUsd += usdValue;
        
        largeTransactions.push({
          hash: tx.transaction_hash,
          fromAddress: tx.from_address,
          toAddress: tx.to_address,
          value: tx.value,
          valueFormatted: valueFormatted.toFixed(4),
          usdValue,
          timestamp: new Date(tx.block_timestamp),
          blockNumber: parseInt(tx.block_number),
          whaleType: this.classifyWhaleType(tx.from_address, tx.to_address, usdValue),
        });
      }
    });

    // Detect suspicious patterns
    this.detectSuspiciousPatterns(largeTransactions, suspiciousPatterns);

    // Calculate activity level
    const whaleTransactionCount = largeTransactions.length;
    const whaleVolumePercentage = totalVolumeUsd > 0 ? (whaleVolumeUsd / totalVolumeUsd) * 100 : 0;
    
    let activityLevel: 'low' | 'moderate' | 'high' | 'extreme' = 'low';
    if (whaleTransactionCount > 20 || whaleVolumePercentage > 80) {
      activityLevel = 'extreme';
    } else if (whaleTransactionCount > 10 || whaleVolumePercentage > 60) {
      activityLevel = 'high';
    } else if (whaleTransactionCount > 3 || whaleVolumePercentage > 30) {
      activityLevel = 'moderate';
    }

    return {
      whaleTransactionCount,
      whaleVolumeUsd,
      whaleVolumePercentage,
      activityLevel,
      largeTransactions: largeTransactions.slice(0, 20),
      suspiciousPatterns,
    };
  }

  private classifyWhaleType(fromAddress: string, toAddress: string, usdValue: number): 'large_holder' | 'exchange' | 'unknown' {
    // Simple heuristics for whale classification
    // In production, this would use a database of known addresses
    
    const knownExchanges = [
      '0x28c6c06298d514db089934071355e5743bf21d60', // Binance
      '0x21a31ee1afc51d94c2efccaa2092ad1028285549', // Binance 2
      '0x564286362092d8e7936f0549571a803b203aaced', // Binance 3
      // Add more known exchange addresses
    ];

    if (knownExchanges.includes(fromAddress.toLowerCase()) || 
        knownExchanges.includes(toAddress.toLowerCase())) {
      return 'exchange';
    }

    if (usdValue >= this.WHALE_THRESHOLDS.mega) {
      return 'large_holder';
    }

    return 'unknown';
  }

  private detectSuspiciousPatterns(transactions: WhaleTransaction[], patterns: string[]): void {
    // Detect rapid large transactions
    const rapidTxs = transactions.filter((tx, index) => {
      if (index === 0) return false;
      const prevTx = transactions[index - 1];
      const timeDiff = tx.timestamp.getTime() - prevTx.timestamp.getTime();
      return timeDiff < 60000; // Less than 1 minute apart
    });

    if (rapidTxs.length > 3) {
      patterns.push('rapid_large_transactions');
    }

    // Detect circular transactions
    const addressPairs = new Map<string, number>();
    transactions.forEach(tx => {
      const pair = [tx.fromAddress, tx.toAddress].sort().join('-');
      addressPairs.set(pair, (addressPairs.get(pair) || 0) + 1);
    });

    for (const [pair, count] of addressPairs) {
      if (count > 2) {
        patterns.push('circular_transactions');
        break;
      }
    }

    // Detect unusual volume spikes
    const hourlyVolumes = new Map<number, number>();
    transactions.forEach(tx => {
      const hour = tx.timestamp.getHours();
      hourlyVolumes.set(hour, (hourlyVolumes.get(hour) || 0) + tx.usdValue);
    });

    const volumes = Array.from(hourlyVolumes.values());
    if (volumes.length > 0) {
      const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
      const maxVolume = Math.max(...volumes);
      
      if (maxVolume > avgVolume * 5) {
        patterns.push('volume_spike');
      }
    }
  }

  private calculateRiskFactors(response: TransactionAnalysisResponse): string[] {
    const factors: string[] = [];

    if (response.whaleActivity) {
      if (response.whaleActivity.activityLevel === 'extreme') {
        factors.push('extreme_whale_activity');
      } else if (response.whaleActivity.activityLevel === 'high') {
        factors.push('high_whale_activity');
      }

      if (response.whaleActivity.whaleVolumePercentage > 70) {
        factors.push('whale_dominated_volume');
      }

      factors.push(...response.whaleActivity.suspiciousPatterns);
    }

    if (response.volumeAnalysis) {
      if (response.volumeAnalysis.transactionCount24h < 10) {
        factors.push('low_transaction_volume');
      }

      if (response.volumeAnalysis.averageTransactionSize > 50000) {
        factors.push('large_average_transaction_size');
      }
    }

    return factors;
  }

  private calculateConfidence(response: TransactionAnalysisResponse): number {
    let confidence = 1.0;

    // Reduce confidence based on data availability
    if (!response.volumeAnalysis) confidence *= 0.7;
    if (!response.whaleActivity) confidence *= 0.7;

    // Reduce confidence based on transaction count
    if (response.volumeAnalysis?.transactionCount24h) {
      if (response.volumeAnalysis.transactionCount24h < 10) {
        confidence *= 0.5;
      } else if (response.volumeAnalysis.transactionCount24h < 50) {
        confidence *= 0.8;
      }
    }

    return Math.round(confidence * 100) / 100;
  }

  private getTimeframeDuration(timeframe: string): number {
    switch (timeframe) {
      case '1h': return 60 * 60 * 1000;
      case '24h': return 24 * 60 * 60 * 1000;
      case '7d': return 7 * 24 * 60 * 60 * 1000;
      case '30d': return 30 * 24 * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000;
    }
  }

  private getCacheTTL(timeframe: string): number {
    switch (timeframe) {
      case '1h': return 300; // 5 minutes
      case '24h': return 600; // 10 minutes
      case '7d': return 1800; // 30 minutes
      case '30d': return 3600; // 1 hour
      default: return 600;
    }
  }

  private extractSettledValue<T>(settledResult: PromiseSettledResult<T>): T | null {
    return settledResult.status === 'fulfilled' ? settledResult.value : null;
  }
}
