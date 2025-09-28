/**
 * T2.1.3c: Risk Assessment Integration Service
 * Cross-chain data integration and comprehensive risk analysis
 */

import { Injectable, Logger } from '@nestjs/common';
import { DeFiLlamaService, ProtocolInfo } from '../../external-apis/defillama.service';
import { YieldFarmingService, YieldFarmingAnalysis } from '../../external-apis/yield-farming.service';
import { TokenAnalysisService } from './token-analysis.service';
import { TransactionAnalysisService } from './transaction-analysis.service';
import { SupportedChain } from '../dto/token-analysis-request.dto';
import { CacheService } from '../../cache/cache.service';
import { MetricsService } from '../../metrics/metrics.service';

export interface RiskAssessmentRequest {
  tokenAddress: string;
  chainId?: string;
  includeProtocolRisk?: boolean;
  includeYieldRisk?: boolean;
  includeMarketRisk?: boolean;
  includeLiquidityRisk?: boolean;
}

export interface ProtocolRiskAnalysis {
  protocolName?: string;
  protocolTVL?: number;
  protocolCategory?: string;
  auditScore?: number;
  timeInMarket?: number; // days
  governanceRisk: 'low' | 'medium' | 'high';
  technicalRisk: 'low' | 'medium' | 'high';
  riskFactors: string[];
}

export interface MarketRiskAnalysis {
  volatility24h?: number;
  volatility7d?: number;
  volatility30d?: number;
  correlationWithBTC?: number;
  correlationWithETH?: number;
  marketCapRisk: 'low' | 'medium' | 'high';
  liquidityRisk: 'low' | 'medium' | 'high';
  concentrationRisk: 'low' | 'medium' | 'high';
  riskFactors: string[];
}

export interface YieldRiskAnalysis {
  bestYieldOpportunities: YieldFarmingAnalysis[];
  averageAPY: number;
  riskAdjustedReturn: number;
  impermanentLossRisk: 'low' | 'medium' | 'high';
  smartContractRisk: 'low' | 'medium' | 'high';
  yieldStability: 'stable' | 'volatile' | 'highly_volatile';
  riskFactors: string[];
}

export interface LiquidityRiskAnalysis {
  dexLiquidity: number;
  cexLiquidity: number;
  totalLiquidity: number;
  liquidityDistribution: Record<string, number>;
  slippageRisk: 'low' | 'medium' | 'high';
  liquidityStability: 'stable' | 'volatile' | 'highly_volatile';
  riskFactors: string[];
}

export interface ComprehensiveRiskAssessment {
  tokenAddress: string;
  chainId: string;
  overallRiskScore: number; // 0-100
  riskCategory: 'low' | 'medium' | 'high' | 'extreme';
  confidence: number;
  
  protocolRisk?: ProtocolRiskAnalysis;
  marketRisk?: MarketRiskAnalysis;
  yieldRisk?: YieldRiskAnalysis;
  liquidityRisk?: LiquidityRiskAnalysis;
  
  keyRiskFactors: string[];
  recommendations: string[];
  warnings: string[];
  
  crossChainData?: {
    availableChains: string[];
    totalCrossChainTVL: number;
    chainDistribution: Record<string, number>;
  };
  
  analyzedAt: Date;
  processingTime: number;
}

@Injectable()
export class RiskAssessmentService {
  private readonly logger = new Logger(RiskAssessmentService.name);

  constructor(
    private readonly defiLlamaService: DeFiLlamaService,
    private readonly yieldFarmingService: YieldFarmingService,
    private readonly tokenAnalysisService: TokenAnalysisService,
    private readonly transactionAnalysisService: TransactionAnalysisService,
    private readonly cacheService: CacheService,
    private readonly metricsService: MetricsService,
  ) {}

