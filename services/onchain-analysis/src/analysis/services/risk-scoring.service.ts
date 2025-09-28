import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../../metrics/metrics.service';

export interface RiskFactor {
  name: string;
  value: number;
  weight: number;
  category: 'liquidity' | 'volatility' | 'holder' | 'market' | 'technical';
  confidence: number;
  description: string;
}

export interface RiskScore {
  overallScore: number;
  riskCategory: 'low' | 'medium' | 'high' | 'extreme';
  confidence: number;
  factors: RiskFactor[];
  breakdown: {
    liquidityRisk: number;
    volatilityRisk: number;
    holderRisk: number;
    marketRisk: number;
    technicalRisk: number;
  };
  recommendations: string[];
  warnings: string[];
}

export interface TokenRiskData {
  tokenAddress: string;
  chainId: string;
  liquidityUsd?: number;
  volume24h?: number;
  priceChange24h?: number;
  priceChange7d?: number;
  marketCap?: number;
  holders?: number;
  topHolderPercentage?: number;
  contractAge?: number;
  isVerified?: boolean;
  auditScore?: number;
  transactionCount24h?: number;
  uniqueTraders24h?: number;
  liquidityConcentration?: number;
  slippageEstimate?: number;
}

@Injectable()
export class RiskScoringService {
  private readonly logger = new Logger(RiskScoringService.name);

  // Risk factor weights (total = 100%)
  private readonly WEIGHTS = {
    liquidity: 0.25,    // 25% - Liquidity and market depth
    volatility: 0.20,   // 20% - Price volatility and stability
    holder: 0.20,       // 20% - Holder distribution and concentration
    market: 0.20,       // 20% - Market metrics and trading activity
    technical: 0.15,    // 15% - Technical and security factors
  };

