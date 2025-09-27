import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as Sentiment from 'sentiment';
import * as natural from 'natural';

import { SentimentData } from '../entities/sentiment-data.entity';
import { SocialMention } from '../entities/social-mention.entity';
import { TwitterService } from '../external-apis/twitter.service';
import { RedditService } from '../external-apis/reddit.service';
import { NewsService } from '../external-apis/news.service';
import { CacheService } from '../cache/cache.service';
import { MetricsService } from '../metrics/metrics.service';
import { SentimentAnalysisRequestDto } from './dto/sentiment-analysis-request.dto';
import { SentimentAnalysisResponseDto } from './dto/sentiment-analysis-response.dto';

@Injectable()
export class SentimentAnalysisService {
  private readonly logger = new Logger(SentimentAnalysisService.name);
  private readonly sentimentAnalyzer = new Sentiment();

  constructor(
    @InjectRepository(SentimentData)
    private readonly sentimentDataRepository: Repository<SentimentData>,
    @InjectRepository(SocialMention)
    private readonly socialMentionRepository: Repository<SocialMention>,
    private readonly twitterService: TwitterService,
    private readonly redditService: RedditService,
    private readonly newsService: NewsService,
    private readonly cacheService: CacheService,
    private readonly metricsService: MetricsService,
    private readonly configService: ConfigService,
  ) {}