  async assessRisk(request: RiskAssessmentRequest): Promise<ComprehensiveRiskAssessment> {
    const startTime = Date.now();
    const { tokenAddress, chainId = 'ethereum' } = request;

    this.logger.log(`Starting comprehensive risk assessment for ${tokenAddress}`, {
      tokenAddress,
      chainId,
      includeProtocolRisk: request.includeProtocolRisk,
      includeYieldRisk: request.includeYieldRisk,
      includeMarketRisk: request.includeMarketRisk,
      includeLiquidityRisk: request.includeLiquidityRisk,
    });

    try {
      // Check cache first
      const cacheKey = `risk:assessment:${chainId}:${tokenAddress}:${JSON.stringify(request)}`;
      const cached = await this.cacheService.get<ComprehensiveRiskAssessment>(cacheKey);
      
      if (cached) {
        this.logger.log(`Cache hit for risk assessment ${tokenAddress}`);
        this.metricsService.incrementCacheHits('risk_assessment');
        return cached;
      }

      // Gather data in parallel
      const dataPromises: Promise<any>[] = [];
      
      // Always get basic token analysis
      dataPromises.push(
        this.tokenAnalysisService.analyzeToken({
          projectId: 'risk-assessment',
          tokenAddress,
          chainId: chainId as SupportedChain,
        })
      );

      // Get transaction analysis
      dataPromises.push(
        this.transactionAnalysisService.analyzeTransactions({
          tokenAddress,
          chainId,
          timeframe: '24h',
        })
      );

      // Get protocol data if requested
      if (request.includeProtocolRisk !== false) {
        dataPromises.push(this.getProtocolData(tokenAddress));
      }

      // Get yield data if requested
      if (request.includeYieldRisk !== false) {
        dataPromises.push(this.getYieldData(tokenAddress, chainId));
      }

      const results = await Promise.allSettled(dataPromises);
      
      // Extract results
      let resultIndex = 0;
      const tokenAnalysis = this.extractSettledValue(results[resultIndex++]);
      const transactionAnalysis = this.extractSettledValue(results[resultIndex++]);
      const protocolData = request.includeProtocolRisk !== false ? this.extractSettledValue(results[resultIndex++]) : null;
      const yieldData = request.includeYieldRisk !== false ? this.extractSettledValue(results[resultIndex++]) : null;

      // Build comprehensive assessment
      const assessment: ComprehensiveRiskAssessment = {
        tokenAddress,
        chainId,
        overallRiskScore: 0,
        riskCategory: 'medium',
        confidence: 0,
        keyRiskFactors: [],
        recommendations: [],
        warnings: [],
        analyzedAt: new Date(),
        processingTime: Date.now() - startTime,
      };

      // Analyze protocol risk
      if (request.includeProtocolRisk !== false && protocolData) {
        assessment.protocolRisk = this.analyzeProtocolRisk(protocolData, tokenAnalysis);
      }

      // Analyze market risk
      if (request.includeMarketRisk !== false && tokenAnalysis) {
        assessment.marketRisk = this.analyzeMarketRisk(tokenAnalysis, transactionAnalysis);
      }

      // Analyze yield risk
      if (request.includeYieldRisk !== false && yieldData) {
        assessment.yieldRisk = this.analyzeYieldRisk(yieldData);
      }

      // Analyze liquidity risk
      if (request.includeLiquidityRisk !== false && tokenAnalysis) {
        assessment.liquidityRisk = this.analyzeLiquidityRisk(tokenAnalysis, transactionAnalysis);
      }

      // Get cross-chain data
      assessment.crossChainData = await this.getCrossChainData(tokenAddress);

      // Calculate overall risk score
      assessment.overallRiskScore = this.calculateOverallRiskScore(assessment);
      assessment.riskCategory = this.categorizeRisk(assessment.overallRiskScore);
      assessment.confidence = this.calculateConfidence(assessment);

      // Generate key risk factors, recommendations, and warnings
      this.generateRiskFactors(assessment);
      this.generateRecommendations(assessment);
      this.generateWarnings(assessment);

      // Cache the result
      const cacheTTL = this.getCacheTTL(assessment.confidence);
      await this.cacheService.set(cacheKey, assessment, cacheTTL);

      // Record metrics
      this.metricsService.recordResponseTime(
        'POST',
        '/risk/assess',
        Date.now() - startTime,
      );

      this.logger.log(`Risk assessment completed for ${tokenAddress}`, {
        tokenAddress,
        overallRiskScore: assessment.overallRiskScore,
        riskCategory: assessment.riskCategory,
        confidence: assessment.confidence,
        processingTime: assessment.processingTime,
      });

      return assessment;

    } catch (error) {
      this.logger.error(`Risk assessment failed for ${tokenAddress}`, {
        tokenAddress,
        error: error.message,
        processingTime: Date.now() - startTime,
      });

      this.metricsService.incrementError('risk_assessment_error', '/risk/assess');
      throw error;
    }
  }