  // Risk thresholds
  private readonly THRESHOLDS = {
    liquidity: {
      low: 1000000,     // $1M+ = low risk
      medium: 100000,   // $100K+ = medium risk
      high: 10000,      // $10K+ = high risk
      // <$10K = extreme risk
    },
    volatility: {
      low: 0.05,        // <5% daily change = low risk
      medium: 0.15,     // <15% daily change = medium risk
      high: 0.30,       // <30% daily change = high risk
      // >30% = extreme risk
    },
    holder: {
      concentration: 0.50, // >50% top holder = high risk
      minHolders: 1000,    // <1000 holders = high risk
    },
    market: {
      minVolume: 50000,    // <$50K daily volume = high risk
      minTraders: 100,     // <100 unique traders = high risk
    },
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  /**
   * Calculate comprehensive risk score for a token
   */
  async calculateRiskScore(data: TokenRiskData): Promise<RiskScore> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Calculating risk score for ${data.tokenAddress}`);

      // Calculate individual risk factors
      const liquidityFactors = this.calculateLiquidityRisk(data);
      const volatilityFactors = this.calculateVolatilityRisk(data);
      const holderFactors = this.calculateHolderRisk(data);
      const marketFactors = this.calculateMarketRisk(data);
      const technicalFactors = this.calculateTechnicalRisk(data);

      // Combine all factors
      const allFactors = [
        ...liquidityFactors,
        ...volatilityFactors,
        ...holderFactors,
        ...marketFactors,
        ...technicalFactors,
      ];

      // Calculate weighted overall score
      const breakdown = this.calculateBreakdown(allFactors);
      const overallScore = this.calculateOverallScore(breakdown);
      const riskCategory = this.determineRiskCategory(overallScore);
      const confidence = this.calculateConfidence(allFactors);

      // Generate recommendations and warnings
      const recommendations = this.generateRecommendations(allFactors, riskCategory);
      const warnings = this.generateWarnings(allFactors, riskCategory);

      const result: RiskScore = {
        overallScore,
        riskCategory,
        confidence,
        factors: allFactors,
        breakdown,
        recommendations,
        warnings,
      };

      const processingTime = Date.now() - startTime;
      this.metricsService.recordExternalApiCall(
        'risk-scoring',
        'calculate',
        'success',
        processingTime,
      );

      this.logger.log(`Risk score calculated: ${overallScore} (${riskCategory}) for ${data.tokenAddress}`);
      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.metricsService.recordExternalApiCall(
        'risk-scoring',
        'calculate',
        'error',
        processingTime,
      );

      this.logger.error(`Error calculating risk score for ${data.tokenAddress}:`, error.stack);
      throw error;
    }
  }

  /**
   * Calculate liquidity-related risk factors
   */
  private calculateLiquidityRisk(data: TokenRiskData): RiskFactor[] {
    const factors: RiskFactor[] = [];

    // Liquidity depth risk
    if (data.liquidityUsd !== undefined) {
      let score = 0;
      let description = '';

      if (data.liquidityUsd >= this.THRESHOLDS.liquidity.low) {
        score = 10; // Low risk
        description = 'Excellent liquidity depth';
      } else if (data.liquidityUsd >= this.THRESHOLDS.liquidity.medium) {
        score = 30; // Medium risk
        description = 'Moderate liquidity depth';
      } else if (data.liquidityUsd >= this.THRESHOLDS.liquidity.high) {
        score = 70; // High risk
        description = 'Low liquidity depth';
      } else {
        score = 95; // Extreme risk
        description = 'Very low liquidity depth';
      }

      factors.push({
        name: 'Liquidity Depth',
        value: score,
        weight: 0.6, // 60% of liquidity category
        category: 'liquidity',
        confidence: 0.9,
        description,
      });
    }

    // Liquidity concentration risk
    if (data.liquidityConcentration !== undefined) {
      let score = 0;
      let description = '';

      if (data.liquidityConcentration <= 0.3) {
        score = 10; // Low risk - well distributed
        description = 'Well-distributed liquidity';
      } else if (data.liquidityConcentration <= 0.6) {
        score = 40; // Medium risk
        description = 'Moderately concentrated liquidity';
      } else if (data.liquidityConcentration <= 0.8) {
        score = 70; // High risk
        description = 'Highly concentrated liquidity';
      } else {
        score = 90; // Extreme risk
        description = 'Extremely concentrated liquidity';
      }

      factors.push({
        name: 'Liquidity Concentration',
        value: score,
        weight: 0.4, // 40% of liquidity category
        category: 'liquidity',
        confidence: 0.8,
        description,
      });
    }

    return factors;
  }

  /**
   * Calculate volatility-related risk factors
   */
  private calculateVolatilityRisk(data: TokenRiskData): RiskFactor[] {
    const factors: RiskFactor[] = [];

    // 24h price volatility
    if (data.priceChange24h !== undefined) {
      const absChange = Math.abs(data.priceChange24h);
      let score = 0;
      let description = '';

      if (absChange <= this.THRESHOLDS.volatility.low) {
        score = 15; // Low risk
        description = 'Low price volatility';
      } else if (absChange <= this.THRESHOLDS.volatility.medium) {
        score = 40; // Medium risk
        description = 'Moderate price volatility';
      } else if (absChange <= this.THRESHOLDS.volatility.high) {
        score = 70; // High risk
        description = 'High price volatility';
      } else {
        score = 90; // Extreme risk
        description = 'Extreme price volatility';
      }

      factors.push({
        name: '24h Price Volatility',
        value: score,
        weight: 0.6, // 60% of volatility category
        category: 'volatility',
        confidence: 0.9,
        description,
      });
    }

    // 7d price trend stability
    if (data.priceChange7d !== undefined) {
      const absChange = Math.abs(data.priceChange7d);
      let score = 0;
      let description = '';

      if (absChange <= 0.20) {
        score = 20; // Low risk
        description = 'Stable weekly trend';
      } else if (absChange <= 0.50) {
        score = 45; // Medium risk
        description = 'Moderate weekly volatility';
      } else if (absChange <= 1.0) {
        score = 75; // High risk
        description = 'High weekly volatility';
      } else {
        score = 95; // Extreme risk
        description = 'Extreme weekly volatility';
      }

      factors.push({
        name: '7d Price Stability',
        value: score,
        weight: 0.4, // 40% of volatility category
        category: 'volatility',
        confidence: 0.8,
        description,
      });
    }

    return factors;
  }

  /**
   * Calculate holder-related risk factors
   */
  private calculateHolderRisk(data: TokenRiskData): RiskFactor[] {
    const factors: RiskFactor[] = [];

    // Holder count
    if (data.holders !== undefined) {
      let score = 0;
      let description = '';

      if (data.holders >= 10000) {
        score = 10; // Low risk
        description = 'Large holder base';
      } else if (data.holders >= this.THRESHOLDS.holder.minHolders) {
        score = 30; // Medium risk
        description = 'Moderate holder base';
      } else if (data.holders >= 100) {
        score = 70; // High risk
        description = 'Small holder base';
      } else {
        score = 95; // Extreme risk
        description = 'Very small holder base';
      }

      factors.push({
        name: 'Holder Count',
        value: score,
        weight: 0.5, // 50% of holder category
        category: 'holder',
        confidence: 0.7,
        description,
      });
    }

    // Top holder concentration
    if (data.topHolderPercentage !== undefined) {
      let score = 0;
      let description = '';

      if (data.topHolderPercentage <= 0.10) {
        score = 15; // Low risk
        description = 'Well-distributed ownership';
      } else if (data.topHolderPercentage <= 0.25) {
        score = 35; // Medium risk
        description = 'Moderate ownership concentration';
      } else if (data.topHolderPercentage <= this.THRESHOLDS.holder.concentration) {
        score = 70; // High risk
        description = 'High ownership concentration';
      } else {
        score = 90; // Extreme risk
        description = 'Extreme ownership concentration';
      }

      factors.push({
        name: 'Top Holder Concentration',
        value: score,
        weight: 0.5, // 50% of holder category
        category: 'holder',
        confidence: 0.8,
        description,
      });
    }

    return factors;
  }

  /**
   * Calculate market-related risk factors
   */
  private calculateMarketRisk(data: TokenRiskData): RiskFactor[] {
    const factors: RiskFactor[] = [];

    // Trading volume
    if (data.volume24h !== undefined) {
      let score = 0;
      let description = '';

      if (data.volume24h >= 1000000) {
        score = 10; // Low risk
        description = 'High trading volume';
      } else if (data.volume24h >= 100000) {
        score = 30; // Medium risk
        description = 'Moderate trading volume';
      } else if (data.volume24h >= this.THRESHOLDS.market.minVolume) {
        score = 70; // High risk
        description = 'Low trading volume';
      } else {
        score = 95; // Extreme risk
        description = 'Very low trading volume';
      }

      factors.push({
        name: 'Trading Volume',
        value: score,
        weight: 0.4, // 40% of market category
        category: 'market',
        confidence: 0.9,
        description,
      });
    }

    // Market cap
    if (data.marketCap !== undefined) {
      let score = 0;
      let description = '';

      if (data.marketCap >= 100000000) {
        score = 15; // Low risk
        description = 'Large market cap';
      } else if (data.marketCap >= 10000000) {
        score = 35; // Medium risk
        description = 'Medium market cap';
      } else if (data.marketCap >= 1000000) {
        score = 65; // High risk
        description = 'Small market cap';
      } else {
        score = 90; // Extreme risk
        description = 'Micro market cap';
      }

      factors.push({
        name: 'Market Cap',
        value: score,
        weight: 0.3, // 30% of market category
        category: 'market',
        confidence: 0.8,
        description,
      });
    }

    // Unique traders
    if (data.uniqueTraders24h !== undefined) {
      let score = 0;
      let description = '';

      if (data.uniqueTraders24h >= 1000) {
        score = 10; // Low risk
        description = 'High trader activity';
      } else if (data.uniqueTraders24h >= 500) {
        score = 30; // Medium risk
        description = 'Moderate trader activity';
      } else if (data.uniqueTraders24h >= this.THRESHOLDS.market.minTraders) {
        score = 70; // High risk
        description = 'Low trader activity';
      } else {
        score = 95; // Extreme risk
        description = 'Very low trader activity';
      }

      factors.push({
        name: 'Unique Traders',
        value: score,
        weight: 0.3, // 30% of market category
        category: 'market',
        confidence: 0.7,
        description,
      });
    }

    return factors;
  }

  /**
   * Calculate technical and security risk factors
   */
  private calculateTechnicalRisk(data: TokenRiskData): RiskFactor[] {
    const factors: RiskFactor[] = [];

    // Contract age
    if (data.contractAge !== undefined) {
      let score = 0;
      let description = '';

      if (data.contractAge >= 365) {
        score = 10; // Low risk - mature contract
        description = 'Mature contract (1+ years)';
      } else if (data.contractAge >= 90) {
        score = 25; // Medium risk
        description = 'Established contract (3+ months)';
      } else if (data.contractAge >= 30) {
        score = 50; // High risk
        description = 'New contract (1+ month)';
      } else {
        score = 80; // Extreme risk
        description = 'Very new contract (<1 month)';
      }

      factors.push({
        name: 'Contract Age',
        value: score,
        weight: 0.4, // 40% of technical category
        category: 'technical',
        confidence: 0.9,
        description,
      });
    }

    // Verification status
    if (data.isVerified !== undefined) {
      const score = data.isVerified ? 10 : 70;
      const description = data.isVerified ? 'Contract verified' : 'Contract not verified';

      factors.push({
        name: 'Contract Verification',
        value: score,
        weight: 0.3, // 30% of technical category
        category: 'technical',
        confidence: 0.95,
        description,
      });
    }

    // Audit score
    if (data.auditScore !== undefined) {
      let score = 0;
      let description = '';

      if (data.auditScore >= 90) {
        score = 5; // Very low risk
        description = 'Excellent audit score';
      } else if (data.auditScore >= 70) {
        score = 20; // Low risk
        description = 'Good audit score';
      } else if (data.auditScore >= 50) {
        score = 50; // Medium risk
        description = 'Fair audit score';
      } else {
        score = 85; // High risk
        description = 'Poor audit score';
      }

      factors.push({
        name: 'Audit Score',
        value: score,
        weight: 0.3, // 30% of technical category
        category: 'technical',
        confidence: 0.8,
        description,
      });
    }

    return factors;
  }

  /**
   * Calculate risk breakdown by category
   */
  private calculateBreakdown(factors: RiskFactor[]): RiskScore['breakdown'] {
    const categories = ['liquidity', 'volatility', 'holder', 'market', 'technical'] as const;
    const breakdown = {} as RiskScore['breakdown'];

    for (const category of categories) {
      const categoryFactors = factors.filter(f => f.category === category);
      if (categoryFactors.length === 0) {
        breakdown[`${category}Risk`] = 50; // Default medium risk if no data
        continue;
      }

      const weightedSum = categoryFactors.reduce((sum, factor) => {
        return sum + (factor.value * factor.weight);
      }, 0);

      const totalWeight = categoryFactors.reduce((sum, factor) => sum + factor.weight, 0);
      breakdown[`${category}Risk`] = totalWeight > 0 ? weightedSum / totalWeight : 50;
    }

    return breakdown;
  }

  /**
   * Calculate overall weighted risk score
   */
  private calculateOverallScore(breakdown: RiskScore['breakdown']): number {
    return (
      breakdown.liquidityRisk * this.WEIGHTS.liquidity +
      breakdown.volatilityRisk * this.WEIGHTS.volatility +
      breakdown.holderRisk * this.WEIGHTS.holder +
      breakdown.marketRisk * this.WEIGHTS.market +
      breakdown.technicalRisk * this.WEIGHTS.technical
    );
  }

  /**
   * Determine risk category based on overall score
   */
  private determineRiskCategory(score: number): RiskScore['riskCategory'] {
    if (score <= 25) return 'low';
    if (score <= 50) return 'medium';
    if (score <= 75) return 'high';
    return 'extreme';
  }

  /**
   * Calculate confidence based on available data
   */
  private calculateConfidence(factors: RiskFactor[]): number {
    if (factors.length === 0) return 0.1;

    const avgConfidence = factors.reduce((sum, factor) => sum + factor.confidence, 0) / factors.length;
    const dataCompleteness = Math.min(factors.length / 10, 1); // Assume 10 factors is complete
    
    return Math.min(avgConfidence * dataCompleteness, 0.95);
  }

  /**
   * Generate recommendations based on risk factors
   */
  private generateRecommendations(factors: RiskFactor[], category: RiskScore['riskCategory']): string[] {
    const recommendations: string[] = [];

    // Category-specific recommendations
    if (category === 'extreme') {
      recommendations.push('Extreme caution advised - consider avoiding this token');
      recommendations.push('If investing, use only funds you can afford to lose completely');
    } else if (category === 'high') {
      recommendations.push('High risk detected - proceed with extreme caution');
      recommendations.push('Consider smaller position sizes and strict stop-losses');
    } else if (category === 'medium') {
      recommendations.push('Moderate risk - suitable for experienced investors');
      recommendations.push('Consider diversification and risk management strategies');
    } else {
      recommendations.push('Relatively low risk - suitable for most investment strategies');
      recommendations.push('Continue monitoring for any changes in risk profile');
    }

    // Factor-specific recommendations
    const highRiskFactors = factors.filter(f => f.value > 70);
    for (const factor of highRiskFactors) {
      switch (factor.category) {
        case 'liquidity':
          recommendations.push('Monitor liquidity closely before large trades');
          break;
        case 'volatility':
          recommendations.push('Use appropriate position sizing for high volatility');
          break;
        case 'holder':
          recommendations.push('Watch for whale movements and concentration changes');
          break;
        case 'market':
          recommendations.push('Verify market activity and trading volume trends');
          break;
        case 'technical':
          recommendations.push('Conduct additional due diligence on contract security');
          break;
      }
    }

    return recommendations;
  }

  /**
   * Generate warnings based on risk factors
   */
  private generateWarnings(factors: RiskFactor[], category: RiskScore['riskCategory']): string[] {
    const warnings: string[] = [];

    // Critical warnings for extreme risk factors
    const extremeFactors = factors.filter(f => f.value > 90);
    for (const factor of extremeFactors) {
      warnings.push(`CRITICAL: ${factor.description}`);
    }

    // Category warnings
    if (category === 'extreme') {
      warnings.push('EXTREME RISK: This token shows multiple high-risk indicators');
    }

    // Specific factor warnings
    const liquidityFactors = factors.filter(f => f.category === 'liquidity' && f.value > 70);
    if (liquidityFactors.length > 0) {
      warnings.push('WARNING: Low liquidity may cause high slippage');
    }

    const holderFactors = factors.filter(f => f.category === 'holder' && f.value > 70);
    if (holderFactors.length > 0) {
      warnings.push('WARNING: High holder concentration risk');
    }

    const technicalFactors = factors.filter(f => f.category === 'technical' && f.value > 70);
    if (technicalFactors.length > 0) {
      warnings.push('WARNING: Technical or security concerns detected');
    }

    return warnings;
  }
}
