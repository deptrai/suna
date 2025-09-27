import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { BigNumber } from 'bignumber.js';

import { BlockchainData } from '../entities/blockchain-data.entity';
import { PriceHistory } from '../entities/price-history.entity';
import { MoralisService } from '../external-apis/moralis.service';
import { DexScreenerService } from '../external-apis/dexscreener.service';
import { DeFiLlamaService } from '../external-apis/defillama.service';
import { CoinGeckoService } from '../external-apis/coingecko.service';
import { CacheService } from '../cache/cache.service';
import { MetricsService } from '../metrics/metrics.service';
import { OnChainAnalysisRequestDto } from './dto/onchain-analysis-request.dto';
import { OnChainAnalysisResponseDto } from './dto/onchain-analysis-response.dto';

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    @InjectRepository(BlockchainData)
    private readonly blockchainDataRepository: Repository<BlockchainData>,
    @InjectRepository(PriceHistory)
    private readonly priceHistoryRepository: Repository<PriceHistory>,
    private readonly moralisService: MoralisService,
    private readonly dexScreenerService: DexScreenerService,
    private readonly defiLlamaService: DeFiLlamaService,
    private readonly coinGeckoService: CoinGeckoService,
    private readonly cacheService: CacheService,
    private readonly metricsService: MetricsService,
    private readonly configService: ConfigService,
  ) {}

  async analyzeToken(request: OnChainAnalysisRequestDto): Promise<OnChainAnalysisResponseDto> {
    const startTime = Date.now();
    const { projectId, tokenAddress, chainId } = request;

    this.logger.log(`Starting onchain analysis for ${projectId}`, {
      projectId,
      tokenAddress,
      chainId,
    });

    try {
      // Check cache first
      const cacheKey = `onchain:${projectId}:${chainId || 'default'}`;
      const cachedResult = await this.cacheService.get<OnChainAnalysisResponseDto>(cacheKey);
      
      if (cachedResult) {
        this.logger.log(`Cache hit for ${projectId}`, { projectId, cacheKey });
        this.metricsService.incrementCacheHits('onchain_analysis');
        return cachedResult;
      }

      // Gather data from multiple sources in parallel
      const [
        moralisData,
        dexScreenerData,
        defiLlamaData,
        coinGeckoData,
      ] = await Promise.allSettled([
        this.getMoralisData(tokenAddress, chainId),
        this.getDexScreenerData(tokenAddress, chainId),
        this.getDeFiLlamaData(projectId),
        this.getCoinGeckoData(projectId),
      ]);

      // Process and combine data
      const analysisResult = await this.processAnalysisData({
        projectId,
        tokenAddress,
        chainId,
        moralisData: this.extractSettledValue(moralisData),
        dexScreenerData: this.extractSettledValue(dexScreenerData),
        defiLlamaData: this.extractSettledValue(defiLlamaData),
        coinGeckoData: this.extractSettledValue(coinGeckoData),
      });

      // Calculate risk score and confidence
      analysisResult.riskScore = this.calculateRiskScore(analysisResult);
      analysisResult.confidence = this.calculateConfidence(analysisResult);

      // Store in database
      await this.storeAnalysisResult(analysisResult);

      // Cache the result
      const cacheTTL = this.getCacheTTL(analysisResult.confidence);
      await this.cacheService.set(cacheKey, analysisResult, cacheTTL);

      // Record metrics
      const processingTime = Date.now() - startTime;
      this.metricsService.recordAnalysisTime('onchain', processingTime);
      this.metricsService.incrementAnalysisCount('onchain', 'success');

      this.logger.log(`Onchain analysis completed for ${projectId}`, {
        projectId,
        processingTime,
        riskScore: analysisResult.riskScore,
        confidence: analysisResult.confidence,
      });

      return analysisResult;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`Onchain analysis failed for ${projectId}`, {
        projectId,
        error: error.message,
        processingTime,
      });

      this.metricsService.incrementAnalysisCount('onchain', 'error');
      throw error;
    }
  }

  private async getMoralisData(tokenAddress?: string, chainId?: string) {
    if (!tokenAddress) return null;

    try {
      const [priceData, holderData, transactionData] = await Promise.allSettled([
        this.moralisService.getTokenPrice(tokenAddress, chainId),
        this.moralisService.getTokenHolders(tokenAddress, chainId),
        this.moralisService.getTokenTransactions(tokenAddress, chainId),
      ]);

      return {
        price: this.extractSettledValue(priceData),
        holders: this.extractSettledValue(holderData),
        transactions: this.extractSettledValue(transactionData),
      };
    } catch (error) {
      this.logger.warn(`Moralis API error: ${error.message}`);
      return null;
    }
  }

  private async getDexScreenerData(tokenAddress?: string, chainId?: string) {
    if (!tokenAddress) return null;

    try {
      const pairData = await this.dexScreenerService.getTokenPairs(chainId || 'ethereum', tokenAddress);
      return pairData;
    } catch (error) {
      this.logger.warn(`DexScreener API error: ${error.message}`);
      return null;
    }
  }

  private async getDeFiLlamaData(projectId: string) {
    try {
      const [protocolData, yieldData] = await Promise.allSettled([
        this.defiLlamaService.getProtocolTVL(projectId),
        this.defiLlamaService.getYieldData(projectId),
      ]);

      return {
        protocol: this.extractSettledValue(protocolData),
        yields: this.extractSettledValue(yieldData),
      };
    } catch (error) {
      this.logger.warn(`DeFiLlama API error: ${error.message}`);
      return null;
    }
  }

  private async getCoinGeckoData(projectId: string) {
    try {
      const marketData = await this.coinGeckoService.getMarketData(projectId);
      return marketData;
    } catch (error) {
      this.logger.warn(`CoinGecko API error: ${error.message}`);
      return null;
    }
  }

  private async processAnalysisData(data: any): Promise<OnChainAnalysisResponseDto> {
    const {
      projectId,
      tokenAddress,
      chainId,
      moralisData,
      dexScreenerData,
      defiLlamaData,
      coinGeckoData,
    } = data;

    // Initialize result
    const result: OnChainAnalysisResponseDto = {
      projectId,
      tokenAddress,
      chainId,
      marketCap: 0,
      volume24h: 0,
      priceChange24h: 0,
      liquidityScore: 0,
      holderCount: 0,
      riskScore: 0,
      confidence: 0,
      dataSource: 'multiple',
      lastUpdated: new Date(),
      warnings: [],
    };

    // Process market data
    if (coinGeckoData?.market_data) {
      result.marketCap = coinGeckoData.market_data.market_cap?.usd || 0;
      result.volume24h = coinGeckoData.market_data.total_volume?.usd || 0;
      result.priceChange24h = coinGeckoData.market_data.price_change_percentage_24h || 0;
    }

    // Process Moralis data
    if (moralisData?.price) {
      result.marketCap = result.marketCap || moralisData.price.marketCap || 0;
      result.volume24h = result.volume24h || moralisData.price.volume24h || 0;
    }

    if (moralisData?.holders) {
      result.holderCount = moralisData.holders.total || 0;
    }

    // Process DexScreener data for liquidity
    if (dexScreenerData?.pairs?.length > 0) {
      const totalLiquidity = dexScreenerData.pairs.reduce((sum: number, pair: any) => {
        return sum + (pair.liquidity?.usd || 0);
      }, 0);

      result.liquidityScore = this.calculateLiquidityScore(totalLiquidity, result.marketCap);
    }

    // Process DeFiLlama data
    if (defiLlamaData?.protocol) {
      // Add TVL information if available
      result.tvl = defiLlamaData.protocol.tvl;
    }

    // Add warnings for missing data
    if (!moralisData) result.warnings.push('moralis_unavailable');
    if (!dexScreenerData) result.warnings.push('dexscreener_unavailable');
    if (!defiLlamaData) result.warnings.push('defillama_unavailable');
    if (!coinGeckoData) result.warnings.push('coingecko_unavailable');

    return result;
  }

  private calculateRiskScore(data: OnChainAnalysisResponseDto): number {
    let riskScore = 0;
    const factors = [];

    // Market cap risk (lower market cap = higher risk)
    if (data.marketCap < 1000000) { // < $1M
      riskScore += 40;
      factors.push('low_market_cap');
    } else if (data.marketCap < 10000000) { // < $10M
      riskScore += 25;
      factors.push('small_market_cap');
    } else if (data.marketCap < 100000000) { // < $100M
      riskScore += 10;
    }

    // Liquidity risk
    if (data.liquidityScore < 30) {
      riskScore += 30;
      factors.push('low_liquidity');
    } else if (data.liquidityScore < 60) {
      riskScore += 15;
      factors.push('medium_liquidity');
    }

    // Holder concentration risk
    if (data.holderCount < 100) {
      riskScore += 25;
      factors.push('low_holder_count');
    } else if (data.holderCount < 1000) {
      riskScore += 10;
      factors.push('medium_holder_count');
    }

    // Price volatility risk
    if (Math.abs(data.priceChange24h) > 20) {
      riskScore += 20;
      factors.push('high_volatility');
    } else if (Math.abs(data.priceChange24h) > 10) {
      riskScore += 10;
      factors.push('medium_volatility');
    }

    // Data availability risk
    if (data.warnings.length > 2) {
      riskScore += 15;
      factors.push('limited_data');
    }

    // Cap at 100
    riskScore = Math.min(riskScore, 100);

    this.logger.debug(`Risk score calculated: ${riskScore}`, {
      projectId: data.projectId,
      riskScore,
      factors,
    });

    return riskScore;
  }

  private calculateLiquidityScore(totalLiquidity: number, marketCap: number): number {
    if (marketCap === 0) return 0;

    const liquidityRatio = totalLiquidity / marketCap;
    
    // Score based on liquidity ratio
    if (liquidityRatio > 0.1) return 100; // > 10% liquidity ratio
    if (liquidityRatio > 0.05) return 80;  // > 5% liquidity ratio
    if (liquidityRatio > 0.02) return 60;  // > 2% liquidity ratio
    if (liquidityRatio > 0.01) return 40;  // > 1% liquidity ratio
    if (liquidityRatio > 0.005) return 20; // > 0.5% liquidity ratio
    
    return 10; // Very low liquidity
  }

  private calculateConfidence(data: OnChainAnalysisResponseDto): number {
    let confidence = 1.0;
    const dataPoints = [];

    // Check data availability
    if (data.marketCap > 0) dataPoints.push('market_cap');
    if (data.volume24h > 0) dataPoints.push('volume');
    if (data.holderCount > 0) dataPoints.push('holders');
    if (data.liquidityScore > 0) dataPoints.push('liquidity');

    // Reduce confidence based on missing data
    const maxDataPoints = 4;
    const dataAvailability = dataPoints.length / maxDataPoints;
    confidence *= dataAvailability;

    // Reduce confidence based on warnings
    const warningPenalty = data.warnings.length * 0.1;
    confidence = Math.max(confidence - warningPenalty, 0.1);

    return Math.round(confidence * 100) / 100;
  }

  private getCacheTTL(confidence: number): number {
    // Higher confidence = longer cache time
    if (confidence > 0.8) return 900; // 15 minutes
    if (confidence > 0.6) return 600; // 10 minutes
    if (confidence > 0.4) return 300; // 5 minutes
    return 180; // 3 minutes for low confidence
  }

  private async storeAnalysisResult(result: OnChainAnalysisResponseDto): Promise<void> {
    try {
      const blockchainData = this.blockchainDataRepository.create({
        projectId: result.projectId,
        tokenAddress: result.tokenAddress,
        chainId: result.chainId,
        marketCap: result.marketCap,
        volume24h: result.volume24h,
        liquidityScore: result.liquidityScore,
        riskScore: result.riskScore,
        holderCount: result.holderCount,
        confidence: result.confidence,
        dataSource: result.dataSource,
        rawData: result,
      });

      await this.blockchainDataRepository.save(blockchainData);

      // Store price history if we have price data
      if (result.marketCap > 0) {
        const priceHistory = this.priceHistoryRepository.create({
          projectId: result.projectId,
          tokenAddress: result.tokenAddress,
          priceUsd: result.marketCap / (result.holderCount || 1), // Rough price estimation
          volumeUsd: result.volume24h,
          marketCapUsd: result.marketCap,
          dataSource: result.dataSource,
        });

        await this.priceHistoryRepository.save(priceHistory);
      }

    } catch (error) {
      this.logger.error(`Failed to store analysis result: ${error.message}`, {
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
