import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { BigNumber } from 'bignumber.js';
import * as math from 'mathjs';

import { TokenomicsData } from '../entities/tokenomics-data.entity';
import { VestingSchedule } from '../entities/vesting-schedule.entity';
import { DeFiLlamaService } from '../external-apis/defillama.service';
import { CoinGeckoService } from '../external-apis/coingecko.service';
import { CacheService } from '../cache/cache.service';
import { MetricsService } from '../metrics/metrics.service';
import { TokenomicsAnalysisRequestDto } from './dto/tokenomics-analysis-request.dto';
import { TokenomicsAnalysisResponseDto } from './dto/tokenomics-analysis-response.dto';

@Injectable()
export class TokenomicsAnalysisService {
  private readonly logger = new Logger(TokenomicsAnalysisService.name);

  constructor(
    @InjectRepository(TokenomicsData)
    private readonly tokenomicsDataRepository: Repository<TokenomicsData>,
    @InjectRepository(VestingSchedule)
    private readonly vestingScheduleRepository: Repository<VestingSchedule>,
    private readonly defiLlamaService: DeFiLlamaService,
    private readonly coinGeckoService: CoinGeckoService,
    private readonly cacheService: CacheService,
    private readonly metricsService: MetricsService,
    private readonly configService: ConfigService,
  ) {}

