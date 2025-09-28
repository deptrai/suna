import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class SentimentService {
  private readonly logger = new Logger(SentimentService.name);

  constructor(
    private cacheService: CacheService,
    private metricsService: MetricsService,
  ) {}

  async analyzeSentiment(text: string, source: string = 'manual'): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Placeholder sentiment analysis
      const score = Math.random() * 2 - 1; // Random score between -1 and 1
      
      const result = {
        text,
        source,
        score,
        sentiment: this.categorizeSentiment(score),
        confidence: Math.random() * 0.5 + 0.5, // Random confidence between 0.5 and 1
        timestamp: new Date().toISOString(),
      };

      // Record metrics
      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementSentimentAnalysis(source, 'text', 'success');
      this.metricsService.recordSentimentAnalysisDuration(source, 'text', duration);

      return result;
    } catch (error) {
      this.logger.error('Error analyzing sentiment:', error);
      this.metricsService.incrementSentimentAnalysis(source, 'text', 'error');
      this.metricsService.incrementErrors('sentiment_analysis', source);
      throw error;
    }
  }

  async getSymbolSentiment(symbol: string): Promise<any> {
    try {
      // Check cache first
      const cached = await this.cacheService.getSentimentCache(symbol, 'aggregated');
      if (cached) {
        this.metricsService.incrementCacheHits('sentiment');
        return cached;
      }

      this.metricsService.incrementCacheMisses('sentiment');

      // Placeholder aggregated sentiment
      const result = {
        symbol,
        overallSentiment: Math.random() * 2 - 1,
        sources: {
          twitter: Math.random() * 2 - 1,
          reddit: Math.random() * 2 - 1,
          news: Math.random() * 2 - 1,
        },
        confidence: Math.random() * 0.5 + 0.5,
        lastUpdated: new Date().toISOString(),
      };

      // Cache the result
      await this.cacheService.setSentimentCache(symbol, 'aggregated', result, 1800);

      return result;
    } catch (error) {
      this.logger.error(`Error getting sentiment for symbol ${symbol}:`, error);
      this.metricsService.incrementErrors('symbol_sentiment', 'cache');
      throw error;
    }
  }

  private categorizeSentiment(score: number): string {
    if (score > 0.1) return 'positive';
    if (score < -0.1) return 'negative';
    return 'neutral';
  }
}
