import { Test, TestingModule } from '@nestjs/testing';
import { SentimentService } from './sentiment.service';
import { CacheService } from '../cache/cache.service';
import { MetricsService } from '../metrics/metrics.service';

describe('SentimentService', () => {
  let service: SentimentService;
  let cacheService: jest.Mocked<CacheService>;
  let metricsService: jest.Mocked<MetricsService>;

  beforeEach(async () => {
    const mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      getSentimentCache: jest.fn(),
      setSentimentCache: jest.fn(),
    };

    const mockMetricsService = {
      incrementSentimentAnalysis: jest.fn(),
      recordSentimentAnalysisDuration: jest.fn(),
      incrementApiRequests: jest.fn(),
      recordApiResponseTime: jest.fn(),
      incrementCacheHits: jest.fn(),
      incrementCacheMisses: jest.fn(),
      incrementErrors: jest.fn(),
      incrementCounter: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SentimentService,
        { provide: CacheService, useValue: mockCacheService },
        { provide: MetricsService, useValue: mockMetricsService },
      ],
    }).compile();

    service = module.get<SentimentService>(SentimentService);
    cacheService = module.get(CacheService);
    metricsService = module.get(MetricsService);

    // Initialize the service
    await service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('T3.1.5a: Text Preprocessing', () => {
    it('should preprocess text with emoji extraction', async () => {
      const text = 'Bitcoin is going to the moon! 🚀💎 HODL strong!';
      const result = await service.preprocessText(text);

      expect(result.originalText).toBe(text);
      expect(result.emojis).toContain('🚀');
      expect(result.emojis).toContain('💎');
      expect(result.slangTerms).toContain('hodl');
      expect(result.slangTerms).toContain('moon');
      expect(result.cleanedText).toContain('bitcoin');
      expect(result.language).toBe('en');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle crypto slang normalization', async () => {
      const text = 'HODL your coins, avoid FUD and FOMO';
      const result = await service.preprocessText(text);

      expect(result.slangTerms).toContain('hodl');
      expect(result.slangTerms).toContain('fud');
      expect(result.slangTerms).toContain('fomo');
      expect(result.normalizedText).toContain('hold');
      expect(result.normalizedText).toContain('fear uncertainty doubt');
      expect(result.normalizedText).toContain('fear of missing out');
    });

    it('should clean text properly', async () => {
      const text = 'Check this out: https://example.com @user #bitcoin';
      const result = await service.preprocessText(text);

      expect(result.cleanedText).not.toContain('https://');
      expect(result.cleanedText).not.toContain('@');
      expect(result.cleanedText).not.toContain('#');
      expect(result.cleanedText).toContain('user');
      expect(result.cleanedText).toContain('bitcoin');
    });

    it('should handle empty or short text', async () => {
      const text = '';
      const result = await service.preprocessText(text);

      expect(result.originalText).toBe('');
      expect(result.cleanedText).toBe('');
      expect(result.emojis).toHaveLength(0);
      expect(result.slangTerms).toHaveLength(0);
    });
  });

  describe('T3.1.5b: Sentiment Analysis', () => {
    it('should analyze positive sentiment correctly', async () => {
      const text = 'Bitcoin is amazing! Great investment! 🚀';
      const result = await service.analyzeSentiment(text, 'test');

      expect(result.sentiment).toBe('positive');
      expect(result.score).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.breakdown.vader).toBeDefined();
      expect(result.breakdown.fallback).toBeDefined();
      expect(result.breakdown.compromise).toBeDefined();
      expect(result.breakdown.emoji).toBeDefined();
    });

    it('should analyze negative sentiment correctly', async () => {
      const text = 'This crypto crash is terrible! Getting rekt 😭';
      const result = await service.analyzeSentiment(text, 'test');

      expect(result.sentiment).toBe('negative');
      expect(result.score).toBeLessThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.biasDetection).toBeDefined();
    });

    it('should analyze neutral sentiment correctly', async () => {
      const text = 'Blockchain technology analysis report';
      const result = await service.analyzeSentiment(text, 'test');

      expect(result.sentiment).toBe('neutral');
      expect(Math.abs(result.score)).toBeLessThan(0.1);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect and correct bias', async () => {
      const text = 'Short text 😭😭😭😭😭'; // Emoji-heavy content
      const result = await service.analyzeSentiment(text, 'twitter');

      expect(result.biasDetection.hasBias).toBe(true);
      expect(result.biasDetection.biasType).toContain('emoji');
      expect(result.biasDetection.biasType).toContain('source_social_media');
      expect(result.biasDetection.correctedScore).toBeDefined();
    });

    it('should handle multi-model analysis', async () => {
      const text = 'Ethereum looks bullish with strong fundamentals';
      const result = await service.analyzeSentiment(text, 'test');

      expect(result.breakdown.vader.compound).toBeDefined();
      expect(result.breakdown.fallback.comparative).toBeDefined();
      expect(result.breakdown.compromise.adjectives).toBeDefined();
      expect(result.breakdown.emoji.score).toBeDefined();
    });
  });

  describe('T3.1.5c: Aggregation and Weighting', () => {
    beforeEach(() => {
      // Mock cache misses to test aggregation logic
      cacheService.get.mockResolvedValue(null);
    });

    it('should aggregate symbol sentiment from multiple sources', async () => {
      const result = await service.getSymbolSentiment('BTC');

      expect(result.symbol).toBe('BTC');
      expect(result.overallSentiment).toBeDefined();
      expect(result.weightedSentiment).toBeDefined();
      expect(result.sources.twitter).toBeDefined();
      expect(result.sources.reddit).toBeDefined();
      expect(result.sources.news).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.timeDecayFactor).toBeGreaterThan(0);
      expect(result.outliers).toBeDefined();
    });

    it('should apply time decay factors', async () => {
      const result = await service.getSymbolSentiment('ETH');

      expect(result.timeDecayFactor).toBeGreaterThan(0);
      expect(result.timeDecayFactor).toBeLessThanOrEqual(1);
      expect(result.weightedSentiment).toBeDefined();
    });

    it('should detect outliers in sentiment data', async () => {
      const result = await service.getSymbolSentiment('ADA');

      expect(result.outliers).toBeDefined();
      expect(Array.isArray(result.outliers)).toBe(true);
    });

    it('should cache aggregated results', async () => {
      await service.getSymbolSentiment('BTC');

      expect(cacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('sentiment:aggregated:BTC'),
        expect.any(Object),
        1800
      );
    });
  });

  describe('Batch Processing', () => {
    it('should analyze multiple texts in batch', async () => {
      const texts = [
        'Bitcoin is great! 🚀',
        'Crypto crash is bad 😭',
        'Neutral blockchain analysis'
      ];

      const results = await service.analyzeBatchSentiment(texts, 'batch_test');

      expect(results).toHaveLength(3);
      expect(results[0].sentiment).toBe('positive');
      expect(results[1].sentiment).toBe('negative');
      expect(results[2].sentiment).toBe('neutral');
    });
  });

  describe('Real-time Sentiment', () => {
    beforeEach(() => {
      cacheService.get.mockResolvedValue(null);
    });

    it('should get real-time sentiment with trend analysis', async () => {
      const result = await service.getRealtimeSentiment('BTC', 3600);

      expect(result.symbol).toBe('BTC');
      expect(result.currentSentiment).toBeDefined();
      expect(result.trend).toBeDefined();
      expect(result.trendStrength).toBeDefined();
      expect(result.volatility).toBeDefined();
      expect(result.timeWindow).toBe(3600);
    });
  });

  describe('Cross-platform Analysis', () => {
    beforeEach(() => {
      cacheService.get.mockResolvedValue(null);
    });

    it('should analyze cross-platform sentiment', async () => {
      const result = await service.getCrossPlatformSentiment('ETH');

      expect(result.symbol).toBe('ETH');
      expect(result.crossPlatformScore).toBeDefined();
      expect(result.consensus).toBeDefined();
      expect(result.consensus.agreement).toBeDefined();
      expect(result.consensus.score).toBeDefined();
      expect(result.consensus.strength).toBeDefined();
    });
  });

  describe('Health Status', () => {
    it('should return health status', async () => {
      const result = await service.getHealthStatus();

      expect(result.status).toBeDefined();
      expect(result.details).toBeDefined();
      expect(result.details.initialized).toBe(true);
      expect(result.details.slangTermsLoaded).toBeGreaterThan(0);
      expect(result.details.emojiMappingsLoaded).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid input gracefully', async () => {
      const result = await service.analyzeSentiment(null as any, 'test');
      // Should not throw, should handle gracefully
      expect(result).toBeDefined();
    });

    it('should handle cache failures gracefully', async () => {
      cacheService.get.mockRejectedValue(new Error('Cache error'));
      
      const result = await service.getSymbolSentiment('BTC');
      expect(result).toBeDefined();
    });
  });

  describe('Metrics Integration', () => {
    it('should record metrics for sentiment analysis', async () => {
      await service.analyzeSentiment('Test text', 'test');

      expect(metricsService.incrementSentimentAnalysis).toHaveBeenCalledWith(
        'test',
        'text',
        'success'
      );
      expect(metricsService.recordSentimentAnalysisDuration).toHaveBeenCalled();
    });

    it('should record metrics for symbol sentiment', async () => {
      cacheService.get.mockResolvedValue(null);
      
      await service.getSymbolSentiment('BTC');

      expect(metricsService.incrementApiRequests).toHaveBeenCalledWith(
        'sentiment',
        'aggregated',
        'success'
      );
      expect(metricsService.recordApiResponseTime).toHaveBeenCalled();
    });
  });
});
