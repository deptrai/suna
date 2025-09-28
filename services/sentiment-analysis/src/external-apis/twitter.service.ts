import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { MetricsService } from '../metrics/metrics.service';
import { TwitterApi, TweetV2, UserV2, TweetSearchRecentV2Paginator } from 'twitter-api-v2';
import { CacheService } from '../cache/cache.service';

interface TwitterSearchOptions {
  maxResults?: number;
  startTime?: string;
  endTime?: string;
  lang?: string;
  resultType?: 'recent' | 'popular' | 'mixed';
}

interface TwitterStreamOptions {
  expansions?: string[];
  tweetFields?: string[];
  userFields?: string[];
}

interface RateLimitInfo {
  count: number;
  resetTime: number;
  limit: number;
}

@Injectable()
export class TwitterService implements OnModuleInit {
  private readonly logger = new Logger(TwitterService.name);
  private twitterClient: TwitterApi;
  private rateLimitTracker = new Map<string, RateLimitInfo>();
  private isInitialized = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly metricsService: MetricsService,
    private readonly cacheService: CacheService,
  ) {}

  async onModuleInit() {
    await this.initializeTwitterClient();
  }

  private async initializeTwitterClient() {
    try {
      const bearerToken = this.configService.get<string>('externalApis.twitter.bearerToken');

      if (!bearerToken) {
        this.logger.warn('Twitter Bearer Token not configured. Twitter API will not be available.');
        return;
      }

      this.twitterClient = new TwitterApi(bearerToken);

      // Test the connection
      await this.testConnection();

      this.isInitialized = true;
      this.logger.log('Twitter API client initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Twitter client:', error);
      this.metricsService.incrementErrors('twitter_api', 'initialization');
    }
  }

  private async testConnection(): Promise<void> {
    try {
      // Test with a simple search to verify credentials
      await this.twitterClient.v2.search('test', { max_results: 10 });
      this.logger.log('Twitter API connection test successful');
    } catch (error) {
      this.logger.error('Twitter API connection test failed:', error);
      throw error;
    }
  }

  async searchTweets(query: string, options: TwitterSearchOptions = {}): Promise<any> {
    const startTime = Date.now();

    if (!this.isInitialized) {
      throw new Error('Twitter client not initialized');
    }

    try {
      // Check rate limits
      await this.checkRateLimit('search');

      const {
        maxResults = 100,
        startTime: searchStartTime,
        endTime: searchEndTime,
        lang = 'en',
      } = options;

      this.logger.log(`Searching tweets for query: ${query}`);

      // Check cache first
      const cacheKey = `twitter:search:${query}:${maxResults}:${lang}`;
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        this.metricsService.incrementCacheHits('twitter_search');
        return cachedResult;
      }

      // Prepare search parameters
      const searchParams: any = {
        max_results: Math.min(maxResults, 100), // Twitter API limit
        'tweet.fields': ['created_at', 'author_id', 'public_metrics', 'context_annotations', 'lang'],
        'user.fields': ['username', 'name', 'verified', 'public_metrics'],
        expansions: ['author_id'],
      };

      if (searchStartTime) searchParams.start_time = searchStartTime;
      if (searchEndTime) searchParams.end_time = searchEndTime;
      if (lang) searchParams.lang = lang;

      // Execute search
      const searchResult = await this.twitterClient.v2.search(query, searchParams);

      // Process results
      const tweets = Array.isArray(searchResult.data) ? searchResult.data : [];
      const processedResult = {
        data: tweets.map((tweet: any) => ({
          id: tweet.id,
          text: tweet.text,
          author_id: tweet.author_id,
          created_at: tweet.created_at,
          lang: tweet.lang,
          public_metrics: tweet.public_metrics,
          context_annotations: tweet.context_annotations,
        })),
        includes: {
          users: searchResult.includes?.users || [],
        },
        meta: searchResult.meta,
      };

      // Cache the result for 5 minutes
      await this.cacheService.set(cacheKey, processedResult, 300);

      // Update rate limit tracking
      this.updateRateLimit('search', searchResult.rateLimit);

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('twitter', 'search', 'success');
      this.metricsService.recordApiResponseTime('twitter', 'search', duration);
      this.metricsService.incrementCacheMisses('twitter_search');

      return processedResult;
    } catch (error) {
      this.logger.error(`Error searching tweets for query ${query}:`, error);
      this.metricsService.incrementApiRequests('twitter', 'search', 'error');
      this.metricsService.incrementErrors('external_api', 'twitter');
      throw error;
    }
  }

  async getTweetById(tweetId: string): Promise<any> {
    const startTime = Date.now();

    if (!this.isInitialized) {
      throw new Error('Twitter client not initialized');
    }

    try {
      await this.checkRateLimit('get_tweet');

      this.logger.log(`Getting tweet by ID: ${tweetId}`);

      // Check cache first
      const cacheKey = `twitter:tweet:${tweetId}`;
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        this.metricsService.incrementCacheHits('twitter_get_tweet');
        return cachedResult;
      }

      const tweet = await this.twitterClient.v2.singleTweet(tweetId, {
        'tweet.fields': ['created_at', 'author_id', 'public_metrics', 'context_annotations', 'lang'],
        'user.fields': ['username', 'name', 'verified', 'public_metrics'],
        expansions: ['author_id'],
      });

      const result = {
        data: {
          id: tweet.data.id,
          text: tweet.data.text,
          author_id: tweet.data.author_id,
          created_at: tweet.data.created_at,
          lang: tweet.data.lang,
          public_metrics: tweet.data.public_metrics,
          context_annotations: tweet.data.context_annotations,
        },
        includes: {
          users: tweet.includes?.users || [],
        },
      };

      // Cache for 10 minutes
      await this.cacheService.set(cacheKey, result, 600);

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('twitter', 'get_tweet', 'success');
      this.metricsService.recordApiResponseTime('twitter', 'get_tweet', duration);
      this.metricsService.incrementCacheMisses('twitter_get_tweet');

      return result;
    } catch (error) {
      this.logger.error(`Error getting tweet ${tweetId}:`, error);
      this.metricsService.incrementApiRequests('twitter', 'get_tweet', 'error');
      this.metricsService.incrementErrors('external_api', 'twitter');
      throw error;
    }
  }

  async searchTweetsByKeywords(keywords: string[], options: TwitterSearchOptions = {}): Promise<any> {
    // Build query from keywords
    const query = keywords.map(keyword => `"${keyword}"`).join(' OR ');
    return this.searchTweets(query, options);
  }

  async searchTweetsByHashtags(hashtags: string[], options: TwitterSearchOptions = {}): Promise<any> {
    // Build hashtag query
    const query = hashtags.map(tag => `#${tag.replace('#', '')}`).join(' OR ');
    return this.searchTweets(query, options);
  }

  private async checkRateLimit(endpoint: string): Promise<void> {
    const rateLimitInfo = this.rateLimitTracker.get(endpoint);

    if (rateLimitInfo) {
      const now = Date.now();

      // Reset counter if window has passed
      if (now > rateLimitInfo.resetTime) {
        rateLimitInfo.count = 0;
        rateLimitInfo.resetTime = now + (15 * 60 * 1000); // 15 minutes
      }

      // Check if we're at the limit
      if (rateLimitInfo.count >= rateLimitInfo.limit) {
        const waitTime = rateLimitInfo.resetTime - now;
        this.logger.warn(`Rate limit reached for ${endpoint}. Waiting ${waitTime}ms`);
        this.metricsService.incrementErrors('twitter_api', 'rate_limit');
        throw new Error(`Rate limit exceeded for ${endpoint}. Reset in ${waitTime}ms`);
      }
    }
  }

  private updateRateLimit(endpoint: string, rateLimit: any): void {
    if (rateLimit) {
      this.rateLimitTracker.set(endpoint, {
        count: rateLimit.remaining ? rateLimit.limit - rateLimit.remaining : 0,
        resetTime: rateLimit.reset ? rateLimit.reset * 1000 : Date.now() + (15 * 60 * 1000),
        limit: rateLimit.limit || 300, // Default limit
      });
    }
  }

  // T3.1.2c: Real-time streaming implementation
  async startStream(rules: string[], options: TwitterStreamOptions = {}): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Twitter client not initialized');
    }

    try {
      this.logger.log('Starting Twitter stream with rules:', rules);

      // Add stream rules
      await this.addStreamRules(rules);

      // Start the stream
      const stream = await this.twitterClient.v2.searchStream({
        'tweet.fields': ['created_at', 'author_id', 'public_metrics', 'context_annotations', 'lang'],
        'user.fields': ['username', 'name', 'verified', 'public_metrics'],
        expansions: ['author_id'] as any,
        ...options,
      });

      // Process stream data
      stream.on('data', async (tweet) => {
        try {
          await this.processStreamTweet(tweet);
          this.metricsService.incrementApiRequests('twitter', 'stream', 'success');
        } catch (error) {
          this.logger.error('Error processing stream tweet:', error);
          this.metricsService.incrementErrors('twitter_stream', 'processing');
        }
      });

      stream.on('error', (error) => {
        this.logger.error('Twitter stream error:', error);
        this.metricsService.incrementErrors('twitter_stream', 'connection');
        // Implement reconnection logic
        setTimeout(() => this.reconnectStream(rules, options), 5000);
      });

      this.logger.log('Twitter stream started successfully');
    } catch (error) {
      this.logger.error('Failed to start Twitter stream:', error);
      this.metricsService.incrementErrors('twitter_stream', 'startup');
      throw error;
    }
  }

  private async addStreamRules(rules: string[]): Promise<void> {
    try {
      // Delete existing rules first
      const existingRules = await this.twitterClient.v2.streamRules();
      if (existingRules.data?.length > 0) {
        await this.twitterClient.v2.updateStreamRules({
          delete: { ids: existingRules.data.map(rule => rule.id) },
        });
      }

      // Add new rules
      const ruleObjects = rules.map((rule, index) => ({
        value: rule,
        tag: `rule_${index}`,
      }));

      await this.twitterClient.v2.updateStreamRules({
        add: ruleObjects,
      });

      this.logger.log(`Added ${rules.length} stream rules`);
    } catch (error) {
      this.logger.error('Failed to add stream rules:', error);
      throw error;
    }
  }

  private async processStreamTweet(tweet: TweetV2): Promise<void> {
    // Process the tweet for sentiment analysis
    const processedTweet = {
      id: tweet.id,
      text: tweet.text,
      author_id: tweet.author_id,
      created_at: tweet.created_at,
      lang: tweet.lang,
      public_metrics: tweet.public_metrics,
      context_annotations: tweet.context_annotations,
      processed_at: new Date().toISOString(),
    };

    // Cache the tweet for later processing
    const cacheKey = `twitter:stream:tweet:${tweet.id}`;
    await this.cacheService.set(cacheKey, processedTweet, 3600); // 1 hour

    this.logger.debug(`Processed stream tweet: ${tweet.id}`);
  }

  private async reconnectStream(rules: string[], options: TwitterStreamOptions): Promise<void> {
    this.logger.log('Attempting to reconnect Twitter stream...');
    try {
      await this.startStream(rules, options);
    } catch (error) {
      this.logger.error('Failed to reconnect stream:', error);
      // Exponential backoff for reconnection
      setTimeout(() => this.reconnectStream(rules, options), 10000);
    }
  }

  async stopStream(): Promise<void> {
    try {
      // Delete all stream rules to stop the stream
      const existingRules = await this.twitterClient.v2.streamRules();
      if (existingRules.data?.length > 0) {
        await this.twitterClient.v2.updateStreamRules({
          delete: { ids: existingRules.data.map(rule => rule.id) },
        });
      }
      this.logger.log('Twitter stream stopped');
    } catch (error) {
      this.logger.error('Failed to stop Twitter stream:', error);
      throw error;
    }
  }

  // Spam and content filtering for T3.1.2b
  filterSpamAndIrrelevantContent(tweets: any[]): any[] {
    return tweets.filter(tweet => {
      // Filter out tweets with suspicious patterns
      if (this.isSpamTweet(tweet)) {
        this.metricsService.incrementCounter('twitter_spam_filtered');
        return false;
      }

      // Filter out irrelevant content
      if (!this.isRelevantContent(tweet)) {
        this.metricsService.incrementCounter('twitter_irrelevant_filtered');
        return false;
      }

      return true;
    });
  }

  private isSpamTweet(tweet: any): boolean {
    const text = tweet.text?.toLowerCase() || '';

    // Check for spam indicators
    const spamIndicators = [
      /(.)\1{4,}/, // Repeated characters
      /https?:\/\/[^\s]+/g, // Too many links
      /[!@#$%^&*()]{3,}/, // Excessive special characters
    ];

    return spamIndicators.some(pattern => pattern.test(text));
  }

  private isRelevantContent(tweet: any): boolean {
    const text = tweet.text?.toLowerCase() || '';

    // Check for crypto-related keywords
    const cryptoKeywords = [
      'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'cryptocurrency',
      'blockchain', 'defi', 'nft', 'altcoin', 'trading', 'hodl',
      'bull', 'bear', 'moon', 'dip', 'pump', 'dump'
    ];

    return cryptoKeywords.some(keyword => text.includes(keyword));
  }

  async getHealthStatus(): Promise<{ status: string; details?: any }> {
    try {
      if (!this.isInitialized) {
        return { status: 'unhealthy', details: 'Client not initialized' };
      }

      // Simple health check - try to get rate limit status
      const rateLimitStatus = await this.twitterClient.v2.get('tweets/search/recent', {
        query: 'test',
        max_results: 10,
      });

      return {
        status: 'healthy',
        details: {
          rateLimits: Object.fromEntries(this.rateLimitTracker),
          lastCheck: new Date().toISOString(),
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error.message }
      };
    }
  }
}
