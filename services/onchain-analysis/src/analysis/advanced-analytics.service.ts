/**
 * Advanced OnChain Analytics Service
 * Story 2.2: Advanced OnChain Analytics Implementation
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MoralisService } from '../external-apis/moralis.service';
import { DeFiLlamaService } from '../external-apis/defillama.service';
import { DexScreenerService } from '../external-apis/dexscreener.service';

export interface LiquidityAnalysis {
  totalLiquidity: number;
  liquidityPools: Array<{
    dex: string;
    pair: string;
    liquidity: number;
    volume24h: number;
    priceChange24h: number;
  }>;
  liquidityScore: number;
  poolHealthScore: number;
  warnings: string[];
}

export interface HolderDistribution {
  totalHolders: number;
  top10Holders: number;
  top10Percentage: number;
  top50Percentage: number;
  top100Percentage: number;
  distributionScore: number;
  giniCoefficient: number;
  warnings: string[];
}

export interface TransactionPattern {
  totalTransactions24h: number;
  buyTransactions: number;
  sellTransactions: number;
  avgTransactionSize: number;
  largeTransactions: number;
  suspiciousPatterns: string[];
  patternScore: number;
}

export interface WhaleActivity {
  whaleCount: number;
  whaleHoldings: number;
  whaleHoldingsPercentage: number;
  recentWhaleTransactions: Array<{
    type: 'buy' | 'sell';
    amount: number;
    timestamp: Date;
    address: string;
  }>;
  whaleActivityLevel: 'low' | 'moderate' | 'high' | 'extreme';
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ContractSecurity {
  isVerified: boolean;
  hasProxy: boolean;
  hasMintFunction: boolean;
  hasPauseFunction: boolean;
  hasBlacklist: boolean;
  ownershipRenounced: boolean;
  securityScore: number;
  vulnerabilities: string[];
  warnings: string[];
}

@Injectable()
export class AdvancedAnalyticsService {
  private readonly logger = new Logger(AdvancedAnalyticsService.name);

  constructor(
    private readonly moralisService: MoralisService,
    private readonly defiLlamaService: DeFiLlamaService,
    private readonly dexScreenerService: DexScreenerService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * T2.2.1: Liquidity Analysis
   * Analyze liquidity pools and health metrics
   */
  async analyzeLiquidity(tokenAddress: string, chain: string): Promise<LiquidityAnalysis> {
    this.logger.log(`Analyzing liquidity for ${tokenAddress} on ${chain}`);

    try {
      // Get liquidity data from DexScreener
      const dexData = await this.dexScreenerService.getPairsByToken(tokenAddress);

      const liquidityPools = dexData?.map(pair => ({
        dex: pair.dexId || 'Unknown',
        pair: pair.pairAddress || '',
        liquidity: pair.liquidity?.usd || 0,
        volume24h: pair.volume?.h24 || 0,
        priceChange24h: pair.priceChange?.h24 || 0,
      })) || [];

      const totalLiquidity = liquidityPools.reduce((sum, pool) => sum + pool.liquidity, 0);
      
      // Calculate liquidity score (0-100)
      const liquidityScore = this.calculateLiquidityScore(totalLiquidity, liquidityPools);
      
      // Calculate pool health score
      const poolHealthScore = this.calculatePoolHealthScore(liquidityPools);
      
      // Identify warnings
      const warnings = this.identifyLiquidityWarnings(totalLiquidity, liquidityPools);

      return {
        totalLiquidity,
        liquidityPools,
        liquidityScore,
        poolHealthScore,
        warnings,
      };
    } catch (error) {
      this.logger.error(`Liquidity analysis failed: ${error.message}`);
      return {
        totalLiquidity: 0,
        liquidityPools: [],
        liquidityScore: 0,
        poolHealthScore: 0,
        warnings: ['liquidity_data_unavailable'],
      };
    }
  }

  /**
   * T2.2.2: Holder Distribution Analysis
   * Analyze token holder distribution patterns
   */
  async analyzeHolderDistribution(tokenAddress: string, chain: string): Promise<HolderDistribution> {
    this.logger.log(`Analyzing holder distribution for ${tokenAddress} on ${chain}`);

    try {
      // In production, this would call Moralis or similar API
      // For now, return simulated data
      const totalHolders = Math.floor(Math.random() * 50000) + 1000;
      const top10Percentage = Math.random() * 0.5 + 0.2; // 20-70%
      const top50Percentage = Math.random() * 0.3 + top10Percentage;
      const top100Percentage = Math.random() * 0.2 + top50Percentage;

      const distributionScore = this.calculateDistributionScore(top10Percentage, top50Percentage);
      const giniCoefficient = this.calculateGiniCoefficient(top10Percentage, top50Percentage, top100Percentage);
      const warnings = this.identifyDistributionWarnings(top10Percentage, giniCoefficient);

      return {
        totalHolders,
        top10Holders: Math.floor(totalHolders * 0.0002), // Estimate
        top10Percentage,
        top50Percentage,
        top100Percentage,
        distributionScore,
        giniCoefficient,
        warnings,
      };
    } catch (error) {
      this.logger.error(`Holder distribution analysis failed: ${error.message}`);
      return {
        totalHolders: 0,
        top10Holders: 0,
        top10Percentage: 0,
        top50Percentage: 0,
        top100Percentage: 0,
        distributionScore: 0,
        giniCoefficient: 0,
        warnings: ['holder_data_unavailable'],
      };
    }
  }

  /**
   * T2.2.3: Transaction Pattern Recognition
   * Detect suspicious transaction patterns
   */
  async analyzeTransactionPatterns(tokenAddress: string, chain: string): Promise<TransactionPattern> {
    this.logger.log(`Analyzing transaction patterns for ${tokenAddress} on ${chain}`);

    try {
      // In production, this would analyze on-chain transactions
      // For now, return simulated data
      const totalTransactions24h = Math.floor(Math.random() * 10000) + 100;
      const buyTransactions = Math.floor(totalTransactions24h * (Math.random() * 0.3 + 0.4));
      const sellTransactions = totalTransactions24h - buyTransactions;
      const avgTransactionSize = Math.random() * 10000 + 100;
      const largeTransactions = Math.floor(totalTransactions24h * 0.05);

      const suspiciousPatterns = this.detectSuspiciousPatterns(
        buyTransactions,
        sellTransactions,
        largeTransactions,
        totalTransactions24h,
      );

      const patternScore = this.calculatePatternScore(suspiciousPatterns.length);

      return {
        totalTransactions24h,
        buyTransactions,
        sellTransactions,
        avgTransactionSize,
        largeTransactions,
        suspiciousPatterns,
        patternScore,
      };
    } catch (error) {
      this.logger.error(`Transaction pattern analysis failed: ${error.message}`);
      return {
        totalTransactions24h: 0,
        buyTransactions: 0,
        sellTransactions: 0,
        avgTransactionSize: 0,
        largeTransactions: 0,
        suspiciousPatterns: ['transaction_data_unavailable'],
        patternScore: 0,
      };
    }
  }

  /**
   * T2.2.4: Whale Activity Detection
   * Monitor large holder activities
   */
  async detectWhaleActivity(tokenAddress: string, chain: string): Promise<WhaleActivity> {
    this.logger.log(`Detecting whale activity for ${tokenAddress} on ${chain}`);

    try {
      // In production, this would track large wallet movements
      // For now, return simulated data
      const whaleCount = Math.floor(Math.random() * 50) + 5;
      const whaleHoldingsPercentage = Math.random() * 0.4 + 0.1; // 10-50%
      const whaleHoldings = whaleHoldingsPercentage * 1000000; // Simulated total supply

      const recentWhaleTransactions = this.generateSimulatedWhaleTransactions();
      const whaleActivityLevel = this.calculateWhaleActivityLevel(recentWhaleTransactions.length);
      const riskLevel = this.calculateWhaleRiskLevel(whaleHoldingsPercentage, whaleActivityLevel);

      return {
        whaleCount,
        whaleHoldings,
        whaleHoldingsPercentage,
        recentWhaleTransactions,
        whaleActivityLevel,
        riskLevel,
      };
    } catch (error) {
      this.logger.error(`Whale activity detection failed: ${error.message}`);
      return {
        whaleCount: 0,
        whaleHoldings: 0,
        whaleHoldingsPercentage: 0,
        recentWhaleTransactions: [],
        whaleActivityLevel: 'low',
        riskLevel: 'low',
      };
    }
  }

  /**
   * T2.2.5: Smart Contract Security Checks
   * Basic security analysis of smart contracts
   */
  async analyzeContractSecurity(tokenAddress: string, chain: string): Promise<ContractSecurity> {
    this.logger.log(`Analyzing contract security for ${tokenAddress} on ${chain}`);

    try {
      // In production, this would check contract code and functions
      // For now, return simulated data
      const isVerified = Math.random() > 0.3;
      const hasProxy = Math.random() > 0.7;
      const hasMintFunction = Math.random() > 0.6;
      const hasPauseFunction = Math.random() > 0.8;
      const hasBlacklist = Math.random() > 0.9;
      const ownershipRenounced = Math.random() > 0.5;

      const vulnerabilities = this.identifyVulnerabilities({
        hasProxy,
        hasMintFunction,
        hasPauseFunction,
        hasBlacklist,
        ownershipRenounced,
      });

      const warnings = this.identifySecurityWarnings({
        isVerified,
        hasProxy,
        hasMintFunction,
        hasPauseFunction,
        hasBlacklist,
        ownershipRenounced,
      });

      const securityScore = this.calculateSecurityScore({
        isVerified,
        hasProxy,
        hasMintFunction,
        hasPauseFunction,
        hasBlacklist,
        ownershipRenounced,
        vulnerabilities,
      });

      return {
        isVerified,
        hasProxy,
        hasMintFunction,
        hasPauseFunction,
        hasBlacklist,
        ownershipRenounced,
        securityScore,
        vulnerabilities,
        warnings,
      };
    } catch (error) {
      this.logger.error(`Contract security analysis failed: ${error.message}`);
      return {
        isVerified: false,
        hasProxy: false,
        hasMintFunction: false,
        hasPauseFunction: false,
        hasBlacklist: false,
        ownershipRenounced: false,
        securityScore: 0,
        vulnerabilities: ['security_data_unavailable'],
        warnings: ['contract_not_verified'],
      };
    }
  }

  // Helper methods for calculations
  private calculateLiquidityScore(totalLiquidity: number, pools: any[]): number {
    let score = 100;
    
    if (totalLiquidity < 100000) score -= 40;
    else if (totalLiquidity < 500000) score -= 20;
    else if (totalLiquidity < 1000000) score -= 10;
    
    if (pools.length < 2) score -= 20;
    
    return Math.max(0, score);
  }

  private calculatePoolHealthScore(pools: any[]): number {
    if (pools.length === 0) return 0;
    
    const avgVolume = pools.reduce((sum, p) => sum + p.volume24h, 0) / pools.length;
    const avgLiquidity = pools.reduce((sum, p) => sum + p.liquidity, 0) / pools.length;
    
    let score = 100;
    if (avgVolume < avgLiquidity * 0.1) score -= 30; // Low volume relative to liquidity
    if (avgLiquidity < 100000) score -= 20;
    
    return Math.max(0, score);
  }

  private identifyLiquidityWarnings(totalLiquidity: number, pools: any[]): string[] {
    const warnings = [];
    
    if (totalLiquidity < 100000) warnings.push('low_liquidity');
    if (pools.length < 2) warnings.push('single_pool_risk');
    if (pools.some(p => p.volume24h < p.liquidity * 0.05)) warnings.push('low_trading_volume');
    
    return warnings;
  }

  private calculateDistributionScore(top10: number, top50: number): number {
    let score = 100;
    
    if (top10 > 0.7) score -= 40;
    else if (top10 > 0.5) score -= 25;
    else if (top10 > 0.3) score -= 10;
    
    if (top50 > 0.9) score -= 20;
    
    return Math.max(0, score);
  }

  private calculateGiniCoefficient(top10: number, top50: number, top100: number): number {
    // Simplified Gini coefficient calculation
    return (top10 * 0.5 + top50 * 0.3 + top100 * 0.2);
  }

  private identifyDistributionWarnings(top10: number, gini: number): string[] {
    const warnings = [];
    
    if (top10 > 0.7) warnings.push('extreme_concentration');
    else if (top10 > 0.5) warnings.push('high_concentration');
    
    if (gini > 0.7) warnings.push('unfair_distribution');
    
    return warnings;
  }

  private detectSuspiciousPatterns(buy: number, sell: number, large: number, total: number): string[] {
    const patterns = [];
    
    const sellRatio = sell / total;
    if (sellRatio > 0.7) patterns.push('high_sell_pressure');
    
    const largeRatio = large / total;
    if (largeRatio > 0.2) patterns.push('unusual_large_transactions');
    
    if (buy < sell * 0.5) patterns.push('bearish_sentiment');
    
    return patterns;
  }

  private calculatePatternScore(suspiciousCount: number): number {
    return Math.max(0, 100 - (suspiciousCount * 25));
  }

  private generateSimulatedWhaleTransactions(): any[] {
    const count = Math.floor(Math.random() * 10);
    return Array.from({ length: count }, () => ({
      type: Math.random() > 0.5 ? 'buy' : 'sell',
      amount: Math.random() * 1000000 + 100000,
      timestamp: new Date(Date.now() - Math.random() * 86400000),
      address: `0x${Math.random().toString(16).substr(2, 40)}`,
    }));
  }

  private calculateWhaleActivityLevel(txCount: number): 'low' | 'moderate' | 'high' | 'extreme' {
    if (txCount > 20) return 'extreme';
    if (txCount > 10) return 'high';
    if (txCount > 5) return 'moderate';
    return 'low';
  }

  private calculateWhaleRiskLevel(holdings: number, activity: string): 'low' | 'medium' | 'high' {
    if (holdings > 0.4 || activity === 'extreme') return 'high';
    if (holdings > 0.25 || activity === 'high') return 'medium';
    return 'low';
  }

  private identifyVulnerabilities(contract: any): string[] {
    const vulnerabilities = [];
    
    if (contract.hasMintFunction && !contract.ownershipRenounced) {
      vulnerabilities.push('unlimited_minting_risk');
    }
    
    if (contract.hasPauseFunction) {
      vulnerabilities.push('pausable_contract');
    }
    
    if (contract.hasBlacklist) {
      vulnerabilities.push('blacklist_function');
    }
    
    if (contract.hasProxy) {
      vulnerabilities.push('upgradeable_contract');
    }
    
    return vulnerabilities;
  }

  private identifySecurityWarnings(contract: any): string[] {
    const warnings = [];
    
    if (!contract.isVerified) warnings.push('contract_not_verified');
    if (!contract.ownershipRenounced) warnings.push('ownership_not_renounced');
    if (contract.hasMintFunction) warnings.push('mint_function_present');
    
    return warnings;
  }

  private calculateSecurityScore(contract: any): number {
    let score = 100;
    
    if (!contract.isVerified) score -= 30;
    if (!contract.ownershipRenounced) score -= 20;
    if (contract.hasMintFunction) score -= 15;
    if (contract.hasPauseFunction) score -= 10;
    if (contract.hasBlacklist) score -= 15;
    if (contract.hasProxy) score -= 10;
    
    score -= contract.vulnerabilities.length * 5;
    
    return Math.max(0, score);
  }
}

