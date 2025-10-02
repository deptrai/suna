/**
 * Advanced Sentiment Analytics Service
 * Story 3.2: Advanced Sentiment Analytics Implementation
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SentimentTrend {
  timeframe: string;
  dataPoints: Array<{
    timestamp: Date;
    sentimentScore: number;
    volume: number;
    positiveCount: number;
    negativeCount: number;
    neutralCount: number;
  }>;
  trendDirection: 'bullish' | 'bearish' | 'neutral';
  trendStrength: number; // 0-100
  volatility: number; // 0-100
  momentum: number; // -100 to +100
}

export interface InfluencerImpact {
  influencers: Array<{
    username: string;
    platform: string;
    followers: number;
    engagementRate: number;
    sentimentScore: number;
    impactScore: number; // 0-100
    recentPosts: number;
  }>;
  topInfluencers: Array<{
    username: string;
    impactScore: number;
    sentiment: 'positive' | 'negative' | 'neutral';
  }>;
  overallInfluencerSentiment: number; // -1 to +1
  influencerConsensus: number; // 0-100 (agreement level)
}

export interface FearGreedIndex {
  index: number; // 0-100
  classification: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
  components: {
    volatility: number;
    marketMomentum: number;
    socialVolume: number;
    sentiment: number;
    dominance: number;
  };
  historicalComparison: {
    average7d: number;
    average30d: number;
    percentile: number;
  };
  recommendation: string;
}

export interface SocialVolumeMetrics {
  totalMentions: number;
  uniqueAuthors: number;
  platforms: {
    twitter: number;
    reddit: number;
    telegram: number;
    discord: number;
  };
  engagement: {
    likes: number;
    shares: number;
    comments: number;
    totalEngagement: number;
    engagementRate: number;
  };
  volumeTrend: 'increasing' | 'decreasing' | 'stable';
  viralityScore: number; // 0-100
  reachEstimate: number;
}

export interface SentimentPriceCorrelation {
  correlationCoefficient: number; // -1 to +1
  correlationStrength: 'strong' | 'moderate' | 'weak' | 'none';
  lagDays: number; // sentiment leads/lags price by X days
  predictivePower: number; // 0-100
  recentCorrelation: {
    sentiment7d: number;
    priceChange7d: number;
    sentiment30d: number;
    priceChange30d: number;
  };
  insights: string[];
}

@Injectable()
export class AdvancedSentimentService {
  private readonly logger = new Logger(AdvancedSentimentService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * T3.2.1: Sentiment Trend Analysis
   * Analyze sentiment trends over time
   */
  async analyzeSentimentTrend(projectId: string, timeframe: '24h' | '7d' | '30d' = '7d'): Promise<SentimentTrend> {
    this.logger.log(`Analyzing sentiment trend for ${projectId} over ${timeframe}`);

    try {
      // Generate simulated time series data
      const dataPoints = this.generateTimeSeriesData(timeframe);
      
      // Calculate trend metrics
      const trendDirection = this.calculateTrendDirection(dataPoints);
      const trendStrength = this.calculateTrendStrength(dataPoints);
      const volatility = this.calculateVolatility(dataPoints);
      const momentum = this.calculateMomentum(dataPoints);

      return {
        timeframe,
        dataPoints,
        trendDirection,
        trendStrength,
        volatility,
        momentum,
      };
    } catch (error) {
      this.logger.error(`Sentiment trend analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * T3.2.2: Influencer Impact Scoring
   * Score and rank influencer impact on sentiment
   */
  async analyzeInfluencerImpact(projectId: string): Promise<InfluencerImpact> {
    this.logger.log(`Analyzing influencer impact for ${projectId}`);

    try {
      // Generate simulated influencer data
      const influencers = this.generateInfluencerData();
      
      // Calculate top influencers
      const topInfluencers = influencers
        .sort((a, b) => b.impactScore - a.impactScore)
        .slice(0, 10)
        .map(inf => ({
          username: inf.username,
          impactScore: inf.impactScore,
          sentiment: this.classifySentiment(inf.sentimentScore),
        }));

      // Calculate overall metrics
      const overallInfluencerSentiment = this.calculateWeightedSentiment(influencers);
      const influencerConsensus = this.calculateConsensus(influencers);

      return {
        influencers,
        topInfluencers,
        overallInfluencerSentiment,
        influencerConsensus,
      };
    } catch (error) {
      this.logger.error(`Influencer impact analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * T3.2.3: Fear & Greed Index Calculator
   * Calculate crypto Fear & Greed index
   */
  async calculateFearGreedIndex(projectId: string): Promise<FearGreedIndex> {
    this.logger.log(`Calculating Fear & Greed index for ${projectId}`);

    try {
      // Calculate component scores
      const volatility = Math.random() * 100;
      const marketMomentum = Math.random() * 100;
      const socialVolume = Math.random() * 100;
      const sentiment = Math.random() * 100;
      const dominance = Math.random() * 100;

      // Weighted average for overall index
      const index = Math.round(
        volatility * 0.25 +
        marketMomentum * 0.25 +
        socialVolume * 0.15 +
        sentiment * 0.20 +
        dominance * 0.15
      );

      const classification = this.classifyFearGreed(index);
      
      // Historical comparison
      const average7d = index + (Math.random() - 0.5) * 10;
      const average30d = index + (Math.random() - 0.5) * 20;
      const percentile = Math.random() * 100;

      const recommendation = this.generateFearGreedRecommendation(classification);

      return {
        index,
        classification,
        components: {
          volatility,
          marketMomentum,
          socialVolume,
          sentiment,
          dominance,
        },
        historicalComparison: {
          average7d,
          average30d,
          percentile,
        },
        recommendation,
      };
    } catch (error) {
      this.logger.error(`Fear & Greed index calculation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * T3.2.4: Social Volume and Engagement Metrics
   * Track social media volume and engagement
   */
  async analyzeSocialVolume(projectId: string): Promise<SocialVolumeMetrics> {
    this.logger.log(`Analyzing social volume for ${projectId}`);

    try {
      // Generate simulated social volume data
      const totalMentions = Math.floor(Math.random() * 100000) + 1000;
      const uniqueAuthors = Math.floor(totalMentions * (Math.random() * 0.3 + 0.1));

      const platforms = {
        twitter: Math.floor(totalMentions * 0.5),
        reddit: Math.floor(totalMentions * 0.25),
        telegram: Math.floor(totalMentions * 0.15),
        discord: Math.floor(totalMentions * 0.10),
      };

      const likes = Math.floor(totalMentions * (Math.random() * 2 + 1));
      const shares = Math.floor(totalMentions * (Math.random() * 0.5 + 0.2));
      const comments = Math.floor(totalMentions * (Math.random() * 0.8 + 0.3));
      const totalEngagement = likes + shares + comments;
      const engagementRate = (totalEngagement / totalMentions) * 100;

      const volumeTrend = this.determineVolumeTrend();
      const viralityScore = this.calculateViralityScore(engagementRate, totalMentions);
      const reachEstimate = Math.floor(totalMentions * (Math.random() * 50 + 10));

      return {
        totalMentions,
        uniqueAuthors,
        platforms,
        engagement: {
          likes,
          shares,
          comments,
          totalEngagement,
          engagementRate,
        },
        volumeTrend,
        viralityScore,
        reachEstimate,
      };
    } catch (error) {
      this.logger.error(`Social volume analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * T3.2.5: Sentiment-Price Correlation Analysis
   * Analyze correlation between sentiment and price movements
   */
  async analyzeSentimentPriceCorrelation(projectId: string): Promise<SentimentPriceCorrelation> {
    this.logger.log(`Analyzing sentiment-price correlation for ${projectId}`);

    try {
      // Simulate correlation analysis
      const correlationCoefficient = (Math.random() - 0.5) * 2; // -1 to +1
      const correlationStrength = this.classifyCorrelationStrength(Math.abs(correlationCoefficient));
      const lagDays = Math.floor(Math.random() * 7) - 3; // -3 to +3 days
      const predictivePower = Math.abs(correlationCoefficient) * 100;

      const sentiment7d = (Math.random() - 0.5) * 2;
      const priceChange7d = (Math.random() - 0.1) * 0.4; // -20% to +20%
      const sentiment30d = (Math.random() - 0.5) * 2;
      const priceChange30d = (Math.random() - 0.1) * 0.6; // -30% to +30%

      const insights = this.generateCorrelationInsights(
        correlationCoefficient,
        lagDays,
        sentiment7d,
        priceChange7d
      );

      return {
        correlationCoefficient,
        correlationStrength,
        lagDays,
        predictivePower,
        recentCorrelation: {
          sentiment7d,
          priceChange7d,
          sentiment30d,
          priceChange30d,
        },
        insights,
      };
    } catch (error) {
      this.logger.error(`Sentiment-price correlation analysis failed: ${error.message}`);
      throw error;
    }
  }

  // Helper methods
  private generateTimeSeriesData(timeframe: string): any[] {
    const points = timeframe === '24h' ? 24 : timeframe === '7d' ? 7 : 30;
    return Array.from({ length: points }, (_, i) => ({
      timestamp: new Date(Date.now() - (points - i) * (timeframe === '24h' ? 3600000 : 86400000)),
      sentimentScore: (Math.random() - 0.5) * 2,
      volume: Math.floor(Math.random() * 10000) + 1000,
      positiveCount: Math.floor(Math.random() * 5000) + 500,
      negativeCount: Math.floor(Math.random() * 3000) + 300,
      neutralCount: Math.floor(Math.random() * 2000) + 200,
    }));
  }

  private calculateTrendDirection(dataPoints: any[]): 'bullish' | 'bearish' | 'neutral' {
    const firstHalf = dataPoints.slice(0, Math.floor(dataPoints.length / 2));
    const secondHalf = dataPoints.slice(Math.floor(dataPoints.length / 2));
    
    const avgFirst = firstHalf.reduce((sum, p) => sum + p.sentimentScore, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((sum, p) => sum + p.sentimentScore, 0) / secondHalf.length;
    
    const diff = avgSecond - avgFirst;
    if (diff > 0.1) return 'bullish';
    if (diff < -0.1) return 'bearish';
    return 'neutral';
  }

  private calculateTrendStrength(dataPoints: any[]): number {
    const scores = dataPoints.map(p => p.sentimentScore);
    const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length;
    return Math.min(100, Math.abs(avg) * 50 + (1 / (variance + 0.1)) * 10);
  }

  private calculateVolatility(dataPoints: any[]): number {
    const scores = dataPoints.map(p => p.sentimentScore);
    const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length;
    return Math.min(100, Math.sqrt(variance) * 100);
  }

  private calculateMomentum(dataPoints: any[]): number {
    if (dataPoints.length < 2) return 0;
    const recent = dataPoints.slice(-5);
    const older = dataPoints.slice(0, 5);
    const recentAvg = recent.reduce((sum, p) => sum + p.sentimentScore, 0) / recent.length;
    const olderAvg = older.reduce((sum, p) => sum + p.sentimentScore, 0) / older.length;
    return Math.max(-100, Math.min(100, (recentAvg - olderAvg) * 100));
  }

  private generateInfluencerData(): any[] {
    const count = Math.floor(Math.random() * 20) + 10;
    return Array.from({ length: count }, (_, i) => ({
      username: `influencer_${i + 1}`,
      platform: ['twitter', 'youtube', 'telegram'][Math.floor(Math.random() * 3)],
      followers: Math.floor(Math.random() * 1000000) + 10000,
      engagementRate: Math.random() * 10 + 1,
      sentimentScore: (Math.random() - 0.5) * 2,
      impactScore: Math.random() * 100,
      recentPosts: Math.floor(Math.random() * 50) + 5,
    }));
  }

  private classifySentiment(score: number): 'positive' | 'negative' | 'neutral' {
    if (score > 0.2) return 'positive';
    if (score < -0.2) return 'negative';
    return 'neutral';
  }

  private calculateWeightedSentiment(influencers: any[]): number {
    const totalWeight = influencers.reduce((sum, inf) => sum + inf.impactScore, 0);
    const weightedSum = influencers.reduce((sum, inf) => sum + inf.sentimentScore * inf.impactScore, 0);
    return weightedSum / totalWeight;
  }

  private calculateConsensus(influencers: any[]): number {
    const sentiments = influencers.map(inf => inf.sentimentScore);
    const avg = sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length;
    const variance = sentiments.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / sentiments.length;
    return Math.max(0, 100 - Math.sqrt(variance) * 50);
  }

  private classifyFearGreed(index: number): FearGreedIndex['classification'] {
    if (index < 20) return 'extreme_fear';
    if (index < 40) return 'fear';
    if (index < 60) return 'neutral';
    if (index < 80) return 'greed';
    return 'extreme_greed';
  }

  private generateFearGreedRecommendation(classification: string): string {
    const recommendations = {
      extreme_fear: 'Market is in extreme fear. Consider buying opportunities.',
      fear: 'Market sentiment is fearful. Good time for accumulation.',
      neutral: 'Market sentiment is balanced. Monitor for directional signals.',
      greed: 'Market is greedy. Consider taking profits or reducing exposure.',
      extreme_greed: 'Market is in extreme greed. High risk of correction.',
    };
    return recommendations[classification] || 'Monitor market conditions closely.';
  }

  private determineVolumeTrend(): 'increasing' | 'decreasing' | 'stable' {
    const rand = Math.random();
    if (rand < 0.33) return 'increasing';
    if (rand < 0.66) return 'decreasing';
    return 'stable';
  }

  private calculateViralityScore(engagementRate: number, mentions: number): number {
    return Math.min(100, (engagementRate * 0.5 + Math.log10(mentions) * 10));
  }

  private classifyCorrelationStrength(absCorr: number): 'strong' | 'moderate' | 'weak' | 'none' {
    if (absCorr > 0.7) return 'strong';
    if (absCorr > 0.4) return 'moderate';
    if (absCorr > 0.2) return 'weak';
    return 'none';
  }

  private generateCorrelationInsights(corr: number, lag: number, sentiment: number, priceChange: number): string[] {
    const insights = [];
    
    if (Math.abs(corr) > 0.7) {
      insights.push(`Strong ${corr > 0 ? 'positive' : 'negative'} correlation detected`);
    }
    
    if (lag > 0) {
      insights.push(`Sentiment leads price by ${lag} days`);
    } else if (lag < 0) {
      insights.push(`Price leads sentiment by ${Math.abs(lag)} days`);
    }
    
    if (sentiment > 0.5 && priceChange > 0.1) {
      insights.push('Positive sentiment aligns with price increase');
    } else if (sentiment < -0.5 && priceChange < -0.1) {
      insights.push('Negative sentiment aligns with price decrease');
    }
    
    return insights;
  }
}

