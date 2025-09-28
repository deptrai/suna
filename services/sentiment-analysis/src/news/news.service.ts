import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);

  constructor(
    private cacheService: CacheService,
    private metricsService: MetricsService,
  ) {}

  async analyzeNewsSentiment(query: string, sources: string[] = ['all']): Promise<any> {
    try {
      // Check cache first
      const cacheKey = `${query}:${sources.join(',')}`;
      const cached = await this.cacheService.getNewsCache('aggregated', cacheKey);
      if (cached) {
        this.metricsService.incrementCacheHits('news');
        return cached;
      }

      this.metricsService.incrementCacheMisses('news');

      // Placeholder news analysis
      const result = {
        query,
        sources,
        sentiment: {
          overall: Math.random() * 2 - 1,
          bySource: {
            coindesk: Math.random() * 2 - 1,
            cointelegraph: Math.random() * 2 - 1,
            cryptonews: Math.random() * 2 - 1,
          },
        },
        articles: [
          {
            title: `${query} shows strong momentum`,
            source: 'CoinDesk',
            sentiment: Math.random() * 2 - 1,
            url: 'https://example.com/article1',
          },
          {
            title: `Market analysis: ${query} outlook`,
            source: 'CoinTelegraph',
            sentiment: Math.random() * 2 - 1,
            url: 'https://example.com/article2',
          },
        ],
        lastUpdated: new Date().toISOString(),
      };

      // Cache the result
      await this.cacheService.setNewsCache('aggregated', cacheKey, result, 3600);
      this.metricsService.incrementNewsArticles('aggregated', 'analysis');

      return result;
    } catch (error) {
      this.logger.error(`Error analyzing news sentiment for query ${query}:`, error);
      this.metricsService.incrementErrors('news', 'analysis');
      throw error;
    }
  }

  async getTrendingNewsSentiment(): Promise<any> {
    try {
      // Check cache first
      const cached = await this.cacheService.getNewsCache('trending', 'crypto');
      if (cached) {
        this.metricsService.incrementCacheHits('news');
        return cached;
      }

      this.metricsService.incrementCacheMisses('news');

      // Placeholder trending news
      const result = {
        trending: [
          { symbol: 'BTC', sentiment: Math.random() * 2 - 1, volume: Math.floor(Math.random() * 100) },
          { symbol: 'ETH', sentiment: Math.random() * 2 - 1, volume: Math.floor(Math.random() * 80) },
          { symbol: 'ADA', sentiment: Math.random() * 2 - 1, volume: Math.floor(Math.random() * 60) },
        ],
        overallMarketSentiment: Math.random() * 2 - 1,
        lastUpdated: new Date().toISOString(),
      };

      // Cache the result
      await this.cacheService.setNewsCache('trending', 'crypto', result, 1800);
      this.metricsService.incrementNewsArticles('trending', 'crypto');

      return result;
    } catch (error) {
      this.logger.error('Error getting trending news sentiment:', error);
      this.metricsService.incrementErrors('news', 'trending');
      throw error;
    }
  }
}
