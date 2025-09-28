import { Injectable, OnModuleInit } from '@nestjs/common';
import { register, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly sentimentAnalysisCounter: Counter<string>;
  private readonly sentimentAnalysisHistogram: Histogram<string>;
  private readonly socialMediaPostsCounter: Counter<string>;
  private readonly newsArticlesCounter: Counter<string>;
  private readonly apiRequestsCounter: Counter<string>;
  private readonly apiResponseTimeHistogram: Histogram<string>;
  private readonly cacheHitsCounter: Counter<string>;
  private readonly cacheMissesCounter: Counter<string>;
  private readonly errorCounter: Counter<string>;
  private readonly activeConnectionsGauge: Gauge<string>;
  private readonly sentimentScoreGauge: Gauge<string>;

  constructor() {
    // Sentiment analysis metrics
    this.sentimentAnalysisCounter = new Counter({
      name: 'sentiment_analysis_requests_total',
      help: 'Total number of sentiment analysis requests',
      labelNames: ['source', 'type', 'status'],
    });

    this.sentimentAnalysisHistogram = new Histogram({
      name: 'sentiment_analysis_duration_seconds',
      help: 'Duration of sentiment analysis requests in seconds',
      labelNames: ['source', 'type'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
    });

    // Social media metrics
    this.socialMediaPostsCounter = new Counter({
      name: 'social_media_posts_processed_total',
      help: 'Total number of social media posts processed',
      labelNames: ['platform', 'type'],
    });

    // News metrics
    this.newsArticlesCounter = new Counter({
      name: 'news_articles_processed_total',
      help: 'Total number of news articles processed',
      labelNames: ['source', 'category'],
    });

    // API metrics
    this.apiRequestsCounter = new Counter({
      name: 'external_api_requests_total',
      help: 'Total number of external API requests',
      labelNames: ['api', 'endpoint', 'status'],
    });

    this.apiResponseTimeHistogram = new Histogram({
      name: 'external_api_response_time_seconds',
      help: 'Response time of external API requests in seconds',
      labelNames: ['api', 'endpoint'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
    });

    // Cache metrics
    this.cacheHitsCounter = new Counter({
      name: 'cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['cache_type'],
    });

    this.cacheMissesCounter = new Counter({
      name: 'cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['cache_type'],
    });

    // Error metrics
    this.errorCounter = new Counter({
      name: 'errors_total',
      help: 'Total number of errors',
      labelNames: ['type', 'source'],
    });

    // Gauge metrics
    this.activeConnectionsGauge = new Gauge({
      name: 'active_connections',
      help: 'Number of active connections',
      labelNames: ['type'],
    });

    this.sentimentScoreGauge = new Gauge({
      name: 'sentiment_score_current',
      help: 'Current sentiment score',
      labelNames: ['symbol', 'source'],
    });
  }

  onModuleInit() {
    // Collect default metrics (CPU, memory, etc.)
    collectDefaultMetrics({ register });
  }

  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  async getCustomMetrics() {
    const metrics = await register.getMetricsAsJSON();
    return {
      timestamp: new Date().toISOString(),
      metrics: metrics.filter(metric => 
        metric.name.startsWith('sentiment_') || 
        metric.name.startsWith('social_media_') ||
        metric.name.startsWith('news_') ||
        metric.name.startsWith('external_api_')
      ),
    };
  }

  // Sentiment analysis metrics
  incrementSentimentAnalysis(source: string, type: string, status: string = 'success') {
    this.sentimentAnalysisCounter.inc({ source, type, status });
  }

  recordSentimentAnalysisDuration(source: string, type: string, duration: number) {
    this.sentimentAnalysisHistogram.observe({ source, type }, duration);
  }

  // Social media metrics
  incrementSocialMediaPosts(platform: string, type: string) {
    this.socialMediaPostsCounter.inc({ platform, type });
  }

  // News metrics
  incrementNewsArticles(source: string, category: string) {
    this.newsArticlesCounter.inc({ source, category });
  }

  // API metrics
  incrementApiRequests(api: string, endpoint: string, status: string) {
    this.apiRequestsCounter.inc({ api, endpoint, status });
  }

  recordApiResponseTime(api: string, endpoint: string, duration: number) {
    this.apiResponseTimeHistogram.observe({ api, endpoint }, duration);
  }

  // Cache metrics
  incrementCacheHits(cacheType: string) {
    this.cacheHitsCounter.inc({ cache_type: cacheType });
  }

  incrementCacheMisses(cacheType: string) {
    this.cacheMissesCounter.inc({ cache_type: cacheType });
  }

  // Error metrics
  incrementErrors(type: string, source: string) {
    this.errorCounter.inc({ type, source });
  }

  // Gauge metrics
  setActiveConnections(type: string, count: number) {
    this.activeConnectionsGauge.set({ type }, count);
  }

  setSentimentScore(symbol: string, source: string, score: number) {
    this.sentimentScoreGauge.set({ symbol, source }, score);
  }

  // Generic counter increment
  incrementCounter(name: string, labels: Record<string, string> = {}) {
    // Use the error counter as a generic counter for now
    this.errorCounter.inc({ type: name, source: 'system', ...labels });
  }
}
