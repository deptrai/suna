import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { MetricsService } from '../metrics/metrics.service';
import { CacheService } from '../cache/cache.service';
import { firstValueFrom } from 'rxjs';
import * as NewsAPI from 'newsapi';
import * as Parser from 'rss-parser';
import * as cheerio from 'cheerio';

interface NewsSearchOptions {
  query?: string;
  sources?: string;
  domains?: string;
  from?: string;
  to?: string;
  language?: string;
  sortBy?: 'relevancy' | 'popularity' | 'publishedAt';
  pageSize?: number;
  page?: number;
}

interface NewsArticle {
  id: string;
  source: {
    id: string;
    name: string;
    credibilityScore?: number;
  };
  author: string;
  title: string;
  description: string;
  url: string;
  urlToImage: string;
  publishedAt: string;
  content: string;
  extractedContent?: string;
  sentimentScore?: number;
  keywords?: string[];
  category?: string;
}

interface RSSFeedItem {
  title: string;
  link: string;
  pubDate: string;
  creator?: string;
  content?: string;
  contentSnippet?: string;
  guid?: string;
  categories?: string[];
}

@Injectable()
export class NewsApiService implements OnModuleInit {
  private readonly logger = new Logger(NewsApiService.name);
  private newsApiClient: NewsAPI;
  private rssParser: Parser;
  private isInitialized = false;
  private rateLimitTracker = new Map<string, { count: number; resetTime: number }>();

  // T3.1.4a: News source integration - CoinDesk, CoinTelegraph APIs
  private readonly cryptoNewsSources = {
    newsApi: [
      'coindesk',
      'crypto-coins-news',
      'the-verge',
      'techcrunch',
      'reuters',
      'bloomberg',
    ],
    rssFeeds: [
      {
        name: 'CoinDesk',
        url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
        credibilityScore: 0.9,
      },
      {
        name: 'CoinTelegraph',
        url: 'https://cointelegraph.com/rss',
        credibilityScore: 0.85,
      },
      {
        name: 'Decrypt',
        url: 'https://decrypt.co/feed',
        credibilityScore: 0.8,
      },
      {
        name: 'The Block',
        url: 'https://www.theblockcrypto.com/rss.xml',
        credibilityScore: 0.9,
      },
      {
        name: 'CryptoNews',
        url: 'https://cryptonews.com/news/feed/',
        credibilityScore: 0.75,
      },
    ],
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly metricsService: MetricsService,
    private readonly cacheService: CacheService,
  ) {}

  async onModuleInit() {
    await this.initializeNewsClients();
  }

  private async initializeNewsClients() {
    try {
      // Initialize NewsAPI client
      const newsApiKey = this.configService.get<string>('externalApis.newsApi.apiKey');

      if (newsApiKey) {
        this.newsApiClient = new NewsAPI(newsApiKey);
        this.logger.log('NewsAPI client initialized successfully');
      } else {
        this.logger.warn('NewsAPI key not configured. NewsAPI will not be available.');
      }

      // Initialize RSS parser
      this.rssParser = new Parser({
        timeout: 10000,
        headers: {
          'User-Agent': 'ChainLens News Aggregator v1.0.0',
        },
      });

      this.isInitialized = true;
      this.logger.log('News aggregation services initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize news clients:', error);
      this.metricsService.incrementErrors('news_api', 'initialization');
    }
  }

