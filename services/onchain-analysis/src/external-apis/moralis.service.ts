/**
 * T2.1.2a: Moralis Service
 * SDK installation, configuration, authentication, and rate limiting
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Moralis from 'moralis';
import { EvmChain } from '@moralisweb3/common-evm-utils';
import { CacheService } from '../cache/cache.service';
import { MetricsService } from '../metrics/metrics.service';

interface RateLimitState {
  requests: number;
  windowStart: number;
  burstRequests: number;
  burstWindowStart: number;
}

@Injectable()
export class MoralisService implements OnModuleInit {
  private readonly logger = new Logger(MoralisService.name);
  private isInitialized = false;
  private rateLimitState: RateLimitState = {
    requests: 0,
    windowStart: Date.now(),
    burstRequests: 0,
    burstWindowStart: Date.now(),
  };

  private readonly config: {
    apiKey: string;
    baseUrl: string;
    timeout: number;
    rateLimit: {
      requestsPerSecond: number;
      burstLimit: number;
    };
    retryConfig: {
      maxRetries: number;
      retryDelay: number;
      backoffMultiplier: number;
    };
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly metricsService: MetricsService,
  ) {
    this.config = this.configService.get('externalApi.moralis');
    
    if (!this.config?.apiKey) {
      this.logger.warn('Moralis API key not configured');
    }
  }

  async onModuleInit() {
    await this.initializeMoralis();
  }

  private async initializeMoralis(): Promise<void> {
    try {
      if (!this.config?.apiKey) {
        this.logger.warn('Moralis API key not provided, skipping initialization');
        return;
      }

      await Moralis.start({
        apiKey: this.config.apiKey,
      });

      this.isInitialized = true;
      this.logger.log('Moralis SDK initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Moralis SDK', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const windowDuration = 1000; // 1 second
    const burstWindowDuration = 60000; // 1 minute

    // Reset rate limit window if needed
    if (now - this.rateLimitState.windowStart >= windowDuration) {
      this.rateLimitState.requests = 0;
      this.rateLimitState.windowStart = now;
    }

    // Reset burst window if needed
    if (now - this.rateLimitState.burstWindowStart >= burstWindowDuration) {
      this.rateLimitState.burstRequests = 0;
      this.rateLimitState.burstWindowStart = now;
    }

    // Check rate limits
    if (this.rateLimitState.requests >= this.config.rateLimit.requestsPerSecond) {
      const waitTime = windowDuration - (now - this.rateLimitState.windowStart);
      this.logger.warn(`Rate limit exceeded, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.checkRateLimit();
    }

    if (this.rateLimitState.burstRequests >= this.config.rateLimit.burstLimit) {
      const waitTime = burstWindowDuration - (now - this.rateLimitState.burstWindowStart);
      this.logger.warn(`Burst limit exceeded, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.checkRateLimit();
    }

    // Increment counters
    this.rateLimitState.requests++;
    this.rateLimitState.burstRequests++;
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.config.retryConfig.maxRetries; attempt++) {
      try {
        await this.checkRateLimit();
        
        const startTime = Date.now();
        const result = await operation();
        
        // Record successful metrics
        this.metricsService.recordExternalApiCall(
          'moralis',
          operationName,
          'success',
          Date.now() - startTime,
        );
        
        return result;
      } catch (error) {
        lastError = error;
        
        // Record error metrics
        this.metricsService.recordExternalApiCall(
          'moralis',
          operationName,
          'error',
          0,
        );
        
        this.logger.warn(`Moralis ${operationName} attempt ${attempt} failed`, {
          error: error.message,
          attempt,
          maxRetries: this.config.retryConfig.maxRetries,
        });

        if (attempt === this.config.retryConfig.maxRetries) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = this.config.retryConfig.retryDelay * 
          Math.pow(this.config.retryConfig.backoffMultiplier, attempt - 1);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    this.logger.error(`Moralis ${operationName} failed after ${this.config.retryConfig.maxRetries} attempts`, {
      error: lastError.message,
    });
    
    throw lastError;
  }

  private getEvmChain(chainId?: string): EvmChain {
    const chainMap: Record<string, EvmChain> = {
      '1': EvmChain.ETHEREUM,
      'ethereum': EvmChain.ETHEREUM,
      '56': EvmChain.BSC,
      'bsc': EvmChain.BSC,
      '137': EvmChain.POLYGON,
      'polygon': EvmChain.POLYGON,
      '42161': EvmChain.ARBITRUM,
      'arbitrum': EvmChain.ARBITRUM,
      '10': EvmChain.OPTIMISM,
      'optimism': EvmChain.OPTIMISM,
      '43114': EvmChain.AVALANCHE,
      'avalanche': EvmChain.AVALANCHE,
    };

    return chainMap[chainId?.toLowerCase() || 'ethereum'] || EvmChain.ETHEREUM;
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Moralis SDK not initialized. Check API key configuration.');
    }
  }

  async getTokenMetadata(tokenAddress: string, chainId?: string): Promise<any> {
    this.ensureInitialized();
    
    const cacheKey = `moralis:token:metadata:${chainId || 'ethereum'}:${tokenAddress}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.executeWithRetry(
      () => Moralis.EvmApi.token.getTokenMetadata({
        chain: this.getEvmChain(chainId),
        addresses: [tokenAddress],
      }),
      'getTokenMetadata',
    );

    const metadata = result.toJSON();
    await this.cacheService.set(cacheKey, metadata, 3600); // Cache for 1 hour
    
    return metadata;
  }

  async getTokenPrice(tokenAddress: string, chainId?: string): Promise<any> {
    this.ensureInitialized();
    
    const cacheKey = `moralis:token:price:${chainId || 'ethereum'}:${tokenAddress}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.executeWithRetry(
      () => Moralis.EvmApi.token.getTokenPrice({
        chain: this.getEvmChain(chainId),
        address: tokenAddress,
      }),
      'getTokenPrice',
    );

    const priceData = result.toJSON();
    await this.cacheService.set(cacheKey, priceData, 300); // Cache for 5 minutes
    
    return priceData;
  }

  async getTokenHolders(tokenAddress: string, chainId?: string, limit = 100): Promise<any> {
    this.ensureInitialized();
    
    const cacheKey = `moralis:token:holders:${chainId || 'ethereum'}:${tokenAddress}:${limit}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.executeWithRetry(
      () => Moralis.EvmApi.token.getTokenOwners({
        chain: this.getEvmChain(chainId),
        tokenAddress,
        limit,
      }),
      'getTokenHolders',
    );

    const holdersData = result.toJSON();
    await this.cacheService.set(cacheKey, holdersData, 1800); // Cache for 30 minutes
    
    return holdersData;
  }

  async getTokenTransactions(tokenAddress: string, chainId?: string, limit = 100): Promise<any> {
    this.ensureInitialized();
    
    const cacheKey = `moralis:token:transactions:${chainId || 'ethereum'}:${tokenAddress}:${limit}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.executeWithRetry(
      () => Moralis.EvmApi.token.getTokenTransfers({
        chain: this.getEvmChain(chainId),
        address: tokenAddress,
        limit,
      }),
      'getTokenTransactions',
    );

    const transactionsData = result.toJSON();
    await this.cacheService.set(cacheKey, transactionsData, 600); // Cache for 10 minutes
    
    return transactionsData;
  }

  async getWalletTokens(walletAddress: string, chainId?: string): Promise<any> {
    this.ensureInitialized();
    
    const cacheKey = `moralis:wallet:tokens:${chainId || 'ethereum'}:${walletAddress}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.executeWithRetry(
      () => Moralis.EvmApi.token.getWalletTokenBalances({
        chain: this.getEvmChain(chainId),
        address: walletAddress,
      }),
      'getWalletTokens',
    );

    const tokensData = result.toJSON();
    await this.cacheService.set(cacheKey, tokensData, 300); // Cache for 5 minutes
    
    return tokensData;
  }

  async getNativeBalance(walletAddress: string, chainId?: string): Promise<any> {
    this.ensureInitialized();
    
    const cacheKey = `moralis:wallet:balance:${chainId || 'ethereum'}:${walletAddress}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.executeWithRetry(
      () => Moralis.EvmApi.balance.getNativeBalance({
        chain: this.getEvmChain(chainId),
        address: walletAddress,
      }),
      'getNativeBalance',
    );

    const balanceData = result.toJSON();
    await this.cacheService.set(cacheKey, balanceData, 300); // Cache for 5 minutes
    
    return balanceData;
  }

  async getHealthStatus(): Promise<{ status: string; initialized: boolean; apiKey: boolean }> {
    return {
      status: this.isInitialized ? 'healthy' : 'unhealthy',
      initialized: this.isInitialized,
      apiKey: !!this.config?.apiKey,
    };
  }
}