  private async getProtocolData(tokenAddress: string): Promise<ProtocolInfo | null> {
    try {
      const protocols = await this.defiLlamaService.getAllProtocols();
      return protocols.find(p => 
        p.address?.toLowerCase() === tokenAddress.toLowerCase() ||
        p.symbol?.toLowerCase().includes(tokenAddress.toLowerCase())
      ) || null;
    } catch (error) {
      this.logger.warn('Failed to get protocol data', { error: error.message });
      return null;
    }
  }

  private async getYieldData(tokenAddress: string, chainId: string): Promise<any> {
    try {
      const pools = await this.yieldFarmingService.searchPools({
        chain: chainId,
        tokens: [tokenAddress],
      });
      return pools.slice(0, 10); // Top 10 pools
    } catch (error) {
      this.logger.warn('Failed to get yield data', { error: error.message });
      return null;
    }
  }

  private async getCrossChainData(tokenAddress: string): Promise<any> {
    try {
      const protocols = await this.defiLlamaService.getAllProtocols();
      const relatedProtocols = protocols.filter(p => 
        p.address?.toLowerCase() === tokenAddress.toLowerCase() ||
        p.symbol?.toLowerCase().includes(tokenAddress.toLowerCase())
      );

      if (relatedProtocols.length === 0) return null;

      const totalTVL = relatedProtocols.reduce((sum, p) => sum + (p.tvl || 0), 0);
      const chainDistribution: Record<string, number> = {};
      const availableChains: string[] = [];

      relatedProtocols.forEach(protocol => {
        protocol.chains?.forEach(chain => {
          if (!availableChains.includes(chain)) {
            availableChains.push(chain);
          }
          chainDistribution[chain] = (chainDistribution[chain] || 0) + (protocol.chainTvls?.[chain] || 0);
        });
      });

      return {
        availableChains,
        totalCrossChainTVL: totalTVL,
        chainDistribution,
      };
    } catch (error) {
      this.logger.warn('Failed to get cross-chain data', { error: error.message });
      return null;
    }
  }

  private analyzeProtocolRisk(protocolData: ProtocolInfo, tokenAnalysis: any): ProtocolRiskAnalysis {
    const riskFactors: string[] = [];
    
    // Audit score (simplified)
    const auditScore = protocolData.audits || 0;
    
    // Time in market
    const timeInMarket = protocolData.listedAt ? 
      Math.floor((Date.now() - protocolData.listedAt * 1000) / (1000 * 60 * 60 * 24)) : 0;

    // Governance risk assessment
    let governanceRisk: 'low' | 'medium' | 'high' = 'medium';
    if (timeInMarket > 365 && auditScore > 2) governanceRisk = 'low';
    else if (timeInMarket < 90 || auditScore === 0) governanceRisk = 'high';

    // Technical risk assessment
    let technicalRisk: 'low' | 'medium' | 'high' = 'medium';
    if (auditScore > 3 && protocolData.tvl > 100000000) technicalRisk = 'low';
    else if (auditScore === 0 || protocolData.tvl < 1000000) technicalRisk = 'high';

    // Risk factors
    if (auditScore === 0) riskFactors.push('no_audits');
    if (timeInMarket < 90) riskFactors.push('new_protocol');
    if (protocolData.tvl < 10000000) riskFactors.push('low_tvl');
    if (protocolData.forkedFrom && protocolData.forkedFrom.length > 0) riskFactors.push('forked_protocol');

    return {
      protocolName: protocolData.name,
      protocolTVL: protocolData.tvl,
      protocolCategory: protocolData.category,
      auditScore,
      timeInMarket,
      governanceRisk,
      technicalRisk,
      riskFactors,
    };
  }

  private analyzeMarketRisk(tokenAnalysis: any, transactionAnalysis: any): MarketRiskAnalysis {
    const riskFactors: string[] = [];
    
    // Market cap risk
    const marketCap = tokenAnalysis?.priceData?.marketCap || 0;
    let marketCapRisk: 'low' | 'medium' | 'high' = 'medium';
    if (marketCap > 1000000000) marketCapRisk = 'low';
    else if (marketCap < 10000000) marketCapRisk = 'high';

    // Liquidity risk
    const volume24h = tokenAnalysis?.priceData?.volume24h || 0;
    let liquidityRisk: 'low' | 'medium' | 'high' = 'medium';
    if (volume24h > 10000000) liquidityRisk = 'low';
    else if (volume24h < 100000) liquidityRisk = 'high';

    // Concentration risk
    const top10Concentration = tokenAnalysis?.holdersAnalysis?.top10Concentration || 0;
    let concentrationRisk: 'low' | 'medium' | 'high' = 'low';
    if (top10Concentration > 70) concentrationRisk = 'high';
    else if (top10Concentration > 50) concentrationRisk = 'medium';

    // Risk factors
    if (marketCap < 10000000) riskFactors.push('small_market_cap');
    if (volume24h < 100000) riskFactors.push('low_trading_volume');
    if (top10Concentration > 50) riskFactors.push('high_concentration');

    return {
      marketCapRisk,
      liquidityRisk,
      concentrationRisk,
      riskFactors,
    };
  }

