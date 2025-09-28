/**
 * T2.1.4a: DexScreener Integration Service
 * DEX data client for pair information, trading volume, and price movements
 */

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { MetricsService } from '../metrics/metrics.service';

// DexScreener API Response Interfaces
export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd?: string;
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  liquidity?: {
    usd?: number;
    base: number;
    quote: number;
  };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
}

export interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerPair[];
}

// Analysis DTOs
export interface DexPairAnalysis {
  pairAddress: string;
  chainId: string;
  dexId: string;
  baseToken: {
    address: string;
    symbol: string;
    name: string;
  };
  quoteToken: {
    address: string;
    symbol: string;
    name: string;
  };
  priceData: {
    currentPriceUsd: number;
    priceNative: number;
    priceChanges: {
      m5: number;
      h1: number;
      h6: number;
      h24: number;
    };
  };
  volumeData: {
    volume24h: number;
    volume6h: number;
    volume1h: number;
    volume5m: number;
    volumeChangePercent: number;
  };
  liquidityData: {
    totalLiquidityUsd: number;
    baseLiquidity: number;
    quoteLiquidity: number;
    liquidityScore: number; // 0-100
  };
  tradingActivity: {
    transactions24h: number;
    buyPressure: number; // 0-100 (buys vs sells ratio)
    tradingScore: number; // 0-100
  };
  riskMetrics: {
    volatilityScore: number; // 0-100
    liquidityRisk: 'low' | 'medium' | 'high' | 'extreme';
    tradingRisk: 'low' | 'medium' | 'high' | 'extreme';
    overallRisk: 'low' | 'medium' | 'high' | 'extreme';
  };
  metadata: {
    pairAge: number; // days since creation
    fdv: number;
    marketCap: number;
    lastUpdated: string;
    dataFreshness: number; // 0-1
  };
}

export interface LiquidityAnalysis {
  tokenAddress: string;
  chainId: string;
  totalPairs: number;
  totalLiquidityUsd: number;
  liquidityDistribution: {
    dexId: string;
    pairAddress: string;
    liquidityUsd: number;
    liquidityShare: number; // percentage
    volume24h: number;
  }[];
  liquidityMetrics: {
    concentrationRisk: number; // 0-100 (higher = more concentrated)
    liquidityStability: 'stable' | 'volatile' | 'highly_volatile';
    averageSlippage: number; // estimated for $1000 trade
    impermanentLossRisk: 'low' | 'medium' | 'high' | 'extreme';
  };
  recommendations: string[];
  warnings: string[];
}

@Injectable()
export class DexScreenerService {
  private readonly logger = new Logger(DexScreenerService.name);
  private readonly baseUrl = 'https://api.dexscreener.com/latest';
  private readonly requestCount = new Map<string, number>();
  private readonly maxRequestsPerSecond = 5; // DexScreener rate limit

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {
    this.logger.log('DexScreener service initialized', {
      baseUrl: this.baseUrl,
      rateLimit: this.maxRequestsPerSecond,
    });
  }