  async analyzeSentiment(request: SentimentAnalysisRequestDto): Promise<SentimentAnalysisResponseDto> {
    const startTime = Date.now();
    const { projectId, keywords, timeframe } = request;

    this.logger.log(`Starting sentiment analysis for ${projectId}`, {
      projectId,
      keywords,
      timeframe,
    });

    try {
      // Check cache first
      const cacheKey = `sentiment:${projectId}:${timeframe || '24h'}`;
      const cachedResult = await this.cacheService.get<SentimentAnalysisResponseDto>(cacheKey);
      
      if (cachedResult) {
        this.logger.log(`Cache hit for ${projectId}`, { projectId, cacheKey });
        this.metricsService.incrementCacheHits('sentiment_analysis');
        return cachedResult;
      }

      // Gather sentiment data from multiple sources in parallel
      const [
        twitterData,
        redditData,
        newsData,
      ] = await Promise.allSettled([
        this.getTwitterSentiment(keywords, timeframe),
        this.getRedditSentiment(keywords, timeframe),
        this.getNewsSentiment(keywords, timeframe),
      ]);

      // Process and combine sentiment data
      const analysisResult = await this.processSentimentData({
        projectId,
        keywords,
        timeframe,
        twitterData: this.extractSettledValue(twitterData),
        redditData: this.extractSettledValue(redditData),
        newsData: this.extractSettledValue(newsData),
      });

      // Calculate overall sentiment score and confidence
      analysisResult.overallSentiment = this.calculateOverallSentiment(analysisResult);
      analysisResult.confidence = this.calculateConfidence(analysisResult);
      analysisResult.riskFlags = this.identifyRiskFlags(analysisResult);

      // Store in database
      await this.storeSentimentResult(analysisResult);

      // Cache the result
      const cacheTTL = this.getCacheTTL(analysisResult.confidence);
      await this.cacheService.set(cacheKey, analysisResult, cacheTTL);

      // Record metrics
      const processingTime = Date.now() - startTime;
      this.metricsService.recordAnalysisTime('sentiment', processingTime);
      this.metricsService.incrementAnalysisCount('sentiment', 'success');

      this.logger.log(`Sentiment analysis completed for ${projectId}`, {
        projectId,
        processingTime,
        overallSentiment: analysisResult.overallSentiment,
        confidence: analysisResult.confidence,
        totalMentions: analysisResult.totalMentions,
      });

      return analysisResult;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`Sentiment analysis failed for ${projectId}`, {
        projectId,
        error: error.message,
        processingTime,
      });

      this.metricsService.incrementAnalysisCount('sentiment', 'error');
      throw error;
    }
  }

  private async getTwitterSentiment(keywords: string[], timeframe?: string) {
    try {
      const tweets = await this.twitterService.searchTweets(keywords, {
        timeframe,
        maxResults: 100,
      });

      const sentimentResults = tweets.map(tweet => {
        const sentiment = this.analyzeTweetSentiment(tweet.text);
        return {
          platform: 'twitter',
          content: tweet.text,
          author: tweet.author_id,
          timestamp: new Date(tweet.created_at),
          sentiment: sentiment.score,
          confidence: sentiment.confidence,
          engagement: {
            likes: tweet.public_metrics?.like_count || 0,
            retweets: tweet.public_metrics?.retweet_count || 0,
            replies: tweet.public_metrics?.reply_count || 0,
          },
        };
      });

      return {
        platform: 'twitter',
        mentions: sentimentResults,
        totalMentions: sentimentResults.length,
        averageSentiment: this.calculateAverageSentiment(sentimentResults),
        engagementScore: this.calculateEngagementScore(sentimentResults),
      };
    } catch (error) {
      this.logger.warn(`Twitter API error: ${error.message}`);
      return null;
    }
  }

  private async getRedditSentiment(keywords: string[], timeframe?: string) {
    try {
      const posts = await this.redditService.searchPosts(keywords, {
        timeframe,
        limit: 50,
      });

      const sentimentResults = posts.map(post => {
        const sentiment = this.analyzeTextSentiment(post.title + ' ' + post.selftext);
        return {
          platform: 'reddit',
          content: post.title + ' ' + post.selftext,
          author: post.author,
          timestamp: new Date(post.created_utc * 1000),
          sentiment: sentiment.score,
          confidence: sentiment.confidence,
          engagement: {
            upvotes: post.ups || 0,
            downvotes: post.downs || 0,
            comments: post.num_comments || 0,
          },
        };
      });

      return {
        platform: 'reddit',
        mentions: sentimentResults,
        totalMentions: sentimentResults.length,
        averageSentiment: this.calculateAverageSentiment(sentimentResults),
        engagementScore: this.calculateEngagementScore(sentimentResults),
      };
    } catch (error) {
      this.logger.warn(`Reddit API error: ${error.message}`);
      return null;
    }
  }

  private async getNewsSentiment(keywords: string[], timeframe?: string) {
    try {
      const articles = await this.newsService.searchNews(keywords, {
        timeframe,
        pageSize: 50,
      });

      const sentimentResults = articles.map(article => {
        const sentiment = this.analyzeTextSentiment(article.title + ' ' + article.description);
        return {
          platform: 'news',
          content: article.title + ' ' + article.description,
          author: article.source?.name || 'Unknown',
          timestamp: new Date(article.publishedAt),
          sentiment: sentiment.score,
          confidence: sentiment.confidence,
          url: article.url,
        };
      });

      return {
        platform: 'news',
        mentions: sentimentResults,
        totalMentions: sentimentResults.length,
        averageSentiment: this.calculateAverageSentiment(sentimentResults),
        sourceCredibility: this.calculateSourceCredibility(sentimentResults),
      };
    } catch (error) {
      this.logger.warn(`News API error: ${error.message}`);
      return null;
    }
  }

  private analyzeTweetSentiment(text: string) {
    // Clean tweet text
    const cleanText = this.cleanTweetText(text);
    return this.analyzeTextSentiment(cleanText);
  }

  private analyzeTextSentiment(text: string) {
    if (!text || text.trim().length === 0) {
      return { score: 0, confidence: 0 };
    }

    // Use sentiment library for basic analysis
    const result = this.sentimentAnalyzer.analyze(text);
    
    // Normalize score to -1 to 1 range
    const normalizedScore = Math.max(-1, Math.min(1, result.score / 10));
    
    // Calculate confidence based on word count and sentiment strength
    const wordCount = text.split(' ').length;
    const confidence = Math.min(1, (wordCount / 20) * (Math.abs(normalizedScore) + 0.1));

    return {
      score: normalizedScore,
      confidence: Math.round(confidence * 100) / 100,
      comparative: result.comparative,
      tokens: result.tokens,
      words: result.words,
      positive: result.positive,
      negative: result.negative,
    };
  }

  private cleanTweetText(text: string): string {
    return text
      .replace(/https?:\/\/[^\s]+/g, '') // Remove URLs
      .replace(/@\w+/g, '') // Remove mentions
      .replace(/#\w+/g, '') // Remove hashtags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  private calculateAverageSentiment(mentions: any[]): number {
    if (mentions.length === 0) return 0;
    
    const totalSentiment = mentions.reduce((sum, mention) => sum + mention.sentiment, 0);
    return Math.round((totalSentiment / mentions.length) * 100) / 100;
  }

  private calculateEngagementScore(mentions: any[]): number {
    if (mentions.length === 0) return 0;

    const totalEngagement = mentions.reduce((sum, mention) => {
      if (mention.engagement) {
        return sum + (mention.engagement.likes || 0) + 
               (mention.engagement.retweets || 0) + 
               (mention.engagement.replies || 0) +
               (mention.engagement.upvotes || 0) +
               (mention.engagement.comments || 0);
      }
      return sum;
    }, 0);

    return Math.round(totalEngagement / mentions.length);
  }

  private calculateSourceCredibility(mentions: any[]): number {
    // Simple credibility scoring based on known news sources
    const credibleSources = [
      'Reuters', 'Bloomberg', 'Associated Press', 'BBC', 'CNN',
      'CoinDesk', 'CoinTelegraph', 'The Block', 'Decrypt'
    ];

    const credibleMentions = mentions.filter(mention => 
      credibleSources.some(source => 
        mention.author?.toLowerCase().includes(source.toLowerCase())
      )
    );

    return mentions.length > 0 ? credibleMentions.length / mentions.length : 0;
  }

  private async processSentimentData(data: any): Promise<SentimentAnalysisResponseDto> {
    const {
      projectId,
      keywords,
      timeframe,
      twitterData,
      redditData,
      newsData,
    } = data;

    // Initialize result
    const result: SentimentAnalysisResponseDto = {
      projectId,
      keywords,
      timeframe: timeframe || '24h',
      overallSentiment: 0,
      confidence: 0,
      totalMentions: 0,
      platformBreakdown: {},
      sentimentTrend: [],
      riskFlags: [],
      lastUpdated: new Date(),
      warnings: [],
    };

    // Process platform data
    const platforms = [
      { name: 'twitter', data: twitterData },
      { name: 'reddit', data: redditData },
      { name: 'news', data: newsData },
    ];

    platforms.forEach(platform => {
      if (platform.data) {
        result.platformBreakdown[platform.name] = {
          mentions: platform.data.totalMentions,
          averageSentiment: platform.data.averageSentiment,
          engagementScore: platform.data.engagementScore || 0,
        };
        result.totalMentions += platform.data.totalMentions;
      } else {
        result.warnings.push(`${platform.name}_unavailable`);
      }
    });

    return result;
  }

  private calculateOverallSentiment(data: SentimentAnalysisResponseDto): number {
    const platforms = Object.keys(data.platformBreakdown);
    if (platforms.length === 0) return 0;

    let weightedSentiment = 0;
    let totalWeight = 0;

    platforms.forEach(platform => {
      const platformData = data.platformBreakdown[platform];
      const weight = platformData.mentions * (1 + platformData.engagementScore / 100);
      
      weightedSentiment += platformData.averageSentiment * weight;
      totalWeight += weight;
    });

    return totalWeight > 0 ? Math.round((weightedSentiment / totalWeight) * 100) / 100 : 0;
  }

  private calculateConfidence(data: SentimentAnalysisResponseDto): number {
    let confidence = 1.0;

    // Reduce confidence based on low mention count
    if (data.totalMentions < 10) {
      confidence *= 0.5;
    } else if (data.totalMentions < 50) {
      confidence *= 0.7;
    } else if (data.totalMentions < 100) {
      confidence *= 0.9;
    }

    // Reduce confidence based on missing platforms
    const availablePlatforms = Object.keys(data.platformBreakdown).length;
    const maxPlatforms = 3;
    confidence *= availablePlatforms / maxPlatforms;

    // Reduce confidence based on warnings
    const warningPenalty = data.warnings.length * 0.1;
    confidence = Math.max(confidence - warningPenalty, 0.1);

    return Math.round(confidence * 100) / 100;
  }

  private identifyRiskFlags(data: SentimentAnalysisResponseDto): string[] {
    const flags = [];

    // Negative sentiment risk
    if (data.overallSentiment < -0.5) {
      flags.push('highly_negative_sentiment');
    } else if (data.overallSentiment < -0.2) {
      flags.push('negative_sentiment');
    }

    // Low mention volume risk
    if (data.totalMentions < 10) {
      flags.push('low_social_activity');
    }

    // Platform concentration risk
    const platforms = Object.keys(data.platformBreakdown);
    if (platforms.length === 1) {
      flags.push('single_platform_dependency');
    }

    return flags;
  }

  private getCacheTTL(confidence: number): number {
    // Higher confidence = longer cache time
    if (confidence > 0.8) return 600; // 10 minutes
    if (confidence > 0.6) return 300; // 5 minutes
    return 180; // 3 minutes for low confidence
  }

  private async storeSentimentResult(result: SentimentAnalysisResponseDto): Promise<void> {
    try {
      const sentimentData = this.sentimentDataRepository.create({
        projectId: result.projectId,
        overallSentiment: result.overallSentiment,
        confidence: result.confidence,
        totalMentions: result.totalMentions,
        platformBreakdown: result.platformBreakdown,
        riskFlags: result.riskFlags,
        rawData: result,
      });

      await this.sentimentDataRepository.save(sentimentData);

    } catch (error) {
      this.logger.error(`Failed to store sentiment result: ${error.message}`, {
        projectId: result.projectId,
        error: error.message,
      });
      // Don't throw - storage failure shouldn't fail the analysis
    }
  }

  private extractSettledValue<T>(settledResult: PromiseSettledResult<T>): T | null {
    return settledResult.status === 'fulfilled' ? settledResult.value : null;
  }
}
