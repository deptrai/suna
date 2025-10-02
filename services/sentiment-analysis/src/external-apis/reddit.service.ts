import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { MetricsService } from '../metrics/metrics.service';
import { CacheService } from '../cache/cache.service';
import * as Snoowrap from 'snoowrap';

interface RedditSearchOptions {
  limit?: number;
  sort?: 'relevance' | 'hot' | 'top' | 'new' | 'comments';
  time?: 'all' | 'year' | 'month' | 'week' | 'day' | 'hour';
  subreddit?: string;
}

interface SubredditMetrics {
  totalPosts: number;
  totalComments: number;
  averageScore: number;
  sentimentDistribution: {
    positive: number;
    negative: number;
    neutral: number;
  };
  topKeywords: string[];
  engagementRate: number;
}

@Injectable()
export class RedditService implements OnModuleInit {
  private readonly logger = new Logger(RedditService.name);
  private redditClient: Snoowrap;
  private isInitialized = false;
  private rateLimitTracker = new Map<string, { count: number; resetTime: number }>();

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly metricsService: MetricsService,
    private readonly cacheService: CacheService,
  ) {}

  async onModuleInit() {
    await this.initializeRedditClient();
  }

  private async initializeRedditClient() {
    try {
      const clientId = this.configService.get<string>('externalApi.reddit.clientId');
      const clientSecret = this.configService.get<string>('externalApi.reddit.clientSecret');
      const username = this.configService.get<string>('externalApi.reddit.username');
      const password = this.configService.get<string>('externalApi.reddit.password');
      const userAgent = this.configService.get<string>('externalApi.reddit.userAgent');

      if (!clientId || !clientSecret || !username || !password) {
        this.logger.warn('Reddit credentials not configured. Reddit API will not be available.');
        return;
      }

      this.redditClient = new Snoowrap({
        userAgent: userAgent || 'ChainLens:v1.0.0 (by /u/chainlens)',
        clientId,
        clientSecret,
        username,
        password,
      });

      // Test the connection
      await this.testConnection();

      this.isInitialized = true;
      this.logger.log('Reddit API client initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Reddit client:', error);
      this.metricsService.incrementErrors('reddit_api', 'initialization');
    }
  }

  private async testConnection(): Promise<void> {
    try {
      // Test with a simple subreddit fetch
      const testSubreddit = this.redditClient.getSubreddit('test') as any;
      await testSubreddit.fetch();
      this.logger.log('Reddit API connection test successful');
    } catch (error) {
      this.logger.error('Reddit API connection test failed:', error);
      throw error;
    }
  }

  // T3.1.3b: Post and comment analysis - Fetch posts from crypto subreddits
  async getSubredditPosts(subreddit: string, limit: number = 25, sort: 'hot' | 'new' | 'top' = 'hot'): Promise<any> {
    const startTime = Date.now();

    if (!this.isInitialized) {
      throw new Error('Reddit client not initialized');
    }

    try {
      await this.checkRateLimit('subreddit_posts');

      this.logger.log(`Getting ${sort} posts from subreddit: ${subreddit}`);

      // Check cache first
      const cacheKey = `reddit:subreddit:${subreddit}:${sort}:${limit}`;
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        this.metricsService.incrementCacheHits('reddit_subreddit');
        return cachedResult;
      }

      // Fetch posts from Reddit
      const subredditObj = this.redditClient.getSubreddit(subreddit);
      let posts;

      switch (sort) {
        case 'hot':
          posts = await subredditObj.getHot({ limit });
          break;
        case 'new':
          posts = await subredditObj.getNew({ limit });
          break;
        case 'top':
          posts = await subredditObj.getTop({ limit, time: 'day' });
          break;
        default:
          posts = await subredditObj.getHot({ limit });
      }

      // Process and format posts
      const processedPosts = posts.map((post: any) => ({
        id: post.id,
        title: post.title,
        selftext: post.selftext,
        author: post.author.name,
        created_utc: post.created_utc,
        score: post.score,
        upvote_ratio: post.upvote_ratio,
        num_comments: post.num_comments,
        subreddit: post.subreddit.display_name,
        permalink: post.permalink,
        url: post.url,
        is_self: post.is_self,
        flair_text: post.link_flair_text,
        over_18: post.over_18,
        gilded: post.gilded,
        distinguished: post.distinguished,
      }));

      const result = {
        data: processedPosts,
        meta: {
          subreddit,
          sort,
          limit,
          count: processedPosts.length,
          fetched_at: new Date().toISOString(),
        },
      };

      // Cache for 10 minutes
      await this.cacheService.set(cacheKey, result, 600);

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('reddit', 'subreddit_posts', 'success');
      this.metricsService.recordApiResponseTime('reddit', 'subreddit_posts', duration);
      this.metricsService.incrementCacheMisses('reddit_subreddit');

      return result;
    } catch (error) {
      this.logger.error(`Error getting posts from subreddit ${subreddit}:`, error);
      this.metricsService.incrementApiRequests('reddit', 'subreddit_posts', 'error');
      this.metricsService.incrementErrors('external_api', 'reddit');
      throw error;
    }
  }

  async searchPosts(query: string, options: RedditSearchOptions = {}): Promise<any> {
    const startTime = Date.now();

    if (!this.isInitialized) {
      throw new Error('Reddit client not initialized');
    }

    try {
      await this.checkRateLimit('search');

      const { limit = 25, sort = 'relevance', time = 'all', subreddit } = options;

      this.logger.log(`Searching Reddit posts for query: ${query}`);

      // Check cache first
      const cacheKey = `reddit:search:${query}:${subreddit || 'all'}:${sort}:${limit}`;
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        this.metricsService.incrementCacheHits('reddit_search');
        return cachedResult;
      }

      // Search posts
      let searchResults;
      if (subreddit) {
        const subredditObj = this.redditClient.getSubreddit(subreddit);
        const searchResult = await subredditObj.search({
          query,
          sort,
          time,
        } as any);
        searchResults = (searchResult as any).slice(0, limit);
      } else {
        const globalSearchResult = await this.redditClient.search({
          query,
          sort,
          time,
        } as any);
        searchResults = (globalSearchResult as any).slice(0, limit);
      }

      // Process search results
      const processedResults = searchResults.map((post: any) => ({
        id: post.id,
        title: post.title,
        selftext: post.selftext,
        author: post.author.name,
        created_utc: post.created_utc,
        score: post.score,
        upvote_ratio: post.upvote_ratio,
        num_comments: post.num_comments,
        subreddit: post.subreddit.display_name,
        permalink: post.permalink,
        url: post.url,
        is_self: post.is_self,
        flair_text: post.link_flair_text,
      }));

      const result = {
        data: processedResults,
        meta: {
          query,
          subreddit: subreddit || 'all',
          sort,
          time,
          limit,
          count: processedResults.length,
          searched_at: new Date().toISOString(),
        },
      };

      // Cache for 15 minutes
      await this.cacheService.set(cacheKey, result, 900);

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('reddit', 'search', 'success');
      this.metricsService.recordApiResponseTime('reddit', 'search', duration);
      this.metricsService.incrementCacheMisses('reddit_search');

      return result;
    } catch (error) {
      this.logger.error(`Error searching Reddit posts for query ${query}:`, error);
      this.metricsService.incrementApiRequests('reddit', 'search', 'error');
      this.metricsService.incrementErrors('external_api', 'reddit');
      throw error;
    }
  }

  // T3.1.3b: Comment thread analysis with vote score integration
  async getPostComments(postId: string, subreddit: string, limit: number = 50): Promise<any> {
    const startTime = Date.now();

    if (!this.isInitialized) {
      throw new Error('Reddit client not initialized');
    }

    try {
      await this.checkRateLimit('comments');

      this.logger.log(`Getting comments for post: ${postId}`);

      // Check cache first
      const cacheKey = `reddit:comments:${postId}:${limit}`;
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        this.metricsService.incrementCacheHits('reddit_comments');
        return cachedResult;
      }

      // Get post and its comments
      const submission = this.redditClient.getSubmission(postId) as any;
      await submission.expandReplies({ limit, depth: 3 });

      // Process comments recursively
      const processedComments = this.processCommentTree(submission.comments);

      const result = {
        post: {
          id: submission.id,
          title: submission.title,
          author: submission.author.name,
          score: submission.score,
          upvote_ratio: submission.upvote_ratio,
          num_comments: submission.num_comments,
        },
        comments: processedComments,
        meta: {
          postId,
          subreddit,
          limit,
          total_comments: processedComments.length,
          fetched_at: new Date().toISOString(),
        },
      };

      // Cache for 5 minutes (comments change frequently)
      await this.cacheService.set(cacheKey, result, 300);

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('reddit', 'comments', 'success');
      this.metricsService.recordApiResponseTime('reddit', 'comments', duration);
      this.metricsService.incrementCacheMisses('reddit_comments');

      return result;
    } catch (error) {
      this.logger.error(`Error getting comments for post ${postId}:`, error);
      this.metricsService.incrementApiRequests('reddit', 'comments', 'error');
      this.metricsService.incrementErrors('external_api', 'reddit');
      throw error;
    }
  }

  private processCommentTree(comments: any[], depth: number = 0): any[] {
    const processed = [];

    for (const comment of comments) {
      if (comment.body && comment.body !== '[deleted]' && comment.body !== '[removed]') {
        const processedComment = {
          id: comment.id,
          body: comment.body,
          author: comment.author ? comment.author.name : '[deleted]',
          created_utc: comment.created_utc,
          score: comment.score,
          ups: comment.ups,
          downs: comment.downs,
          depth,
          parent_id: comment.parent_id,
          is_submitter: comment.is_submitter,
          distinguished: comment.distinguished,
          gilded: comment.gilded,
          replies: comment.replies ? this.processCommentTree(comment.replies, depth + 1) : [],
        };
        processed.push(processedComment);
      }
    }

    return processed;
  }

  // T3.1.3c: Community sentiment tracking - Subreddit-specific metrics
  async getSubredditMetrics(subreddit: string, timeframe: 'day' | 'week' | 'month' = 'day'): Promise<SubredditMetrics> {
    const startTime = Date.now();

    if (!this.isInitialized) {
      throw new Error('Reddit client not initialized');
    }

    try {
      this.logger.log(`Getting metrics for subreddit: ${subreddit}`);

      // Check cache first
      const cacheKey = `reddit:metrics:${subreddit}:${timeframe}`;
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        this.metricsService.incrementCacheHits('reddit_metrics');
        return cachedResult as SubredditMetrics;
      }

      // Get top posts for analysis
      const subredditObj = this.redditClient.getSubreddit(subreddit);
      const posts = await subredditObj.getTop({ limit: 100, time: timeframe });

      // Calculate metrics
      const metrics = await this.calculateSubredditMetrics(posts, subreddit);

      // Cache for 1 hour
      await this.cacheService.set(cacheKey, metrics, 3600);

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('reddit', 'metrics', 'success');
      this.metricsService.recordApiResponseTime('reddit', 'metrics', duration);
      this.metricsService.incrementCacheMisses('reddit_metrics');

      return metrics;
    } catch (error) {
      this.logger.error(`Error getting metrics for subreddit ${subreddit}:`, error);
      this.metricsService.incrementApiRequests('reddit', 'metrics', 'error');
      this.metricsService.incrementErrors('external_api', 'reddit');
      throw error;
    }
  }

  private async calculateSubredditMetrics(posts: any[], subreddit: string): Promise<SubredditMetrics> {
    let totalScore = 0;
    let totalComments = 0;
    const keywords = new Map<string, number>();

    // Sentiment distribution (placeholder - will be integrated with sentiment analysis)
    const sentimentDistribution = {
      positive: 0,
      negative: 0,
      neutral: 0,
    };

    for (const post of posts) {
      totalScore += post.score || 0;
      totalComments += post.num_comments || 0;

      // Extract keywords from title and text
      const text = `${post.title} ${post.selftext || ''}`.toLowerCase();
      const words = text.match(/\b\w{3,}\b/g) || [];

      words.forEach(word => {
        if (this.isRelevantKeyword(word)) {
          keywords.set(word, (keywords.get(word) || 0) + 1);
        }
      });

      // Basic sentiment classification (placeholder)
      const sentiment = this.classifyBasicSentiment(text);
      sentimentDistribution[sentiment]++;
    }

    // Calculate engagement rate
    const engagementRate = posts.length > 0 ? totalComments / posts.length : 0;

    // Get top keywords
    const topKeywords = Array.from(keywords.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword]) => keyword);

    return {
      totalPosts: posts.length,
      totalComments,
      averageScore: posts.length > 0 ? totalScore / posts.length : 0,
      sentimentDistribution,
      topKeywords,
      engagementRate,
    };
  }

  // T3.1.3c: Trending topic detection
  async getTrendingTopics(subreddit: string, timeframe: 'hour' | 'day' | 'week' = 'day'): Promise<any> {
    const startTime = Date.now();

    if (!this.isInitialized) {
      throw new Error('Reddit client not initialized');
    }

    try {
      this.logger.log(`Getting trending topics for subreddit: ${subreddit}`);

      const cacheKey = `reddit:trending:${subreddit}:${timeframe}`;
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        this.metricsService.incrementCacheHits('reddit_trending');
        return cachedResult;
      }

      const subredditObj = this.redditClient.getSubreddit(subreddit);
      const posts = await subredditObj.getTop({ limit: 100, time: timeframe });

      // Extract trending keywords and topics
      const keywordFrequency = new Map<string, number>();
      const flairFrequency = new Map<string, number>();

      for (const post of posts) {
        // Extract keywords from title
        const words = post.title.toLowerCase().match(/\b\w{3,}\b/g) || [];
        words.forEach(word => {
          if (this.isRelevantKeyword(word)) {
            keywordFrequency.set(word, (keywordFrequency.get(word) || 0) + post.score);
          }
        });

        // Track flair usage
        if (post.link_flair_text) {
          flairFrequency.set(post.link_flair_text, (flairFrequency.get(post.link_flair_text) || 0) + 1);
        }
      }

      const trendingKeywords = Array.from(keywordFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([keyword, score]) => ({ keyword, score }));

      const trendingFlairs = Array.from(flairFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([flair, count]) => ({ flair, count }));

      const result = {
        subreddit,
        timeframe,
        trendingKeywords,
        trendingFlairs,
        totalPosts: posts.length,
        analyzed_at: new Date().toISOString(),
      };

      // Cache for 2 hours
      await this.cacheService.set(cacheKey, result, 7200);

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('reddit', 'trending', 'success');
      this.metricsService.recordApiResponseTime('reddit', 'trending', duration);
      this.metricsService.incrementCacheMisses('reddit_trending');

      return result;
    } catch (error) {
      this.logger.error(`Error getting trending topics for subreddit ${subreddit}:`, error);
      this.metricsService.incrementApiRequests('reddit', 'trending', 'error');
      this.metricsService.incrementErrors('external_api', 'reddit');
      throw error;
    }
  }

  // Helper methods
  private async checkRateLimit(endpoint: string): Promise<void> {
    const rateLimitInfo = this.rateLimitTracker.get(endpoint);

    if (rateLimitInfo) {
      const now = Date.now();

      // Reset counter if window has passed (Reddit: 60 requests per minute)
      if (now > rateLimitInfo.resetTime) {
        rateLimitInfo.count = 0;
        rateLimitInfo.resetTime = now + (60 * 1000); // 1 minute
      }

      // Check if we're at the limit
      if (rateLimitInfo.count >= 60) {
        const waitTime = rateLimitInfo.resetTime - now;
        this.logger.warn(`Rate limit reached for ${endpoint}. Waiting ${waitTime}ms`);
        this.metricsService.incrementErrors('reddit_api', 'rate_limit');
        throw new Error(`Rate limit exceeded for ${endpoint}. Reset in ${waitTime}ms`);
      }

      rateLimitInfo.count++;
    } else {
      this.rateLimitTracker.set(endpoint, {
        count: 1,
        resetTime: Date.now() + (60 * 1000),
      });
    }
  }

  private isRelevantKeyword(word: string): boolean {
    // Filter out common words and focus on crypto-related terms
    const commonWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'man', 'end', 'few', 'got', 'let', 'put', 'say', 'she', 'too', 'use'];

    if (commonWords.includes(word) || word.length < 3) {
      return false;
    }

    // Crypto-related keywords get priority
    const cryptoKeywords = ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'cryptocurrency', 'blockchain', 'defi', 'nft', 'altcoin', 'trading', 'hodl', 'bull', 'bear', 'moon', 'dip', 'pump', 'dump', 'whale', 'diamond', 'hands', 'paper', 'rocket', 'lambo'];

    return cryptoKeywords.includes(word) || !commonWords.includes(word);
  }

  private classifyBasicSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    // Basic sentiment classification (will be replaced with proper sentiment analysis)
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'awesome', 'bull', 'moon', 'rocket', 'diamond', 'hodl', 'buy', 'bullish', 'up', 'rise', 'gain', 'profit'];
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'bear', 'crash', 'dump', 'sell', 'bearish', 'down', 'fall', 'loss', 'scam', 'rug', 'paper', 'hands'];

    const words = text.toLowerCase().split(/\s+/);
    let positiveCount = 0;
    let negativeCount = 0;

    words.forEach(word => {
      if (positiveWords.includes(word)) positiveCount++;
      if (negativeWords.includes(word)) negativeCount++;
    });

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  async getHealthStatus(): Promise<{ status: string; details?: any }> {
    try {
      if (!this.isInitialized) {
        return { status: 'unhealthy', details: 'Client not initialized' };
      }

      // Simple health check
      const testSubreddit = this.redditClient.getSubreddit('test') as any;
      await testSubreddit.fetch();

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

  // Crypto-specific subreddit methods
  async getCryptoSubreddits(): Promise<string[]> {
    return [
      'cryptocurrency',
      'Bitcoin',
      'ethereum',
      'CryptoCurrency',
      'altcoin',
      'CryptoMarkets',
      'defi',
      'NFT',
      'dogecoin',
      'litecoin',
      'cardano',
      'solana',
      'polygon',
      'chainlink',
    ];
  }

  async getMultiSubredditPosts(subreddits: string[], limit: number = 25): Promise<any> {
    const results = [];

    for (const subreddit of subreddits) {
      try {
        const posts = await this.getSubredditPosts(subreddit, Math.ceil(limit / subreddits.length));
        results.push({
          subreddit,
          posts: posts.data,
          count: posts.data.length,
        });
      } catch (error) {
        this.logger.error(`Error fetching posts from ${subreddit}:`, error);
        results.push({
          subreddit,
          posts: [],
          count: 0,
          error: error.message,
        });
      }
    }

    return {
      subreddits: results,
      totalPosts: results.reduce((sum, r) => sum + r.count, 0),
      fetched_at: new Date().toISOString(),
    };
  }
}