  /**
   * T2.1.4a: Get pair information by token address
   */
  async getPairsByToken(tokenAddress: string): Promise<DexScreenerPair[]> {
    const startTime = Date.now();
    
    try {
      await this.enforceRateLimit();
      
      const url = `${this.baseUrl}/dex/tokens/${tokenAddress}`;
      this.logger.debug(`Fetching pairs for token: ${tokenAddress}`);

      const response = await firstValueFrom(
        this.httpService.get<DexScreenerResponse>(url, {
          timeout: 30000,
          headers: {
            'User-Agent': 'ChainLens-OnChain-Analysis/1.0',
          },
        })
      );

      const pairs = response.data.pairs || [];
      
      this.metricsService.recordExternalApiCall(
        'dexscreener',
        'getPairsByToken',
        'success',
        Date.now() - startTime
      );

      this.logger.log(`Found ${pairs.length} pairs for token ${tokenAddress}`);
      return pairs;

    } catch (error) {
      this.metricsService.recordExternalApiCall(
        'dexscreener',
        'getPairsByToken',
        'error',
        Date.now() - startTime
      );

      this.logger.error(`Error fetching pairs for token ${tokenAddress}:`, error.message);
      
      if (error.response?.status === 429) {
        throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
      }
      
      throw new HttpException(
        `Failed to fetch pair data: ${error.message}`,
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  /**
   * T2.1.4a: Get specific pair information
   */
  async getPairInfo(pairAddress: string): Promise<DexScreenerPair | null> {
    const startTime = Date.now();
    
    try {
      await this.enforceRateLimit();
      
      const url = `${this.baseUrl}/dex/pairs/${pairAddress}`;
      this.logger.debug(`Fetching pair info: ${pairAddress}`);

      const response = await firstValueFrom(
        this.httpService.get<DexScreenerResponse>(url, {
          timeout: 30000,
        })
      );

      const pair = response.data.pairs?.[0] || null;
      
      this.metricsService.recordExternalApiCall(
        'dexscreener',
        'getPairInfo',
        'success',
        Date.now() - startTime
      );

      return pair;

    } catch (error) {
      this.metricsService.recordExternalApiCall(
        'dexscreener',
        'getPairInfo',
        'error',
        Date.now() - startTime
      );

      this.logger.error(`Error fetching pair ${pairAddress}:`, error.message);
      return null;
    }
  }

  /**
   * T2.1.4a: Analyze DEX pair with comprehensive metrics
   */
  async analyzePair(pairAddress: string): Promise<DexPairAnalysis | null> {
    const pair = await this.getPairInfo(pairAddress);
    if (!pair) return null;

    const analysis: DexPairAnalysis = {
      pairAddress: pair.pairAddress,
      chainId: pair.chainId,
      dexId: pair.dexId,
      baseToken: {
        address: pair.baseToken.address,
        symbol: pair.baseToken.symbol,
        name: pair.baseToken.name,
      },
      quoteToken: {
        address: pair.quoteToken.address,
        symbol: pair.quoteToken.symbol,
        name: pair.quoteToken.name,
      },
      priceData: {
        currentPriceUsd: parseFloat(pair.priceUsd || '0'),
        priceNative: parseFloat(pair.priceNative),
        priceChanges: {
          m5: pair.priceChange.m5,
          h1: pair.priceChange.h1,
          h6: pair.priceChange.h6,
          h24: pair.priceChange.h24,
        },
      },
      volumeData: {
        volume24h: pair.volume.h24,
        volume6h: pair.volume.h6,
        volume1h: pair.volume.h1,
        volume5m: pair.volume.m5,
        volumeChangePercent: this.calculateVolumeChange(pair.volume),
      },
      liquidityData: {
        totalLiquidityUsd: pair.liquidity?.usd || 0,
        baseLiquidity: pair.liquidity?.base || 0,
        quoteLiquidity: pair.liquidity?.quote || 0,
        liquidityScore: this.calculateLiquidityScore(pair.liquidity?.usd || 0),
      },
      tradingActivity: {
        transactions24h: pair.txns.h24.buys + pair.txns.h24.sells,
        buyPressure: this.calculateBuyPressure(pair.txns.h24),
        tradingScore: this.calculateTradingScore(pair.txns, pair.volume.h24),
      },
      riskMetrics: {
        volatilityScore: this.calculateVolatilityScore(pair.priceChange),
        liquidityRisk: this.assessLiquidityRisk(pair.liquidity?.usd || 0),
        tradingRisk: this.assessTradingRisk(pair.txns.h24, pair.volume.h24),
        overallRisk: 'medium', // Will be calculated
      },
      metadata: {
        pairAge: this.calculatePairAge(pair.pairCreatedAt),
        fdv: pair.fdv || 0,
        marketCap: pair.marketCap || 0,
        lastUpdated: new Date().toISOString(),
        dataFreshness: 0.95,
      },
    };

    // Calculate overall risk
    analysis.riskMetrics.overallRisk = this.calculateOverallRisk(analysis.riskMetrics);

    return analysis;
  }

  /**
   * T2.1.4b: Comprehensive liquidity analysis for a token
   */
  async analyzeLiquidity(tokenAddress: string, chainId?: string): Promise<LiquidityAnalysis> {
    const pairs = await this.getPairsByToken(tokenAddress);
    
    // Filter by chain if specified
    const filteredPairs = chainId 
      ? pairs.filter(pair => pair.chainId === chainId)
      : pairs;

    const totalLiquidityUsd = filteredPairs.reduce(
      (sum, pair) => sum + (pair.liquidity?.usd || 0), 0
    );

    const liquidityDistribution = filteredPairs
      .map(pair => ({
        dexId: pair.dexId,
        pairAddress: pair.pairAddress,
        liquidityUsd: pair.liquidity?.usd || 0,
        liquidityShare: ((pair.liquidity?.usd || 0) / totalLiquidityUsd) * 100,
        volume24h: pair.volume.h24,
      }))
      .sort((a, b) => b.liquidityUsd - a.liquidityUsd);

    const concentrationRisk = this.calculateConcentrationRisk(liquidityDistribution);
    const liquidityStability = this.assessLiquidityStability(filteredPairs);
    const averageSlippage = this.estimateSlippage(totalLiquidityUsd);
    const impermanentLossRisk = this.assessImpermanentLossRisk(filteredPairs);

    return {
      tokenAddress,
      chainId: chainId || 'all',
      totalPairs: filteredPairs.length,
      totalLiquidityUsd,
      liquidityDistribution,
      liquidityMetrics: {
        concentrationRisk,
        liquidityStability,
        averageSlippage,
        impermanentLossRisk,
      },
      recommendations: this.generateLiquidityRecommendations(
        totalLiquidityUsd,
        concentrationRisk,
        liquidityStability
      ),
      warnings: this.generateLiquidityWarnings(
        totalLiquidityUsd,
        concentrationRisk,
        impermanentLossRisk
      ),
    };
  }

  // Helper methods for calculations
  private calculateVolumeChange(volume: any): number {
    if (volume.h6 === 0) return 0;
    return ((volume.h24 - volume.h6) / volume.h6) * 100;
  }

  private calculateLiquidityScore(liquidityUsd: number): number {
    if (liquidityUsd >= 1000000) return 100;
    if (liquidityUsd >= 500000) return 80;
    if (liquidityUsd >= 100000) return 60;
    if (liquidityUsd >= 50000) return 40;
    if (liquidityUsd >= 10000) return 20;
    return 10;
  }

  private calculateBuyPressure(txns: { buys: number; sells: number }): number {
    const total = txns.buys + txns.sells;
    if (total === 0) return 50;
    return (txns.buys / total) * 100;
  }

  private calculateTradingScore(txns: any, volume24h: number): number {
    const totalTxns = txns.h24.buys + txns.h24.sells;
    const avgTxnSize = totalTxns > 0 ? volume24h / totalTxns : 0;
    
    let score = 0;
    if (totalTxns >= 100) score += 40;
    else if (totalTxns >= 50) score += 30;
    else if (totalTxns >= 20) score += 20;
    else score += 10;
    
    if (avgTxnSize >= 1000) score += 30;
    else if (avgTxnSize >= 500) score += 20;
    else if (avgTxnSize >= 100) score += 10;
    
    if (volume24h >= 100000) score += 30;
    else if (volume24h >= 50000) score += 20;
    else if (volume24h >= 10000) score += 10;
    
    return Math.min(score, 100);
  }

  private calculateVolatilityScore(priceChange: any): number {
    const changes = [
      Math.abs(priceChange.m5),
      Math.abs(priceChange.h1),
      Math.abs(priceChange.h6),
      Math.abs(priceChange.h24),
    ];
    
    const maxChange = Math.max(...changes);
    if (maxChange >= 50) return 100;
    if (maxChange >= 20) return 80;
    if (maxChange >= 10) return 60;
    if (maxChange >= 5) return 40;
    return 20;
  }

  private assessLiquidityRisk(liquidityUsd: number): 'low' | 'medium' | 'high' | 'extreme' {
    if (liquidityUsd >= 500000) return 'low';
    if (liquidityUsd >= 100000) return 'medium';
    if (liquidityUsd >= 10000) return 'high';
    return 'extreme';
  }

  private assessTradingRisk(txns: any, volume24h: number): 'low' | 'medium' | 'high' | 'extreme' {
    const totalTxns = txns.buys + txns.sells;
    
    if (totalTxns >= 100 && volume24h >= 50000) return 'low';
    if (totalTxns >= 50 && volume24h >= 10000) return 'medium';
    if (totalTxns >= 10 && volume24h >= 1000) return 'high';
    return 'extreme';
  }

  private calculateOverallRisk(metrics: any): 'low' | 'medium' | 'high' | 'extreme' {
    const riskScores = {
      low: 1,
      medium: 2,
      high: 3,
      extreme: 4,
    };
    
    const avgScore = (
      riskScores[metrics.liquidityRisk] + 
      riskScores[metrics.tradingRisk]
    ) / 2;
    
    if (avgScore <= 1.5) return 'low';
    if (avgScore <= 2.5) return 'medium';
    if (avgScore <= 3.5) return 'high';
    return 'extreme';
  }

  private calculatePairAge(createdAt?: number): number {
    if (!createdAt) return 0;
    return Math.floor((Date.now() - createdAt * 1000) / (1000 * 60 * 60 * 24));
  }

  private calculateConcentrationRisk(distribution: any[]): number {
    if (distribution.length === 0) return 100;
    
    const topThreeShare = distribution
      .slice(0, 3)
      .reduce((sum, item) => sum + item.liquidityShare, 0);
    
    return Math.min(topThreeShare, 100);
  }

  private assessLiquidityStability(pairs: DexScreenerPair[]): 'stable' | 'volatile' | 'highly_volatile' {
    const volatilityScores = pairs.map(pair => 
      Math.abs(pair.priceChange.h24) + Math.abs(pair.priceChange.h6)
    );
    
    const avgVolatility = volatilityScores.reduce((sum, score) => sum + score, 0) / volatilityScores.length;
    
    if (avgVolatility <= 10) return 'stable';
    if (avgVolatility <= 30) return 'volatile';
    return 'highly_volatile';
  }

  private estimateSlippage(liquidityUsd: number): number {
    // Rough estimation for $1000 trade
    if (liquidityUsd >= 1000000) return 0.1;
    if (liquidityUsd >= 500000) return 0.3;
    if (liquidityUsd >= 100000) return 1.0;
    if (liquidityUsd >= 50000) return 3.0;
    if (liquidityUsd >= 10000) return 10.0;
    return 25.0;
  }

  private assessImpermanentLossRisk(pairs: DexScreenerPair[]): 'low' | 'medium' | 'high' | 'extreme' {
    const volatilityScores = pairs.map(pair => 
      Math.abs(pair.priceChange.h24)
    );
    
    const maxVolatility = Math.max(...volatilityScores);
    
    if (maxVolatility <= 5) return 'low';
    if (maxVolatility <= 15) return 'medium';
    if (maxVolatility <= 30) return 'high';
    return 'extreme';
  }

  private generateLiquidityRecommendations(
    totalLiquidity: number,
    concentrationRisk: number,
    stability: string
  ): string[] {
    const recommendations = [];
    
    if (totalLiquidity < 50000) {
      recommendations.push('Consider waiting for higher liquidity before large trades');
    }
    
    if (concentrationRisk > 70) {
      recommendations.push('Liquidity is highly concentrated - consider multiple smaller trades');
    }
    
    if (stability === 'highly_volatile') {
      recommendations.push('Use limit orders due to high price volatility');
    }
    
    return recommendations;
  }

  private generateLiquidityWarnings(
    totalLiquidity: number,
    concentrationRisk: number,
    impermanentLossRisk: string
  ): string[] {
    const warnings = [];
    
    if (totalLiquidity < 10000) {
      warnings.push('Very low liquidity - high slippage risk');
    }
    
    if (concentrationRisk > 80) {
      warnings.push('Liquidity highly concentrated in few pools');
    }
    
    if (impermanentLossRisk === 'extreme') {
      warnings.push('Extreme impermanent loss risk for liquidity providers');
    }
    
    return warnings;
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const windowStart = Math.floor(now / 1000) * 1000;
    const key = windowStart.toString();
    
    const currentCount = this.requestCount.get(key) || 0;
    
    if (currentCount >= this.maxRequestsPerSecond) {
      const waitTime = 1000 - (now - windowStart);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.enforceRateLimit();
    }
    
    this.requestCount.set(key, currentCount + 1);
    
    // Clean old entries
    for (const [oldKey] of this.requestCount) {
      if (parseInt(oldKey) < windowStart - 5000) {
        this.requestCount.delete(oldKey);
      }
    }
  }
}