  // T3.1.4a: News source integration - CoinDesk, CoinTelegraph APIs
  async searchNews(query: string, options: NewsSearchOptions = {}): Promise<any> {
    const startTime = Date.now();

    if (!this.isInitialized) {
      throw new Error('News clients not initialized');
    }

    try {
      await this.checkRateLimit('search');

      this.logger.log(`Searching news for query: ${query}`);

      const { pageSize = 20, sortBy = 'publishedAt', language = 'en' } = options;

      // Check cache first
      const cacheKey = `news:search:${query}:${sortBy}:${pageSize}`;
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        this.metricsService.incrementCacheHits('news_search');
        return cachedResult;
      }

      let articles: NewsArticle[] = [];

      // Search using NewsAPI if available
      if (this.newsApiClient) {
        try {
          const newsApiResult = await this.newsApiClient.v2.everything({
            q: query,
            sources: this.cryptoNewsSources.newsApi.join(','),
            language,
            sortBy,
            pageSize: Math.min(pageSize, 100),
          });

          if (newsApiResult.articles) {
            const processedArticles = await this.processNewsApiArticles(newsApiResult.articles);
            articles.push(...processedArticles);
          }
        } catch (error) {
          this.logger.warn('NewsAPI search failed, continuing with RSS feeds:', error);
        }
      }

      // Search RSS feeds for additional content
      const rssArticles = await this.searchRSSFeeds(query, pageSize - articles.length);
      articles.push(...rssArticles);

      // Sort by publication date
      articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

      const result = {
        status: 'ok',
        totalResults: articles.length,
        articles: articles.slice(0, pageSize),
        sources: {
          newsApi: this.newsApiClient ? 'available' : 'unavailable',
          rssFeeds: this.cryptoNewsSources.rssFeeds.length,
        },
        query,
        searchedAt: new Date().toISOString(),
      };

      // Cache for 15 minutes
      await this.cacheService.set(cacheKey, result, 900);

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('news', 'search', 'success');
      this.metricsService.recordApiResponseTime('news', 'search', duration);
      this.metricsService.incrementCacheMisses('news_search');

      return result;
    } catch (error) {
      this.logger.error(`Error searching news for query ${query}:`, error);
      this.metricsService.incrementApiRequests('news', 'search', 'error');
      this.metricsService.incrementErrors('external_api', 'news');
      throw error;
    }
  }

  // T3.1.4a: RSS feed parsing
  async getRSSFeeds(limit: number = 50): Promise<any> {
    const startTime = Date.now();

    if (!this.isInitialized) {
      throw new Error('News clients not initialized');
    }

    try {
      this.logger.log('Fetching RSS feeds from crypto news sources');

      // Check cache first
      const cacheKey = `news:rss:all:${limit}`;
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        this.metricsService.incrementCacheHits('news_rss');
        return cachedResult;
      }

      const allArticles: NewsArticle[] = [];

      // Fetch from all RSS feeds in parallel
      const feedPromises = this.cryptoNewsSources.rssFeeds.map(async (feedConfig) => {
        try {
          const feed = await this.rssParser.parseURL(feedConfig.url);

          const articles = feed.items.slice(0, Math.ceil(limit / this.cryptoNewsSources.rssFeeds.length)).map((item: RSSFeedItem) => ({
            id: item.guid || item.link || `${feedConfig.name}-${Date.now()}`,
            source: {
              id: feedConfig.name.toLowerCase().replace(/\s+/g, '-'),
              name: feedConfig.name,
              credibilityScore: feedConfig.credibilityScore,
            },
            author: item.creator || 'Unknown',
            title: item.title || '',
            description: item.contentSnippet || item.content || '',
            url: item.link || '',
            urlToImage: '',
            publishedAt: item.pubDate || new Date().toISOString(),
            content: item.content || item.contentSnippet || '',
            category: item.categories?.[0] || 'crypto',
          }));

          return articles;
        } catch (error) {
          this.logger.warn(`Failed to fetch RSS feed from ${feedConfig.name}:`, error);
          this.metricsService.incrementErrors('rss_feed', feedConfig.name);
          return [];
        }
      });

      const feedResults = await Promise.all(feedPromises);
      feedResults.forEach(articles => allArticles.push(...articles));

      // Sort by publication date
      allArticles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

      const result = {
        status: 'ok',
        totalResults: allArticles.length,
        articles: allArticles.slice(0, limit),
        sources: this.cryptoNewsSources.rssFeeds.map(feed => ({
          name: feed.name,
          credibilityScore: feed.credibilityScore,
        })),
        fetchedAt: new Date().toISOString(),
      };

      // Cache for 10 minutes
      await this.cacheService.set(cacheKey, result, 600);

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('news', 'rss', 'success');
      this.metricsService.recordApiResponseTime('news', 'rss', duration);
      this.metricsService.incrementCacheMisses('news_rss');

      return result;
    } catch (error) {
      this.logger.error('Error fetching RSS feeds:', error);
      this.metricsService.incrementApiRequests('news', 'rss', 'error');
      this.metricsService.incrementErrors('external_api', 'rss');
      throw error;
    }
  }

  // T3.1.4a: Article content extraction
  async extractArticleContent(url: string): Promise<string> {
    const startTime = Date.now();

    try {
      this.logger.log(`Extracting content from URL: ${url}`);

      // Check cache first
      const cacheKey = `news:content:${Buffer.from(url).toString('base64')}`;
      const cachedContent = await this.cacheService.get(cacheKey);
      if (cachedContent) {
        this.metricsService.incrementCacheHits('news_content');
        return cachedContent as string;
      }

      const response = await firstValueFrom(
        this.httpService.get(url, {
          timeout: 10000,
          headers: {
            'User-Agent': 'ChainLens News Aggregator v1.0.0',
          },
        })
      );

      const $ = cheerio.load(response.data);

      // Remove unwanted elements
      $('script, style, nav, header, footer, aside, .advertisement, .ads').remove();

      // Try to find main content using common selectors
      let content = '';
      const contentSelectors = [
        'article',
        '.article-content',
        '.post-content',
        '.entry-content',
        '.content',
        'main',
        '.main-content',
      ];

      for (const selector of contentSelectors) {
        const element = $(selector);
        if (element.length > 0) {
          content = element.text().trim();
          if (content.length > 200) { // Ensure we have substantial content
            break;
          }
        }
      }

      // Fallback to body if no specific content found
      if (!content || content.length < 200) {
        content = $('body').text().trim();
      }

      // Clean up the content
      content = content
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, '\n')
        .trim();

      // Cache for 24 hours (content doesn't change)
      await this.cacheService.set(cacheKey, content, 86400);

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('news', 'extract', 'success');
      this.metricsService.recordApiResponseTime('news', 'extract', duration);
      this.metricsService.incrementCacheMisses('news_content');

      return content;
    } catch (error) {
      this.logger.error(`Error extracting content from ${url}:`, error);
      this.metricsService.incrementApiRequests('news', 'extract', 'error');
      this.metricsService.incrementErrors('external_api', 'content_extraction');
      return '';
    }
  }

  // T3.1.4b: News sentiment analysis - Article headline analysis
  async analyzeHeadlineSentiment(headlines: string[]): Promise<any> {
    const startTime = Date.now();

    try {
      this.logger.log(`Analyzing sentiment for ${headlines.length} headlines`);

      const sentimentResults = headlines.map((headline, index) => {
        const sentiment = this.calculateHeadlineSentiment(headline);
        return {
          id: index,
          headline,
          sentiment: sentiment.sentiment,
          score: sentiment.score,
          confidence: sentiment.confidence,
          keywords: this.extractKeywords(headline),
        };
      });

      // Calculate overall sentiment distribution
      const sentimentDistribution = {
        positive: sentimentResults.filter(r => r.sentiment === 'positive').length,
        negative: sentimentResults.filter(r => r.sentiment === 'negative').length,
        neutral: sentimentResults.filter(r => r.sentiment === 'neutral').length,
      };

      const averageScore = sentimentResults.reduce((sum, r) => sum + r.score, 0) / sentimentResults.length;

      const result = {
        totalHeadlines: headlines.length,
        sentimentDistribution,
        averageScore,
        overallSentiment: this.determineOverallSentiment(averageScore),
        results: sentimentResults,
        analyzedAt: new Date().toISOString(),
      };

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('news', 'sentiment_headlines', 'success');
      this.metricsService.recordApiResponseTime('news', 'sentiment_headlines', duration);

      return result;
    } catch (error) {
      this.logger.error('Error analyzing headline sentiment:', error);
      this.metricsService.incrementApiRequests('news', 'sentiment_headlines', 'error');
      this.metricsService.incrementErrors('external_api', 'sentiment_analysis');
      throw error;
    }
  }

  // T3.1.4b: Content sentiment scoring with source credibility weighting
  async analyzeContentSentiment(articles: NewsArticle[]): Promise<any> {
    const startTime = Date.now();

    try {
      this.logger.log(`Analyzing content sentiment for ${articles.length} articles`);

      const analysisPromises = articles.map(async (article) => {
        // Extract content if not already available
        let content = article.extractedContent || article.content;
        if (!content || content.length < 100) {
          content = await this.extractArticleContent(article.url);
        }

        const headlineSentiment = this.calculateHeadlineSentiment(article.title);
        const contentSentiment = this.calculateContentSentiment(content);

        // Combine headline and content sentiment with weighting
        const combinedScore = (headlineSentiment.score * 0.3) + (contentSentiment.score * 0.7);
        const combinedSentiment = this.determineOverallSentiment(combinedScore);

        // Apply source credibility weighting
        const credibilityScore = article.source.credibilityScore || 0.5;
        const weightedScore = combinedScore * credibilityScore;

        return {
          articleId: article.id,
          title: article.title,
          source: article.source.name,
          credibilityScore,
          headlineSentiment: {
            sentiment: headlineSentiment.sentiment,
            score: headlineSentiment.score,
            confidence: headlineSentiment.confidence,
          },
          contentSentiment: {
            sentiment: contentSentiment.sentiment,
            score: contentSentiment.score,
            confidence: contentSentiment.confidence,
          },
          combinedSentiment: {
            sentiment: combinedSentiment,
            score: combinedScore,
            weightedScore,
          },
          keywords: this.extractKeywords(article.title + ' ' + content),
          publishedAt: article.publishedAt,
        };
      });

      const results = await Promise.all(analysisPromises);

      // Calculate aggregated metrics
      const sentimentDistribution = {
        positive: results.filter(r => r.combinedSentiment.sentiment === 'positive').length,
        negative: results.filter(r => r.combinedSentiment.sentiment === 'negative').length,
        neutral: results.filter(r => r.combinedSentiment.sentiment === 'neutral').length,
      };

      const averageScore = results.reduce((sum, r) => sum + r.combinedSentiment.score, 0) / results.length;
      const weightedAverageScore = results.reduce((sum, r) => sum + r.combinedSentiment.weightedScore, 0) / results.length;

      const finalResult = {
        totalArticles: articles.length,
        sentimentDistribution,
        averageScore,
        weightedAverageScore,
        overallSentiment: this.determineOverallSentiment(weightedAverageScore),
        results,
        analyzedAt: new Date().toISOString(),
      };

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('news', 'sentiment_content', 'success');
      this.metricsService.recordApiResponseTime('news', 'sentiment_content', duration);

      return finalResult;
    } catch (error) {
      this.logger.error('Error analyzing content sentiment:', error);
      this.metricsService.incrementApiRequests('news', 'sentiment_content', 'error');
      this.metricsService.incrementErrors('external_api', 'sentiment_analysis');
      throw error;
    }
  }

  // Helper methods for processing
  private async processNewsApiArticles(articles: any[]): Promise<NewsArticle[]> {
    return articles.map((article, index) => ({
      id: `newsapi-${Date.now()}-${index}`,
      source: {
        id: article.source.id || 'unknown',
        name: article.source.name || 'Unknown Source',
        credibilityScore: this.getSourceCredibilityScore(article.source.name),
      },
      author: article.author || 'Unknown',
      title: article.title || '',
      description: article.description || '',
      url: article.url || '',
      urlToImage: article.urlToImage || '',
      publishedAt: article.publishedAt || new Date().toISOString(),
      content: article.content || '',
      keywords: this.extractKeywords(article.title + ' ' + article.description),
    }));
  }

  private async searchRSSFeeds(query: string, limit: number): Promise<NewsArticle[]> {
    const articles: NewsArticle[] = [];
    const queryLower = query.toLowerCase();

    for (const feedConfig of this.cryptoNewsSources.rssFeeds) {
      try {
        const feed = await this.rssParser.parseURL(feedConfig.url);

        const relevantItems = feed.items.filter((item: RSSFeedItem) => {
          const title = (item.title || '').toLowerCase();
          const content = (item.contentSnippet || item.content || '').toLowerCase();
          return title.includes(queryLower) || content.includes(queryLower);
        });

        const feedArticles = relevantItems.slice(0, Math.ceil(limit / this.cryptoNewsSources.rssFeeds.length)).map((item: RSSFeedItem, index) => ({
          id: `rss-${feedConfig.name}-${Date.now()}-${index}`,
          source: {
            id: feedConfig.name.toLowerCase().replace(/\s+/g, '-'),
            name: feedConfig.name,
            credibilityScore: feedConfig.credibilityScore,
          },
          author: item.creator || 'Unknown',
          title: item.title || '',
          description: item.contentSnippet || item.content || '',
          url: item.link || '',
          urlToImage: '',
          publishedAt: item.pubDate || new Date().toISOString(),
          content: item.content || item.contentSnippet || '',
          keywords: this.extractKeywords(item.title + ' ' + (item.contentSnippet || '')),
        }));

        articles.push(...feedArticles);
      } catch (error) {
        this.logger.warn(`Failed to search RSS feed from ${feedConfig.name}:`, error);
      }
    }

    return articles;
  }

  private getSourceCredibilityScore(sourceName: string): number {
    const credibilityMap: { [key: string]: number } = {
      'coindesk': 0.9,
      'cointelegraph': 0.85,
      'decrypt': 0.8,
      'the block': 0.9,
      'cryptonews': 0.75,
      'reuters': 0.95,
      'bloomberg': 0.9,
      'techcrunch': 0.8,
      'the verge': 0.75,
    };

    const normalizedName = sourceName.toLowerCase();
    return credibilityMap[normalizedName] || 0.5;
  }

  // Sentiment analysis helper methods
  private calculateHeadlineSentiment(headline: string): { sentiment: string; score: number; confidence: number } {
    const words = headline.toLowerCase().split(/\s+/);

    // Crypto-specific sentiment words
    const positiveWords = [
      'bull', 'bullish', 'moon', 'surge', 'rally', 'pump', 'gain', 'rise', 'up', 'high',
      'breakthrough', 'adoption', 'partnership', 'launch', 'success', 'growth', 'profit',
      'buy', 'invest', 'opportunity', 'positive', 'good', 'great', 'excellent', 'strong'
    ];

    const negativeWords = [
      'bear', 'bearish', 'crash', 'dump', 'fall', 'drop', 'down', 'low', 'decline',
      'loss', 'sell', 'risk', 'warning', 'concern', 'problem', 'issue', 'hack',
      'scam', 'fraud', 'ban', 'regulation', 'negative', 'bad', 'terrible', 'weak'
    ];

    let positiveCount = 0;
    let negativeCount = 0;

    words.forEach(word => {
      if (positiveWords.includes(word)) positiveCount++;
      if (negativeWords.includes(word)) negativeCount++;
    });

    const totalSentimentWords = positiveCount + negativeCount;
    const confidence = Math.min(totalSentimentWords / words.length * 2, 1);

    let score = 0;
    let sentiment = 'neutral';

    if (positiveCount > negativeCount) {
      score = (positiveCount - negativeCount) / words.length;
      sentiment = 'positive';
    } else if (negativeCount > positiveCount) {
      score = -(negativeCount - positiveCount) / words.length;
      sentiment = 'negative';
    }

    // Normalize score to -1 to 1 range
    score = Math.max(-1, Math.min(1, score * 5));

    return { sentiment, score, confidence };
  }

  private calculateContentSentiment(content: string): { sentiment: string; score: number; confidence: number } {
    if (!content || content.length < 50) {
      return { sentiment: 'neutral', score: 0, confidence: 0 };
    }

    // Use a more sophisticated approach for content analysis
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const sentimentScores: number[] = [];

    sentences.forEach(sentence => {
      const headlineSentiment = this.calculateHeadlineSentiment(sentence);
      sentimentScores.push(headlineSentiment.score);
    });

    if (sentimentScores.length === 0) {
      return { sentiment: 'neutral', score: 0, confidence: 0 };
    }

    const averageScore = sentimentScores.reduce((sum, score) => sum + score, 0) / sentimentScores.length;
    const confidence = Math.min(sentimentScores.length / 10, 1); // More sentences = higher confidence

    const sentiment = this.determineOverallSentiment(averageScore);

    return { sentiment, score: averageScore, confidence };
  }

  private determineOverallSentiment(score: number): string {
    if (score > 0.1) return 'positive';
    if (score < -0.1) return 'negative';
    return 'neutral';
  }

  private extractKeywords(text: string): string[] {
    if (!text) return [];

    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);

    // Crypto-specific keywords
    const cryptoKeywords = [
      'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'cryptocurrency', 'blockchain',
      'defi', 'nft', 'altcoin', 'trading', 'hodl', 'bull', 'bear', 'moon', 'dip',
      'pump', 'dump', 'whale', 'diamond', 'hands', 'paper', 'rocket', 'lambo',
      'satoshi', 'mining', 'hash', 'node', 'wallet', 'exchange', 'market', 'price'
    ];

    const relevantWords = words.filter(word =>
      cryptoKeywords.includes(word) ||
      (word.length > 4 && !['this', 'that', 'with', 'from', 'they', 'have', 'been', 'will', 'would', 'could', 'should'].includes(word))
    );

    // Count frequency and return top keywords
    const wordCount = new Map<string, number>();
    relevantWords.forEach(word => {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    });

    return Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  // Rate limiting and utility methods
  private async checkRateLimit(endpoint: string): Promise<void> {
    const rateLimitInfo = this.rateLimitTracker.get(endpoint);

    if (rateLimitInfo) {
      const now = Date.now();

      // Reset counter if window has passed (NewsAPI: 1000 requests per day, RSS: no limit)
      if (now > rateLimitInfo.resetTime) {
        rateLimitInfo.count = 0;
        rateLimitInfo.resetTime = now + (24 * 60 * 60 * 1000); // 24 hours
      }

      // Check if we're at the limit (conservative: 500 requests per day)
      if (rateLimitInfo.count >= 500) {
        const waitTime = rateLimitInfo.resetTime - now;
        this.logger.warn(`Rate limit reached for ${endpoint}. Waiting ${waitTime}ms`);
        this.metricsService.incrementErrors('news_api', 'rate_limit');
        throw new Error(`Rate limit exceeded for ${endpoint}. Reset in ${waitTime}ms`);
      }

      rateLimitInfo.count++;
    } else {
      this.rateLimitTracker.set(endpoint, {
        count: 1,
        resetTime: Date.now() + (24 * 60 * 60 * 1000),
      });
    }
  }

  async getHealthStatus(): Promise<{ status: string; details?: any }> {
    try {
      const details = {
        newsApiAvailable: !!this.newsApiClient,
        rssParserAvailable: !!this.rssParser,
        supportedSources: {
          newsApi: this.cryptoNewsSources.newsApi.length,
          rssFeeds: this.cryptoNewsSources.rssFeeds.length,
        },
        rateLimits: Object.fromEntries(this.rateLimitTracker),
        lastCheck: new Date().toISOString(),
      };

      return {
        status: 'healthy',
        details,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error.message }
      };
    }
  }

  // Aggregated news analysis
  async getAggregatedNewsSentiment(query: string = 'cryptocurrency', limit: number = 50): Promise<any> {
    const startTime = Date.now();

    try {
      this.logger.log(`Getting aggregated news sentiment for: ${query}`);

      // Check cache first
      const cacheKey = `news:aggregated:${query}:${limit}`;
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        this.metricsService.incrementCacheHits('news_aggregated');
        return cachedResult;
      }

      // Get news from multiple sources
      const [newsApiResults, rssResults] = await Promise.all([
        this.searchNews(query, { pageSize: Math.ceil(limit / 2) }).catch(() => ({ articles: [] })),
        this.getRSSFeeds(Math.ceil(limit / 2)).catch(() => ({ articles: [] })),
      ]);

      const allArticles = [
        ...(newsApiResults.articles || []),
        ...(rssResults.articles || []),
      ].slice(0, limit);

      // Analyze sentiment
      const sentimentAnalysis = await this.analyzeContentSentiment(allArticles);

      // Extract headlines for separate analysis
      const headlines = allArticles.map(article => article.title);
      const headlineAnalysis = await this.analyzeHeadlineSentiment(headlines);

      const result = {
        query,
        totalArticles: allArticles.length,
        sources: {
          newsApi: newsApiResults.articles?.length || 0,
          rss: rssResults.articles?.length || 0,
        },
        contentSentiment: sentimentAnalysis,
        headlineSentiment: headlineAnalysis,
        aggregatedAt: new Date().toISOString(),
      };

      // Cache for 30 minutes
      await this.cacheService.set(cacheKey, result, 1800);

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('news', 'aggregated', 'success');
      this.metricsService.recordApiResponseTime('news', 'aggregated', duration);
      this.metricsService.incrementCacheMisses('news_aggregated');

      return result;
    } catch (error) {
      this.logger.error(`Error getting aggregated news sentiment for ${query}:`, error);
      this.metricsService.incrementApiRequests('news', 'aggregated', 'error');
      this.metricsService.incrementErrors('external_api', 'news_aggregated');
      throw error;
    }
  }
}
