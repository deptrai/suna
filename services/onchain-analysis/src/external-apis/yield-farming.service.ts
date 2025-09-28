/**
 * T2.1.3b: Yield and Farming Data Service
 * Pool information, APY calculations, risk metrics
 */

import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../cache/cache.service';
import { MetricsService } from '../metrics/metrics.service';
import { DeFiLlamaService } from './defillama.service';
import { firstValueFrom } from 'rxjs';

export interface YieldPool {
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apyBase?: number;
  apyReward?: number;
  apy: number;
  rewardTokens?: string[];
  pool: string;
  apyPct1D?: number;
  apyPct7D?: number;
  apyPct30D?: number;
  stablecoin?: boolean;
  ilRisk?: string;
  exposure?: string;
  predictions?: {
    predictedClass?: string;
    predictedProbability?: number;
    binnedConfidence?: number;
  };
  poolMeta?: string;
  mu?: number;
  sigma?: number;
  count?: number;
  outlier?: boolean;
  underlyingTokens?: string[];
  url?: string;
}

export interface YieldFarmingAnalysis {
  poolId: string;
  protocol: string;
  chain: string;
  totalAPY: number;
  baseAPY: number;
  rewardAPY: number;
  tvlUsd: number;
  riskScore: number;
  riskFactors: string[];
  impermanentLossRisk: 'low' | 'medium' | 'high';
  liquidityRisk: 'low' | 'medium' | 'high';
  smartContractRisk: 'low' | 'medium' | 'high';
  tokens: string[];
  rewardTokens: string[];
  isStablecoin: boolean;
  historicalAPY: {
    apy1d?: number;
    apy7d?: number;
    apy30d?: number;
  };
  confidence: number;
  lastUpdated: Date;
}

export interface PoolSearchRequest {
  chain?: string;
  project?: string;
  minTvl?: number;
  maxTvl?: number;
  minApy?: number;
  maxApy?: number;
  stablecoin?: boolean;
  tokens?: string[];
  riskLevel?: 'low' | 'medium' | 'high';
}

export interface YieldFarmingRecommendation {
  pools: YieldFarmingAnalysis[];
  totalPools: number;
  averageAPY: number;
  totalTVL: number;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
  };
  topPerformers: YieldFarmingAnalysis[];
  safestOptions: YieldFarmingAnalysis[];
  recommendations: string[];
}

@Injectable()
export class YieldFarmingService {
  private readonly logger = new Logger(YieldFarmingService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly metricsService: MetricsService,
    private readonly defiLlamaService: DeFiLlamaService,
  ) {}