  private analyzeYieldRisk(yieldData: any[]): YieldRiskAnalysis {
    if (!yieldData || yieldData.length === 0) {
      return {
        bestYieldOpportunities: [],
        averageAPY: 0,
        riskAdjustedReturn: 0,
        impermanentLossRisk: 'high',
        smartContractRisk: 'high',
        yieldStability: 'highly_volatile',
        riskFactors: ['no_yield_opportunities'],
      };
    }

    const averageAPY = yieldData.reduce((sum, pool) => sum + (pool.apy || 0), 0) / yieldData.length;
    const riskFactors: string[] = [];

    // Assess risks based on yield data
    let impermanentLossRisk: 'low' | 'medium' | 'high' = 'medium';
    let smartContractRisk: 'low' | 'medium' | 'high' = 'medium';
    let yieldStability: 'stable' | 'volatile' | 'highly_volatile' = 'volatile';

    const stablecoinPools = yieldData.filter(pool => pool.stablecoin);
    if (stablecoinPools.length > 0) {
      impermanentLossRisk = 'low';
    }

    const highTVLPools = yieldData.filter(pool => pool.tvlUsd > 50000000);
    if (highTVLPools.length > 0) {
      smartContractRisk = 'low';
    }

    if (averageAPY > 100) {
      riskFactors.push('extremely_high_apy');
      yieldStability = 'highly_volatile';
    }

    return {
      bestYieldOpportunities: [], // Would be populated with analyzed pools
      averageAPY,
      riskAdjustedReturn: averageAPY * (1 - this.calculateYieldRiskPenalty(yieldData)),
      impermanentLossRisk,
      smartContractRisk,
      yieldStability,
      riskFactors,
    };
  }

  private analyzeLiquidityRisk(tokenAnalysis: any, transactionAnalysis: any): LiquidityRiskAnalysis {
    const volume24h = tokenAnalysis?.priceData?.volume24h || 0;
    const txCount24h = transactionAnalysis?.volumeAnalysis?.transactionCount24h || 0;
    
    let slippageRisk: 'low' | 'medium' | 'high' = 'medium';
    if (volume24h > 10000000 && txCount24h > 100) slippageRisk = 'low';
    else if (volume24h < 100000 || txCount24h < 10) slippageRisk = 'high';

    const riskFactors: string[] = [];
    if (volume24h < 100000) riskFactors.push('low_trading_volume');
    if (txCount24h < 10) riskFactors.push('low_transaction_count');

    return {
      dexLiquidity: volume24h * 0.7, // Estimate
      cexLiquidity: volume24h * 0.3, // Estimate
      totalLiquidity: volume24h,
      liquidityDistribution: {
        dex: 70,
        cex: 30,
      },
      slippageRisk,
      liquidityStability: 'volatile',
      riskFactors,
    };
  }

  private calculateOverallRiskScore(assessment: ComprehensiveRiskAssessment): number {
    let totalScore = 0;
    let weightSum = 0;

    // Protocol risk (weight: 25%)
    if (assessment.protocolRisk) {
      const protocolScore = this.riskLevelToScore(assessment.protocolRisk.technicalRisk) * 0.6 +
                           this.riskLevelToScore(assessment.protocolRisk.governanceRisk) * 0.4;
      totalScore += protocolScore * 0.25;
      weightSum += 0.25;
    }

    // Market risk (weight: 30%)
    if (assessment.marketRisk) {
      const marketScore = (this.riskLevelToScore(assessment.marketRisk.marketCapRisk) +
                          this.riskLevelToScore(assessment.marketRisk.liquidityRisk) +
                          this.riskLevelToScore(assessment.marketRisk.concentrationRisk)) / 3;
      totalScore += marketScore * 0.30;
      weightSum += 0.30;
    }

    // Yield risk (weight: 20%)
    if (assessment.yieldRisk) {
      const yieldScore = (this.riskLevelToScore(assessment.yieldRisk.impermanentLossRisk) +
                         this.riskLevelToScore(assessment.yieldRisk.smartContractRisk)) / 2;
      totalScore += yieldScore * 0.20;
      weightSum += 0.20;
    }

    // Liquidity risk (weight: 25%)
    if (assessment.liquidityRisk) {
      const liquidityScore = this.riskLevelToScore(assessment.liquidityRisk.slippageRisk);
      totalScore += liquidityScore * 0.25;
      weightSum += 0.25;
    }

    return weightSum > 0 ? Math.round(totalScore / weightSum) : 50;
  }