  async analyzeTokenomics(request: TokenomicsAnalysisRequestDto): Promise<TokenomicsAnalysisResponseDto> {
    const startTime = Date.now();
    const { projectId, tokenAddress, protocolName } = request;

    this.logger.log(`Starting tokenomics analysis for ${projectId}`, {
      projectId,
      tokenAddress,
      protocolName,
    });

    try {
      // Check cache first
      const cacheKey = `tokenomics:${projectId}`;
      const cachedResult = await this.cacheService.get<TokenomicsAnalysisResponseDto>(cacheKey);
      
      if (cachedResult) {
        this.logger.log(`Cache hit for ${projectId}`, { projectId, cacheKey });
        this.metricsService.incrementCacheHits('tokenomics_analysis');
        return cachedResult;
      }

      // Gather tokenomics data from multiple sources in parallel
      const [
        defiLlamaData,
        coinGeckoData,
        vestingData,
      ] = await Promise.allSettled([
        this.getDeFiLlamaData(protocolName || projectId),
        this.getCoinGeckoData(projectId),
        this.getVestingData(projectId, tokenAddress),
      ]);

      // Process and combine tokenomics data
      const analysisResult = await this.processTokenomicsData({
        projectId,
        tokenAddress,
        protocolName,
        defiLlamaData: this.extractSettledValue(defiLlamaData),
        coinGeckoData: this.extractSettledValue(coinGeckoData),
        vestingData: this.extractSettledValue(vestingData),
      });

      // Calculate tokenomics scores and metrics
      analysisResult.tokenomicsScore = this.calculateTokenomicsScore(analysisResult);
      analysisResult.distributionFairness = this.calculateDistributionFairness(analysisResult);
      analysisResult.inflationRate = this.calculateInflationRate(analysisResult);
      analysisResult.confidence = this.calculateConfidence(analysisResult);
      analysisResult.riskFlags = this.identifyRiskFlags(analysisResult);

      // Store in database
      await this.storeTokenomicsResult(analysisResult);

      // Cache the result
      const cacheTTL = this.getCacheTTL(analysisResult.confidence);
      await this.cacheService.set(cacheKey, analysisResult, cacheTTL);

      // Record metrics
      const processingTime = Date.now() - startTime;
      this.metricsService.recordAnalysisTime('tokenomics', processingTime);
      this.metricsService.incrementAnalysisCount('tokenomics', 'success');

      this.logger.log(`Tokenomics analysis completed for ${projectId}`, {
        projectId,
        processingTime,
        tokenomicsScore: analysisResult.tokenomicsScore,
        confidence: analysisResult.confidence,
        totalSupply: analysisResult.totalSupply,
      });

      return analysisResult;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`Tokenomics analysis failed for ${projectId}`, {
        projectId,
        error: error.message,
        processingTime,
      });

      this.metricsService.incrementAnalysisCount('tokenomics', 'error');
      throw error;
    }
  }

  private async getDeFiLlamaData(protocolName: string) {
    try {
      const [protocolData, yieldData, treasuryData] = await Promise.allSettled([
        this.defiLlamaService.getProtocolTVL(protocolName),
        this.defiLlamaService.getYieldData(protocolName),
        this.defiLlamaService.getTreasuryData(protocolName),
      ]);

      return {
        protocol: this.extractSettledValue(protocolData),
        yields: this.extractSettledValue(yieldData),
        treasury: this.extractSettledValue(treasuryData),
      };
    } catch (error) {
      this.logger.warn(`DeFiLlama API error: ${error.message}`);
      return null;
    }
  }

  private async getCoinGeckoData(projectId: string) {
    try {
      const [marketData, developerData] = await Promise.allSettled([
        this.coinGeckoService.getMarketData(projectId),
        this.coinGeckoService.getDeveloperData(projectId),
      ]);

      return {
        market: this.extractSettledValue(marketData),
        developer: this.extractSettledValue(developerData),
      };
    } catch (error) {
      this.logger.warn(`CoinGecko API error: ${error.message}`);
      return null;
    }
  }

  private async getVestingData(projectId: string, tokenAddress?: string) {
    try {
      // This would typically come from on-chain analysis or project documentation
      // For now, we'll return a placeholder structure
      return {
        totalSupply: 0,
        circulatingSupply: 0,
        vestingSchedules: [],
        distributionBreakdown: {},
      };
    } catch (error) {
      this.logger.warn(`Vesting data error: ${error.message}`);
      return null;
    }
  }

  private async processTokenomicsData(data: any): Promise<TokenomicsAnalysisResponseDto> {
    const {
      projectId,
      tokenAddress,
      protocolName,
      defiLlamaData,
      coinGeckoData,
      vestingData,
    } = data;

    // Initialize result
    const result: TokenomicsAnalysisResponseDto = {
      success: true,
      projectId,
      tokenAddress,
      protocolName,
      totalSupply: 0,
      circulatingSupply: 0,
      marketCap: 0,
      fullyDilutedValuation: 0,
      tvl: 0,
      tokenomicsScore: 0,
      distributionFairness: 0,
      inflationRate: 0,
      confidence: 0,
      vestingSchedule: [],
      distributionBreakdown: {},
      yieldOpportunities: [],
      riskFlags: [],
      lastUpdated: new Date(),
      warnings: [],
    };

    // Process CoinGecko market data
    if (coinGeckoData?.market) {
      const marketData = coinGeckoData.market;
      result.totalSupply = marketData.total_supply || 0;
      result.circulatingSupply = marketData.circulating_supply || 0;
      result.marketCap = marketData.market_cap?.usd || 0;
      result.fullyDilutedValuation = marketData.fully_diluted_valuation?.usd || 0;
    }

    // Process DeFiLlama protocol data
    if (defiLlamaData?.protocol) {
      result.tvl = defiLlamaData.protocol.tvl || 0;
    }

    // Process yield opportunities
    if (defiLlamaData?.yields) {
      result.yieldOpportunities = this.processYieldData(defiLlamaData.yields);
    }

    // Process vesting data
    if (vestingData) {
      result.totalSupply = result.totalSupply || vestingData.totalSupply;
      result.circulatingSupply = result.circulatingSupply || vestingData.circulatingSupply;
      result.vestingSchedule = vestingData.vestingSchedules || [];
      result.distributionBreakdown = vestingData.distributionBreakdown || {};
    }

    // Add warnings for missing data
    if (!defiLlamaData) result.warnings.push('defillama_unavailable');
    if (!coinGeckoData) result.warnings.push('coingecko_unavailable');
    if (!vestingData) result.warnings.push('vesting_data_unavailable');

    return result;
  }

  private processYieldData(yieldData: any[]): any[] {
    if (!Array.isArray(yieldData)) return [];

    return yieldData.map(pool => ({
      protocol: pool.project || 'Unknown',
      pool: pool.symbol || 'Unknown',
      apy: pool.apy || 0,
      tvl: pool.tvlUsd || 0,
      chain: pool.chain || 'Unknown',
      riskLevel: this.assessYieldRisk(pool),
    }));
  }

  private assessYieldRisk(pool: any): string {
    const apy = pool.apy || 0;
    const tvl = pool.tvlUsd || 0;

    if (apy > 100) return 'high'; // Very high APY is risky
    if (apy > 50) return 'medium-high';
    if (tvl < 1000000) return 'medium'; // Low TVL is risky
    if (apy < 5) return 'low';
    return 'medium';
  }

  private calculateTokenomicsScore(data: TokenomicsAnalysisResponseDto): number {
    let score = 100;
    const factors = [];

    // Supply distribution score
    if (data.circulatingSupply > 0 && data.totalSupply > 0) {
      const circulationRatio = data.circulatingSupply / data.totalSupply;
      
      if (circulationRatio < 0.3) {
        score -= 20;
        factors.push('low_circulation');
      } else if (circulationRatio < 0.5) {
        score -= 10;
        factors.push('medium_circulation');
      }
    }

    // Market cap to TVL ratio
    if (data.marketCap > 0 && data.tvl > 0) {
      const mcTvlRatio = data.marketCap / data.tvl;
      
      if (mcTvlRatio > 10) {
        score -= 15;
        factors.push('high_mc_tvl_ratio');
      } else if (mcTvlRatio > 5) {
        score -= 8;
        factors.push('medium_mc_tvl_ratio');
      }
    }

    // Inflation rate penalty
    if (data.inflationRate > 20) {
      score -= 25;
      factors.push('high_inflation');
    } else if (data.inflationRate > 10) {
      score -= 15;
      factors.push('medium_inflation');
    } else if (data.inflationRate > 5) {
      score -= 5;
      factors.push('low_inflation');
    }

    // Distribution fairness bonus/penalty
    if (data.distributionFairness > 0.8) {
      score += 10;
      factors.push('fair_distribution');
    } else if (data.distributionFairness < 0.4) {
      score -= 20;
      factors.push('unfair_distribution');
    }

    // Data availability penalty
    if (data.warnings.length > 1) {
      score -= 10;
      factors.push('limited_data');
    }

    score = Math.max(0, Math.min(100, score));

    this.logger.debug(`Tokenomics score calculated: ${score}`, {
      projectId: data.projectId,
      score,
      factors,
    });

    return score;
  }

  private calculateDistributionFairness(data: TokenomicsAnalysisResponseDto): number {
    const distribution = data.distributionBreakdown;
    
    if (!distribution || Object.keys(distribution).length === 0) {
      return 0.5; // Neutral score when no data
    }

    let fairnessScore = 1.0;

    // Check for excessive team/founder allocation
    const teamAllocation = (distribution['team'] || 0) + (distribution['founders'] || 0);
    if (teamAllocation > 0.3) { // > 30%
      fairnessScore -= 0.3;
    } else if (teamAllocation > 0.2) { // > 20%
      fairnessScore -= 0.1;
    }

    // Check for excessive private investor allocation
    const privateAllocation = (distribution['private'] || 0) + (distribution['seed'] || 0);
    if (privateAllocation > 0.4) { // > 40%
      fairnessScore -= 0.2;
    }

    // Bonus for community allocation
    const communityAllocation = distribution['community'] || 0;
    if (communityAllocation > 0.3) { // > 30%
      fairnessScore += 0.1;
    }

    return Math.max(0, Math.min(1, fairnessScore));
  }

  private calculateInflationRate(data: TokenomicsAnalysisResponseDto): number {
    if (!data.totalSupply || !data.circulatingSupply) {
      return 0;
    }

    // Simple inflation calculation based on supply difference
    const unlockedTokens = data.totalSupply - data.circulatingSupply;
    const potentialInflation = (unlockedTokens / data.circulatingSupply) * 100;

    // Assume this inflation happens over 1 year (simplified)
    return Math.round(potentialInflation * 100) / 100;
  }

  private calculateConfidence(data: TokenomicsAnalysisResponseDto): number {
    let confidence = 1.0;
    const dataPoints = [];

    // Check data availability
    if (data.totalSupply > 0) dataPoints.push('total_supply');
    if (data.circulatingSupply > 0) dataPoints.push('circulating_supply');
    if (data.marketCap > 0) dataPoints.push('market_cap');
    if (data.tvl > 0) dataPoints.push('tvl');
    if (Object.keys(data.distributionBreakdown).length > 0) dataPoints.push('distribution');

    // Reduce confidence based on missing data
    const maxDataPoints = 5;
    const dataAvailability = dataPoints.length / maxDataPoints;
    confidence *= dataAvailability;

    // Reduce confidence based on warnings
    const warningPenalty = data.warnings.length * 0.15;
    confidence = Math.max(confidence - warningPenalty, 0.1);

    return Math.round(confidence * 100) / 100;
  }

  private identifyRiskFlags(data: TokenomicsAnalysisResponseDto): string[] {
    const flags = [];

    // High inflation risk
    if (data.inflationRate > 20) {
      flags.push('high_inflation_risk');
    }

    // Low circulation risk
    if (data.circulatingSupply > 0 && data.totalSupply > 0) {
      const circulationRatio = data.circulatingSupply / data.totalSupply;
      if (circulationRatio < 0.3) {
        flags.push('low_token_circulation');
      }
    }

    // Unfair distribution risk
    if (data.distributionFairness < 0.4) {
      flags.push('unfair_token_distribution');
    }

    // High market cap to TVL ratio
    if (data.marketCap > 0 && data.tvl > 0) {
      const mcTvlRatio = data.marketCap / data.tvl;
      if (mcTvlRatio > 10) {
        flags.push('overvalued_vs_utility');
      }
    }

    // Low tokenomics score
    if (data.tokenomicsScore < 40) {
      flags.push('poor_tokenomics');
    }

    return flags;
  }

  private getCacheTTL(confidence: number): number {
    // Higher confidence = longer cache time
    if (confidence > 0.8) return 1800; // 30 minutes
    if (confidence > 0.6) return 900;  // 15 minutes
    return 600; // 10 minutes for low confidence
  }

  private async storeTokenomicsResult(result: TokenomicsAnalysisResponseDto): Promise<void> {
    try {
      const tokenomicsData = this.tokenomicsDataRepository.create({
        projectId: result.projectId,
        totalSupply: result.totalSupply,
        circulatingSupply: result.circulatingSupply,
        marketCap: result.marketCap,
        tvl: result.tvl,
        tokenomicsScore: result.tokenomicsScore,
        distributionFairness: result.distributionFairness,
        inflationRate: result.inflationRate,
        confidence: result.confidence,
        riskFlags: result.riskFlags,
      });

      await this.tokenomicsDataRepository.save(tokenomicsData);

      // Store vesting schedules if available
      if (result.vestingSchedule && result.vestingSchedule.length > 0) {
        for (const schedule of result.vestingSchedule) {
          const vestingSchedule = this.vestingScheduleRepository.create({
            projectId: result.projectId,
            beneficiary: schedule.beneficiary,
            totalAmount: schedule.totalAmount,
            vestingPeriod: schedule.vestingPeriod,
            amount: schedule.amount,
          });

          await this.vestingScheduleRepository.save(vestingSchedule);
        }
      }

    } catch (error) {
      this.logger.error(`Failed to store tokenomics result: ${error.message}`, {
        projectId: result.projectId,
        error: error.message,
      });
      // Don't throw - storage failure shouldn't fail the analysis
    }
  }

  private extractSettledValue<T>(settledResult: PromiseSettledResult<T>): T | null {
    return settledResult.status === 'fulfilled' ? settledResult.value : null;
  }
}