  /**
   * Get all yield farming pools
   */
  async getAllPools(): Promise<YieldPool[]> {
    const cacheKey = 'defillama:yields:all';
    const cached = await this.cacheService.get<YieldPool[]>(cacheKey);
    
    if (cached) {
      this.logger.log('Cache hit for all yield pools');
      this.metricsService.incrementCacheHits('yield_pools');
      return cached;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get('https://yields.llama.fi/pools', {
          timeout: 30000,
          headers: {
            'User-Agent': 'ChainLens-OnChain-Analysis/1.0.0',
            'Accept': 'application/json',
          },
        })
      );

      const pools: YieldPool[] = response.data.data || [];
      
      // Cache for 30 minutes
      await this.cacheService.set(cacheKey, pools, 1800);
      
      this.logger.log(`Fetched ${pools.length} yield pools from DeFiLlama`);
      return pools;
    } catch (error) {
      this.logger.error('Failed to fetch yield pools', { error: error.message });
      throw error;
    }
  }

  /**
   * Search yield pools based on criteria
   */
  async searchPools(request: PoolSearchRequest): Promise<YieldPool[]> {
    const allPools = await this.getAllPools();
    
    let filtered = allPools.filter(pool => {
      // Chain filter
      if (request.chain && pool.chain.toLowerCase() !== request.chain.toLowerCase()) {
        return false;
      }
      
      // Project filter
      if (request.project && pool.project.toLowerCase() !== request.project.toLowerCase()) {
        return false;
      }
      
      // TVL filters
      if (request.minTvl && pool.tvlUsd < request.minTvl) {
        return false;
      }
      if (request.maxTvl && pool.tvlUsd > request.maxTvl) {
        return false;
      }
      
      // APY filters
      if (request.minApy && pool.apy < request.minApy) {
        return false;
      }
      if (request.maxApy && pool.apy > request.maxApy) {
        return false;
      }
      
      // Stablecoin filter
      if (request.stablecoin !== undefined && pool.stablecoin !== request.stablecoin) {
        return false;
      }
      
      // Token filter
      if (request.tokens && request.tokens.length > 0) {
        const poolTokens = pool.underlyingTokens || [pool.symbol];
        const hasMatchingToken = request.tokens.some(token => 
          poolTokens.some(poolToken => 
            poolToken.toLowerCase().includes(token.toLowerCase())
          )
        );
        if (!hasMatchingToken) {
          return false;
        }
      }
      
      return true;
    });

    // Risk level filter
    if (request.riskLevel) {
      filtered = filtered.filter(pool => {
        const riskScore = this.calculatePoolRiskScore(pool);
        switch (request.riskLevel) {
          case 'low': return riskScore <= 30;
          case 'medium': return riskScore > 30 && riskScore <= 70;
          case 'high': return riskScore > 70;
          default: return true;
        }
      });
    }

    this.logger.log(`Pool search results`, {
      totalPools: allPools.length,
      filteredPools: filtered.length,
      criteria: request,
    });

    return filtered;
  }

  /**
   * Analyze a specific yield farming pool
   */
  async analyzePool(poolId: string): Promise<YieldFarmingAnalysis> {
    const cacheKey = `yield:analysis:${poolId}`;
    const cached = await this.cacheService.get<YieldFarmingAnalysis>(cacheKey);
    
    if (cached) {
      this.logger.log(`Cache hit for pool analysis ${poolId}`);
      this.metricsService.incrementCacheHits('yield_analysis');
      return cached;
    }

    const allPools = await this.getAllPools();
    const pool = allPools.find(p => p.pool === poolId);
    
    if (!pool) {
      throw new Error(`Pool ${poolId} not found`);
    }

    const analysis: YieldFarmingAnalysis = {
      poolId: pool.pool,
      protocol: pool.project,
      chain: pool.chain,
      totalAPY: pool.apy || 0,
      baseAPY: pool.apyBase || 0,
      rewardAPY: pool.apyReward || 0,
      tvlUsd: pool.tvlUsd,
      riskScore: this.calculatePoolRiskScore(pool),
      riskFactors: this.identifyRiskFactors(pool),
      impermanentLossRisk: this.assessImpermanentLossRisk(pool),
      liquidityRisk: this.assessLiquidityRisk(pool),
      smartContractRisk: this.assessSmartContractRisk(pool),
      tokens: pool.underlyingTokens || [pool.symbol],
      rewardTokens: pool.rewardTokens || [],
      isStablecoin: pool.stablecoin || false,
      historicalAPY: {
        apy1d: pool.apyPct1D,
        apy7d: pool.apyPct7D,
        apy30d: pool.apyPct30D,
      },
      confidence: this.calculateConfidence(pool),
      lastUpdated: new Date(),
    };

    // Cache for 15 minutes
    await this.cacheService.set(cacheKey, analysis, 900);

    this.logger.log(`Analyzed pool ${poolId}`, {
      protocol: analysis.protocol,
      apy: analysis.totalAPY,
      riskScore: analysis.riskScore,
      tvl: analysis.tvlUsd,
    });

    return analysis;
  }

  /**
   * Get yield farming recommendations based on criteria
   */
  async getRecommendations(request: PoolSearchRequest): Promise<YieldFarmingRecommendation> {
    const pools = await this.searchPools(request);
    
    if (pools.length === 0) {
      return {
        pools: [],
        totalPools: 0,
        averageAPY: 0,
        totalTVL: 0,
        riskDistribution: { low: 0, medium: 0, high: 0 },
        topPerformers: [],
        safestOptions: [],
        recommendations: ['No pools found matching your criteria'],
      };
    }

    // Analyze all pools
    const analyses = await Promise.all(
      pools.slice(0, 50).map(pool => this.analyzePool(pool.pool))
    );

    // Calculate statistics
    const totalTVL = analyses.reduce((sum, analysis) => sum + analysis.tvlUsd, 0);
    const averageAPY = analyses.reduce((sum, analysis) => sum + analysis.totalAPY, 0) / analyses.length;

    // Risk distribution
    const riskDistribution = analyses.reduce(
      (dist, analysis) => {
        if (analysis.riskScore <= 30) dist.low++;
        else if (analysis.riskScore <= 70) dist.medium++;
        else dist.high++;
        return dist;
      },
      { low: 0, medium: 0, high: 0 }
    );

    // Top performers (highest APY with reasonable risk)
    const topPerformers = analyses
      .filter(analysis => analysis.riskScore <= 70)
      .sort((a, b) => b.totalAPY - a.totalAPY)
      .slice(0, 5);

    // Safest options (lowest risk with decent APY)
    const safestOptions = analyses
      .filter(analysis => analysis.totalAPY >= 5)
      .sort((a, b) => a.riskScore - b.riskScore)
      .slice(0, 5);

    // Generate recommendations
    const recommendations = this.generateRecommendations(analyses, request);

    return {
      pools: analyses,
      totalPools: analyses.length,
      averageAPY,
      totalTVL,
      riskDistribution,
      topPerformers,
      safestOptions,
      recommendations,
    };
  }

  /**
   * Calculate risk score for a pool (0-100, higher = riskier)
   */
  private calculatePoolRiskScore(pool: YieldPool): number {
    let riskScore = 0;

    // TVL risk (lower TVL = higher risk)
    if (pool.tvlUsd < 1000000) riskScore += 30;
    else if (pool.tvlUsd < 10000000) riskScore += 15;
    else if (pool.tvlUsd < 100000000) riskScore += 5;

    // APY risk (extremely high APY = higher risk)
    if (pool.apy > 100) riskScore += 25;
    else if (pool.apy > 50) riskScore += 15;
    else if (pool.apy > 20) riskScore += 5;

    // Stablecoin pools are generally safer
    if (pool.stablecoin) riskScore -= 10;

    // IL risk assessment
    if (pool.ilRisk === 'yes') riskScore += 20;

    // Outlier detection
    if (pool.outlier) riskScore += 15;

    // Prediction confidence
    if (pool.predictions?.binnedConfidence && pool.predictions.binnedConfidence < 0.5) {
      riskScore += 10;
    }

    return Math.max(0, Math.min(100, riskScore));
  }

  /**
   * Identify specific risk factors for a pool
   */
  private identifyRiskFactors(pool: YieldPool): string[] {
    const factors: string[] = [];

    if (pool.tvlUsd < 1000000) factors.push('low_tvl');
    if (pool.apy > 50) factors.push('high_apy');
    if (pool.ilRisk === 'yes') factors.push('impermanent_loss_risk');
    if (pool.outlier) factors.push('statistical_outlier');
    if (!pool.stablecoin && pool.underlyingTokens && pool.underlyingTokens.length > 1) {
      factors.push('multi_token_exposure');
    }
    if (pool.predictions?.binnedConfidence && pool.predictions.binnedConfidence < 0.5) {
      factors.push('low_prediction_confidence');
    }

    return factors;
  }

  /**
   * Assess impermanent loss risk
   */
  private assessImpermanentLossRisk(pool: YieldPool): 'low' | 'medium' | 'high' {
    if (pool.stablecoin) return 'low';
    if (pool.ilRisk === 'yes') return 'high';
    if (pool.underlyingTokens && pool.underlyingTokens.length > 1) return 'medium';
    return 'low';
  }

  /**
   * Assess liquidity risk
   */
  private assessLiquidityRisk(pool: YieldPool): 'low' | 'medium' | 'high' {
    if (pool.tvlUsd > 100000000) return 'low';
    if (pool.tvlUsd > 10000000) return 'medium';
    return 'high';
  }

  /**
   * Assess smart contract risk
   */
  private assessSmartContractRisk(pool: YieldPool): 'low' | 'medium' | 'high' {
    // This would ideally use audit data and protocol maturity
    // For now, use simple heuristics based on project and TVL
    const establishedProjects = ['aave', 'compound', 'uniswap', 'curve', 'convex'];
    
    if (establishedProjects.includes(pool.project.toLowerCase()) && pool.tvlUsd > 50000000) {
      return 'low';
    }
    if (pool.tvlUsd > 10000000) {
      return 'medium';
    }
    return 'high';
  }

  /**
   * Calculate confidence score for pool data
   */
  private calculateConfidence(pool: YieldPool): number {
    let confidence = 1.0;

    // Reduce confidence for missing data
    if (!pool.apyBase) confidence *= 0.9;
    if (!pool.apyReward) confidence *= 0.9;
    if (!pool.underlyingTokens) confidence *= 0.8;
    if (!pool.predictions) confidence *= 0.9;

    // Use prediction confidence if available
    if (pool.predictions?.binnedConfidence) {
      confidence *= pool.predictions.binnedConfidence;
    }

    return Math.round(confidence * 100) / 100;
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(analyses: YieldFarmingAnalysis[], request: PoolSearchRequest): string[] {
    const recommendations: string[] = [];

    const avgRisk = analyses.reduce((sum, a) => sum + a.riskScore, 0) / analyses.length;
    const avgAPY = analyses.reduce((sum, a) => sum + a.totalAPY, 0) / analyses.length;

    if (avgRisk > 70) {
      recommendations.push('Consider diversifying across lower-risk pools');
    }

    if (avgAPY > 50) {
      recommendations.push('High APY pools may carry additional risks - review carefully');
    }

    const stablecoinPools = analyses.filter(a => a.isStablecoin);
    if (stablecoinPools.length > 0) {
      recommendations.push(`${stablecoinPools.length} stablecoin pools available for lower risk exposure`);
    }

    const highTVLPools = analyses.filter(a => a.tvlUsd > 50000000);
    if (highTVLPools.length > 0) {
      recommendations.push(`${highTVLPools.length} high-TVL pools available for better liquidity`);
    }

    if (analyses.length > 10) {
      recommendations.push('Consider portfolio allocation across multiple pools to reduce risk');
    }

    return recommendations;
  }
}