  private riskLevelToScore(level: 'low' | 'medium' | 'high'): number {
    switch (level) {
      case 'low': return 20;
      case 'medium': return 50;
      case 'high': return 80;
      default: return 50;
    }
  }

  private categorizeRisk(score: number): 'low' | 'medium' | 'high' | 'extreme' {
    if (score <= 25) return 'low';
    if (score <= 50) return 'medium';
    if (score <= 75) return 'high';
    return 'extreme';
  }

  private calculateConfidence(assessment: ComprehensiveRiskAssessment): number {
    let confidence = 1.0;
    const dataPoints = [
      assessment.protocolRisk,
      assessment.marketRisk,
      assessment.yieldRisk,
      assessment.liquidityRisk,
    ].filter(Boolean).length;

    confidence = dataPoints / 4; // Max 4 data points
    return Math.round(confidence * 100) / 100;
  }

  private generateRiskFactors(assessment: ComprehensiveRiskAssessment): void {
    const factors: string[] = [];
    
    if (assessment.protocolRisk) factors.push(...assessment.protocolRisk.riskFactors);
    if (assessment.marketRisk) factors.push(...assessment.marketRisk.riskFactors);
    if (assessment.yieldRisk) factors.push(...assessment.yieldRisk.riskFactors);
    if (assessment.liquidityRisk) factors.push(...assessment.liquidityRisk.riskFactors);

    assessment.keyRiskFactors = [...new Set(factors)]; // Remove duplicates
  }

  private generateRecommendations(assessment: ComprehensiveRiskAssessment): void {
    const recommendations: string[] = [];

    if (assessment.overallRiskScore > 70) {
      recommendations.push('Consider reducing position size due to high risk');
    }

    if (assessment.marketRisk?.concentrationRisk === 'high') {
      recommendations.push('Monitor whale activity and large holder movements');
    }

    if (assessment.liquidityRisk?.slippageRisk === 'high') {
      recommendations.push('Use limit orders and split large trades');
    }

    if (assessment.yieldRisk && assessment.yieldRisk.averageAPY > 50) {
      recommendations.push('High yield opportunities available but verify risks');
    }

    assessment.recommendations = recommendations;
  }

  private generateWarnings(assessment: ComprehensiveRiskAssessment): void {
    const warnings: string[] = [];

    if (assessment.overallRiskScore > 80) {
      warnings.push('EXTREME RISK: This token carries very high risk');
    }

    if (assessment.protocolRisk?.auditScore === 0) {
      warnings.push('No security audits found for this protocol');
    }

    if (assessment.marketRisk?.marketCapRisk === 'high') {
      warnings.push('Small market cap increases volatility risk');
    }

    assessment.warnings = warnings;
  }

  private calculateYieldRiskPenalty(yieldData: any[]): number {
    // Simple risk penalty calculation
    const avgAPY = yieldData.reduce((sum, pool) => sum + (pool.apy || 0), 0) / yieldData.length;
    if (avgAPY > 100) return 0.5; // 50% penalty for extremely high APY
    if (avgAPY > 50) return 0.3;  // 30% penalty for high APY
    if (avgAPY > 20) return 0.1;  // 10% penalty for moderate APY
    return 0;
  }

  private getCacheTTL(confidence: number): number {
    if (confidence > 0.8) return 1800; // 30 minutes
    if (confidence > 0.6) return 1200; // 20 minutes
    if (confidence > 0.4) return 900;  // 15 minutes
    return 600; // 10 minutes
  }

  private extractSettledValue<T>(settledResult: PromiseSettledResult<T>): T | null {
    return settledResult.status === 'fulfilled' ? settledResult.value : null;
  }
}
