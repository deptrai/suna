import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { MetricsService } from '../metrics/metrics.service';
import * as vader from 'vader-sentiment';
import * as sentiment from 'sentiment';
import * as natural from 'natural';

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
      // Preprocess text
      const cleanedText = this.preprocessText(text);

      // VADER sentiment analysis
      const vaderResult = vader.SentimentIntensityAnalyzer.polarity_scores(cleanedText);

      // Fallback sentiment analysis
      const sentimentAnalyzer = new sentiment();
      const fallbackResult = sentimentAnalyzer.analyze(cleanedText);

      // Combine results with VADER as primary
      const score = vaderResult.compound; // VADER compound score (-1 to 1)
      const confidence = Math.abs(vaderResult.compound) * 0.8 + 0.2; // Convert to confidence

      const result = {
        text: cleanedText,
        originalText: text,
        source,
        score,
        sentiment: this.categorizeSentiment(score),
        confidence: Math.min(confidence, 1.0),
        breakdown: {
          vader: {
            positive: vaderResult.pos,
            negative: vaderResult.neg,
            neutral: vaderResult.neu,
            compound: vaderResult.compound,
          },
          fallback: {
            score: fallbackResult.score,
            comparative: fallbackResult.comparative,
            tokens: fallbackResult.tokens.length,
          },
        },
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

  private preprocessText(text: string): string {
    // Clean and normalize text for sentiment analysis
    return text
      .toLowerCase()
      .replace(/[^\w\s!?.,]/g, '') // Remove special chars except punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  private categorizeSentiment(score: number): string {
    if (score > 0.05) return 'positive';
    if (score < -0.05) return 'negative';
    return 'neutral';
  }
}
