import { Test, TestingModule } from '@nestjs/testing';
import { TwitterService } from './twitter.service';
import { RedditService } from './reddit.service';
import { NewsApiService } from './news-api.service';
import { CacheService } from '../cache/cache.service';
import { MetricsService } from '../metrics/metrics.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

describe('External APIs', () => {
  let twitterService: TwitterService;
  let redditService: RedditService;
  let newsApiService: NewsApiService;
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
      incrementApiRequests: jest.fn(),
      recordApiResponseTime: jest.fn(),
      incrementCacheHits: jest.fn(),
      incrementCacheMisses: jest.fn(),
      incrementErrors: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        const config = {
          'TWITTER_BEARER_TOKEN': 'mock_token',
          'REDDIT_CLIENT_ID': 'mock_client_id',
          'REDDIT_CLIENT_SECRET': 'mock_client_secret',
          'REDDIT_USERNAME': 'mock_username',
          'REDDIT_PASSWORD': 'mock_password',
          'NEWS_API_KEY': 'mock_news_api_key',
        };
        return config[key];
      }),
    };

    const mockHttpService = {
      get: jest.fn(),
      post: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwitterService,
        RedditService,
        NewsApiService,
        { provide: CacheService, useValue: mockCacheService },
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    twitterService = module.get<TwitterService>(TwitterService);
    redditService = module.get<RedditService>(RedditService);
    newsApiService = module.get<NewsApiService>(NewsApiService);
    cacheService = module.get(CacheService);
    metricsService = module.get(MetricsService);
  });

  describe('TwitterService', () => {
    it('should be defined', () => {
      expect(twitterService).toBeDefined();
    });

    it('should search tweets by keywords', async () => {
      const mockTweets = [
        {
          id: '1',
          text: 'Bitcoin is going to the moon! 🚀',
          author_id: 'user1',
          created_at: new Date().toISOString(),
          public_metrics: { like_count: 10, retweet_count: 5 }
        }
      ];

      cacheService.get.mockResolvedValue(null);
      jest.spyOn(twitterService as any, 'searchTweets').mockResolvedValue(mockTweets);

      const result = await twitterService.searchTweetsByKeywords(['bitcoin', 'crypto']);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should filter spam content', async () => {
      const spamTweet = 'BUYYY NOWWWW!!!! 🚀🚀🚀🚀🚀 https://scam.com https://fake.com';
      const legitimateTweet = 'Bitcoin analysis shows positive trends';

      const isSpam1 = await (twitterService as any).isSpamTweet(spamTweet);
      const isSpam2 = await (twitterService as any).isSpamTweet(legitimateTweet);

      expect(isSpam1).toBe(true);
      expect(isSpam2).toBe(false);
    });

    it('should check relevance to crypto', async () => {
      const relevantTweet = 'Bitcoin price analysis and Ethereum trends';
      const irrelevantTweet = 'What I had for lunch today';

      const isRelevant1 = await (twitterService as any).isRelevantContent(relevantTweet);
      const isRelevant2 = await (twitterService as any).isRelevantContent(irrelevantTweet);

      expect(isRelevant1).toBe(true);
      expect(isRelevant2).toBe(false);
    });

    it('should handle rate limiting', async () => {
      const rateLimitInfo = await twitterService.getRateLimitInfo();

      expect(rateLimitInfo).toBeDefined();
      expect(rateLimitInfo.remaining).toBeDefined();
      expect(rateLimitInfo.resetTime).toBeDefined();
    });
  });

  describe('RedditService', () => {
    it('should be defined', () => {
      expect(redditService).toBeDefined();
    });

    it('should get subreddit posts', async () => {
      cacheService.get.mockResolvedValue(null);
      
      const mockPosts = [
        {
          id: 'post1',
          title: 'Bitcoin Discussion',
          selftext: 'What do you think about Bitcoin?',
          score: 100,
          num_comments: 50,
          created_utc: Date.now() / 1000,
          subreddit: 'Bitcoin'
        }
      ];

      jest.spyOn(redditService as any, 'fetchSubredditPosts').mockResolvedValue(mockPosts);

      const result = await redditService.getSubredditPosts('Bitcoin', 'hot', 10);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should analyze user engagement', async () => {
      const mockEngagement = {
        totalPosts: 100,
        totalComments: 500,
        averageScore: 25.5,
        topContributors: ['user1', 'user2'],
        engagementRate: 0.75
      };

      jest.spyOn(redditService as any, 'calculateEngagement').mockResolvedValue(mockEngagement);

      const result = await redditService.analyzeUserEngagement('Bitcoin');

      expect(result).toBeDefined();
      expect(result.totalPosts).toBeDefined();
      expect(result.engagementRate).toBeDefined();
    });

    it('should get trending topics', async () => {
      cacheService.get.mockResolvedValue(null);

      const mockTrends = [
        { topic: 'Bitcoin', mentions: 150, sentiment: 0.6 },
        { topic: 'Ethereum', mentions: 120, sentiment: 0.4 },
        { topic: 'DeFi', mentions: 80, sentiment: 0.3 }
      ];

      jest.spyOn(redditService as any, 'extractTrends').mockResolvedValue(mockTrends);

      const result = await redditService.getTrendingTopics(['Bitcoin', 'Ethereum']);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('NewsApiService', () => {
    it('should be defined', () => {
      expect(newsApiService).toBeDefined();
    });

    it('should search crypto news', async () => {
      cacheService.get.mockResolvedValue(null);

      const mockNews = [
        {
          title: 'Bitcoin Reaches New Heights',
          description: 'Bitcoin price analysis shows positive trends',
          url: 'https://example.com/news1',
          publishedAt: new Date().toISOString(),
          source: { name: 'CryptoNews' }
        }
      ];

      jest.spyOn(newsApiService as any, 'fetchFromNewsAPI').mockResolvedValue(mockNews);

      const result = await newsApiService.searchNews('bitcoin', 'en', 10);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should analyze headline sentiment', async () => {
      const positiveHeadline = 'Bitcoin Soars to New All-Time High';
      const negativeHeadline = 'Crypto Market Crashes Amid Regulatory Concerns';
      const neutralHeadline = 'Blockchain Technology Report Released';

      const sentiment1 = await newsApiService.analyzeHeadlineSentiment(positiveHeadline);
      const sentiment2 = await newsApiService.analyzeHeadlineSentiment(negativeHeadline);
      const sentiment3 = await newsApiService.analyzeHeadlineSentiment(neutralHeadline);

      expect(sentiment1.score).toBeGreaterThan(0);
      expect(sentiment2.score).toBeLessThan(0);
      expect(Math.abs(sentiment3.score)).toBeLessThan(0.1);
    });

    it('should extract article content', async () => {
      const mockContent = {
        title: 'Test Article',
        content: 'This is the article content',
        author: 'Test Author',
        publishDate: new Date().toISOString()
      };

      jest.spyOn(newsApiService as any, 'scrapeContent').mockResolvedValue(mockContent);

      const result = await newsApiService.extractArticleContent('https://example.com/article');

      expect(result).toBeDefined();
      expect(result.title).toBeDefined();
      expect(result.content).toBeDefined();
    });

    it('should get RSS feeds', async () => {
      cacheService.get.mockResolvedValue(null);

      const mockRSSItems = [
        {
          title: 'RSS Article 1',
          link: 'https://example.com/rss1',
          description: 'RSS article description',
          pubDate: new Date().toISOString()
        }
      ];

      jest.spyOn(newsApiService as any, 'parseRSSFeed').mockResolvedValue(mockRSSItems);

      const result = await newsApiService.getRSSFeeds(['https://example.com/rss']);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should calculate source credibility', async () => {
      const credibleSource = 'CoinDesk';
      const unknownSource = 'RandomBlog';

      const credibility1 = await (newsApiService as any).calculateSourceCredibility(credibleSource);
      const credibility2 = await (newsApiService as any).calculateSourceCredibility(unknownSource);

      expect(credibility1).toBeGreaterThan(credibility2);
      expect(credibility1).toBeGreaterThan(0.5);
    });
  });

  describe('Error Handling', () => {
    it('should handle API failures gracefully', async () => {
      cacheService.get.mockRejectedValue(new Error('Cache error'));

      const result = await twitterService.searchTweetsByKeywords(['bitcoin']);
      expect(result).toBeDefined(); // Should not throw
    });

    it('should handle rate limiting', async () => {
      jest.spyOn(twitterService as any, 'checkRateLimit').mockResolvedValue(false);

      const result = await twitterService.searchTweetsByKeywords(['bitcoin']);
      expect(result).toBeDefined();
    });

    it('should handle network timeouts', async () => {
      jest.spyOn(redditService as any, 'fetchSubredditPosts')
        .mockRejectedValue(new Error('Network timeout'));

      const result = await redditService.getSubredditPosts('Bitcoin');
      expect(result).toBeDefined(); // Should handle gracefully
    });
  });

  describe('Caching', () => {
    it('should cache Twitter results', async () => {
      await twitterService.searchTweetsByKeywords(['bitcoin']);

      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should cache Reddit results', async () => {
      await redditService.getSubredditPosts('Bitcoin');

      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should cache News results', async () => {
      await newsApiService.searchNews('bitcoin');

      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should return cached results when available', async () => {
      const cachedData = [{ id: 'cached', text: 'cached tweet' }];
      cacheService.get.mockResolvedValue(cachedData);

      const result = await twitterService.searchTweetsByKeywords(['bitcoin']);

      expect(result).toEqual(cachedData);
      expect(metricsService.incrementCacheHits).toHaveBeenCalled();
    });
  });

  describe('Metrics', () => {
    it('should record API request metrics', async () => {
      await twitterService.searchTweetsByKeywords(['bitcoin']);

      expect(metricsService.incrementApiRequests).toHaveBeenCalled();
      expect(metricsService.recordApiResponseTime).toHaveBeenCalled();
    });

    it('should record error metrics on failures', async () => {
      jest.spyOn(twitterService as any, 'searchTweets')
        .mockRejectedValue(new Error('API error'));

      await twitterService.searchTweetsByKeywords(['bitcoin']);

      expect(metricsService.incrementErrors).toHaveBeenCalled();
    });
  });
});
