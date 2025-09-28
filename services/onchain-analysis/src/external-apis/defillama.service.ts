/**
 * T2.1.3a: DeFiLlama Protocol Data Client
 * TVL data fetching, protocol information, historical data retrieval
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../cache/cache.service';
import { MetricsService } from '../metrics/metrics.service';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';

export interface ProtocolInfo {
  id: string;
  name: string;
  address?: string;
  symbol?: string;
  url?: string;
  description?: string;
  chain: string;
  logo?: string;
  audits?: number;
  audit_note?: string;
  gecko_id?: string;
  cmcId?: string;
  category: string;
  chains: string[];
  module: string;
  twitter?: string;
  forkedFrom?: string[];
  oracles?: string[];
  listedAt?: number;
  methodology?: string;
  slug: string;
  tvl: number;
  chainTvls: Record<string, number>;
  change_1h?: number;
  change_1d?: number;
  change_7d?: number;
  tokenBreakdowns?: Record<string, number>;
  mcap?: number;
}

export interface ProtocolTVLData {
  date: string;
  totalLiquidityUSD: number;
  [chain: string]: number | string;
}

export interface ChainTVL {
  gecko_id?: string;
  tvl: number;
  tokenSymbol?: string;
  cmcId?: string;
  name: string;
  chainId?: number;
}

export interface DeFiLlamaConfig {
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  rateLimit: number;
}

@Injectable()
export class DeFiLlamaService implements OnModuleInit {
  private readonly logger = new Logger(DeFiLlamaService.name);
  private readonly config: DeFiLlamaConfig;
  private requestCount = 0;
  private lastRequestTime = 0;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly metricsService: MetricsService,
  ) {
    this.config = {
      baseUrl: this.configService.get<string>('DEFILLAMA_API_URL', 'https://api.llama.fi'),
      timeout: this.configService.get<number>('DEFILLAMA_TIMEOUT', 30000),
      maxRetries: this.configService.get<number>('DEFILLAMA_MAX_RETRIES', 3),
      retryDelay: this.configService.get<number>('DEFILLAMA_RETRY_DELAY', 1000),
      rateLimit: this.configService.get<number>('DEFILLAMA_RATE_LIMIT', 10), // 10 requests per second
    };
  }

  async onModuleInit() {
    this.logger.log('DeFiLlama service initialized', {
      baseUrl: this.config.baseUrl,
      timeout: this.config.timeout,
      rateLimit: this.config.rateLimit,
    });
  }

  /**
   * Get all protocols with basic information
   */
  async getAllProtocols(): Promise<ProtocolInfo[]> {
    const cacheKey = 'defillama:protocols:all';
    const cached = await this.cacheService.get<ProtocolInfo[]>(cacheKey);
    
    if (cached) {
      this.logger.log('Cache hit for all protocols');
      this.metricsService.incrementCacheHits('defillama_protocols');
      return cached;
    }

    try {
      const response = await this.makeRequest<ProtocolInfo[]>('/protocols');
      
      // Cache for 1 hour
      await this.cacheService.set(cacheKey, response, 3600);
      
      this.logger.log(`Fetched ${response.length} protocols from DeFiLlama`);
      return response;
    } catch (error) {
      this.logger.error('Failed to fetch all protocols', { error: error.message });
      throw error;
    }
  }

  /**
   * Get specific protocol information by slug
   */
  async getProtocol(slug: string): Promise<ProtocolInfo> {
    const cacheKey = `defillama:protocol:${slug}`;
    const cached = await this.cacheService.get<ProtocolInfo>(cacheKey);
    
    if (cached) {
      this.logger.log(`Cache hit for protocol ${slug}`);
      this.metricsService.incrementCacheHits('defillama_protocol');
      return cached;
    }

    try {
      const response = await this.makeRequest<ProtocolInfo>(`/protocol/${slug}`);
      
      // Cache for 30 minutes
      await this.cacheService.set(cacheKey, response, 1800);
      
      this.logger.log(`Fetched protocol data for ${slug}`, {
        name: response.name,
        tvl: response.tvl,
        chains: response.chains?.length || 0,
      });
      
      return response;
    } catch (error) {
      this.logger.error(`Failed to fetch protocol ${slug}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Get TVL data for all chains
   */
  async getChainTVL(): Promise<ChainTVL[]> {
    const cacheKey = 'defillama:chains:tvl';
    const cached = await this.cacheService.get<ChainTVL[]>(cacheKey);
    
    if (cached) {
      this.logger.log('Cache hit for chain TVL data');
      this.metricsService.incrementCacheHits('defillama_chains');
      return cached;
    }

    try {
      const response = await this.makeRequest<ChainTVL[]>('/chains');
      
      // Cache for 15 minutes
      await this.cacheService.set(cacheKey, response, 900);
      
      this.logger.log(`Fetched TVL data for ${response.length} chains`);
      return response;
    } catch (error) {
      this.logger.error('Failed to fetch chain TVL data', { error: error.message });
      throw error;
    }
  }

  /**
   * Get historical TVL data for a specific protocol
   */
  async getProtocolTVLHistory(slug: string): Promise<ProtocolTVLData[]> {
    const cacheKey = `defillama:protocol:${slug}:tvl-history`;
    const cached = await this.cacheService.get<ProtocolTVLData[]>(cacheKey);
    
    if (cached) {
      this.logger.log(`Cache hit for protocol ${slug} TVL history`);
      this.metricsService.incrementCacheHits('defillama_tvl_history');
      return cached;
    }

    try {
      const response = await this.makeRequest<{ tvl: Array<{ date: number; totalLiquidityUSD: number }> }>(`/protocol/${slug}`);
      
      const tvlHistory: ProtocolTVLData[] = response.tvl?.map(item => ({
        date: new Date(item.date * 1000).toISOString(),
        totalLiquidityUSD: item.totalLiquidityUSD,
      })) || [];
      
      // Cache for 1 hour
      await this.cacheService.set(cacheKey, tvlHistory, 3600);
      
      this.logger.log(`Fetched TVL history for ${slug}`, {
        dataPoints: tvlHistory.length,
        latestTVL: tvlHistory[tvlHistory.length - 1]?.totalLiquidityUSD || 0,
      });
      
      return tvlHistory;
    } catch (error) {
      this.logger.error(`Failed to fetch TVL history for ${slug}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Get current TVL for a specific chain
   */
  async getChainCurrentTVL(chain: string): Promise<number> {
    const cacheKey = `defillama:chain:${chain}:current-tvl`;
    const cached = await this.cacheService.get<number>(cacheKey);
    
    if (cached !== null && cached !== undefined) {
      this.logger.log(`Cache hit for ${chain} current TVL`);
      this.metricsService.incrementCacheHits('defillama_chain_tvl');
      return cached;
    }

    try {
      const response = await this.makeRequest<{ tvl: number }>(`/tvl/${chain}`);
      const tvl = response.tvl || 0;
      
      // Cache for 10 minutes
      await this.cacheService.set(cacheKey, tvl, 600);
      
      this.logger.log(`Fetched current TVL for ${chain}`, { tvl });
      return tvl;
    } catch (error) {
      this.logger.error(`Failed to fetch current TVL for ${chain}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Search protocols by name or category
   */
  async searchProtocols(query: string, category?: string): Promise<ProtocolInfo[]> {
    const allProtocols = await this.getAllProtocols();
    
    const filtered = allProtocols.filter(protocol => {
      const matchesQuery = !query || 
        protocol.name.toLowerCase().includes(query.toLowerCase()) ||
        protocol.symbol?.toLowerCase().includes(query.toLowerCase()) ||
        protocol.description?.toLowerCase().includes(query.toLowerCase());
      
      const matchesCategory = !category || 
        protocol.category?.toLowerCase() === category.toLowerCase();
      
      return matchesQuery && matchesCategory;
    });

    this.logger.log(`Search results for "${query}"`, {
      query,
      category,
      totalResults: filtered.length,
    });

    return filtered;
  }

  /**
   * Get protocols by chain
   */
  async getProtocolsByChain(chain: string): Promise<ProtocolInfo[]> {
    const cacheKey = `defillama:protocols:chain:${chain}`;
    const cached = await this.cacheService.get<ProtocolInfo[]>(cacheKey);
    
    if (cached) {
      this.logger.log(`Cache hit for ${chain} protocols`);
      this.metricsService.incrementCacheHits('defillama_chain_protocols');
      return cached;
    }

    const allProtocols = await this.getAllProtocols();
    const chainProtocols = allProtocols.filter(protocol => 
      protocol.chains?.includes(chain) || protocol.chain === chain
    );

    // Cache for 30 minutes
    await this.cacheService.set(cacheKey, chainProtocols, 1800);

    this.logger.log(`Found ${chainProtocols.length} protocols on ${chain}`);
    return chainProtocols;
  }

  /**
   * Make HTTP request with rate limiting and retry logic
   */
  private async makeRequest<T>(endpoint: string, retryCount = 0): Promise<T> {
    await this.enforceRateLimit();

    const startTime = Date.now();
    const url = `${this.config.baseUrl}${endpoint}`;

    try {
      this.logger.debug(`Making request to ${url}`);
      
      const response: AxiosResponse<T> = await firstValueFrom(
        this.httpService.get(url, {
          timeout: this.config.timeout,
          headers: {
            'User-Agent': 'ChainLens-OnChain-Analysis/1.0.0',
            'Accept': 'application/json',
          },
        })
      );

      const duration = Date.now() - startTime;
      this.metricsService.recordExternalApiCall('defillama', endpoint, 'success', duration);

      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metricsService.recordExternalApiCall('defillama', endpoint, 'error', duration);

      if (retryCount < this.config.maxRetries) {
        const delay = this.config.retryDelay * Math.pow(2, retryCount);
        this.logger.warn(`Request failed, retrying in ${delay}ms`, {
          url,
          attempt: retryCount + 1,
          maxRetries: this.config.maxRetries,
          error: error.message,
        });

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequest<T>(endpoint, retryCount + 1);
      }

      this.logger.error(`Request failed after ${this.config.maxRetries} retries`, {
        url,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Enforce rate limiting
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < 1000) {
      this.requestCount++;
      if (this.requestCount >= this.config.rateLimit) {
        const waitTime = 1000 - timeSinceLastRequest;
        this.logger.debug(`Rate limit reached, waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.requestCount = 0;
      }
    } else {
      this.requestCount = 1;
    }

    this.lastRequestTime = Date.now();
  }
}
