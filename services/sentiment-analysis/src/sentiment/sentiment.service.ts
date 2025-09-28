import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { MetricsService } from '../metrics/metrics.service';
import * as vader from 'vader-sentiment';
import * as sentiment from 'sentiment';
import * as natural from 'natural';
const compromise = require('compromise');
const emojiRegex = require('emoji-regex');
import { detect as detectLanguage } from 'langdetect';

export interface TextPreprocessingResult {
  originalText: string;
  cleanedText: string;
  normalizedText: string;
  language: string;
  emojis: string[];
  slangTerms: string[];
  tokens: string[];
  entities: any[];
  confidence: number;
}

export interface SentimentAnalysisResult {
  text: string;
  originalText: string;
  source: string;
  score: number;
  sentiment: string;
  confidence: number;
  breakdown: {
    vader: any;
    fallback: any;
    compromise: any;
  };
  preprocessing: TextPreprocessingResult;
  biasDetection: {
    hasBias: boolean;
    biasType: string[];
    correctedScore: number;
  };
  timestamp: string;
}

export interface AggregatedSentiment {
  symbol: string;
  overallSentiment: number;
  weightedSentiment: number;
  sources: {
    twitter: { score: number; weight: number; count: number };
    reddit: { score: number; weight: number; count: number };
    news: { score: number; weight: number; count: number };
  };
  confidence: number;
  timeDecayFactor: number;
  outliers: any[];
  lastUpdated: string;
}

@Injectable()
export class SentimentService implements OnModuleInit {
  private readonly logger = new Logger(SentimentService.name);
  private isInitialized = false;

  // T3.1.5a: Text preprocessing - Emoji and slang handling
  private readonly cryptoSlangMap = new Map<string, string>([
    ['hodl', 'hold'],
    ['fud', 'fear uncertainty doubt'],
    ['fomo', 'fear of missing out'],
    ['rekt', 'wrecked'],
    ['moon', 'price increase'],
    ['lambo', 'luxury car wealth'],
    ['diamond hands', 'strong hold'],
    ['paper hands', 'weak sell'],
    ['ape', 'buy aggressively'],
    ['degen', 'degenerate trader'],
    ['wagmi', 'we are going to make it'],
    ['ngmi', 'not going to make it'],
    ['gm', 'good morning'],
    ['gn', 'good night'],
    ['ser', 'sir'],
    ['anon', 'anonymous'],
    ['cope', 'deal with loss'],
    ['shill', 'promote aggressively'],
    ['pump', 'price increase'],
    ['dump', 'price decrease'],
  ]);

  private readonly emojiSentimentMap = new Map<string, number>([
    ['😀', 0.8], ['😃', 0.8], ['😄', 0.9], ['😁', 0.7], ['😆', 0.6],
    ['😅', 0.5], ['🤣', 0.7], ['😂', 0.8], ['🙂', 0.4], ['😉', 0.3],
    ['😊', 0.7], ['😇', 0.8], ['🥰', 0.9], ['😍', 0.9], ['🤩', 0.8],
    ['😘', 0.6], ['😗', 0.4], ['😚', 0.5], ['😙', 0.4], ['🥲', 0.2],
    ['😋', 0.6], ['😛', 0.4], ['😜', 0.5], ['🤪', 0.3], ['😝', 0.4],
    ['🤑', 0.7], ['🤗', 0.6], ['🤭', 0.3], ['🤫', 0.1], ['🤔', 0.0],
    ['😐', 0.0], ['😑', -0.1], ['😶', 0.0], ['😏', 0.2], ['😒', -0.3],
    ['🙄', -0.4], ['😬', -0.2], ['🤥', -0.5], ['😔', -0.6], ['😕', -0.4],
    ['🙁', -0.5], ['☹️', -0.6], ['😣', -0.5], ['😖', -0.6], ['😫', -0.7],
    ['😩', -0.6], ['🥺', -0.3], ['😢', -0.7], ['😭', -0.8], ['😤', -0.4],
    ['😠', -0.7], ['😡', -0.8], ['🤬', -0.9], ['🤯', -0.3], ['😳', -0.2],
    ['🥵', -0.4], ['🥶', -0.4], ['😱', -0.6], ['😨', -0.7], ['😰', -0.6],
    ['😥', -0.5], ['😓', -0.4], ['🤗', 0.6], ['🚀', 0.8], ['🌙', 0.7],
    ['💎', 0.8], ['🙌', 0.7], ['👍', 0.6], ['👎', -0.6], ['💪', 0.7],
    ['🔥', 0.6], ['⚡', 0.5], ['💰', 0.8], ['💸', -0.5], ['📈', 0.8],
    ['📉', -0.8], ['🎯', 0.6], ['⭐', 0.5], ['✨', 0.4], ['🎉', 0.8],
  ]);

  constructor(
    private readonly cacheService: CacheService,
    private readonly metricsService: MetricsService,
  ) {}

  async onModuleInit() {
    await this.initializeSentimentEngine();
  }

  private async initializeSentimentEngine() {
    try {
      // Initialize NLP models and sentiment analyzers
      this.logger.log('Initializing sentiment analysis engine...');

      // Test VADER sentiment analyzer
      const testResult = vader.SentimentIntensityAnalyzer.polarity_scores('test positive sentiment');
      if (testResult) {
        this.logger.log('VADER sentiment analyzer initialized successfully');
      }

      // Test compromise NLP
      const testDoc = compromise('test natural language processing');
      if (testDoc) {
        this.logger.log('Compromise NLP library initialized successfully');
      }

      this.isInitialized = true;
      this.logger.log('Sentiment analysis engine initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize sentiment engine:', error);
      this.metricsService.incrementErrors('sentiment_engine', 'initialization');
    }
  }

  // T3.1.5a: Text preprocessing - Text cleaning and normalization
  async preprocessText(text: string): Promise<TextPreprocessingResult> {
    const startTime = Date.now();

    try {
      this.logger.debug(`Preprocessing text: ${text.substring(0, 100)}...`);

      // Language detection
      let language = 'en';
      try {
        const detectedLang = detectLanguage(text);
        language = detectedLang[0]?.lang || 'en';
      } catch (error) {
        this.logger.debug('Language detection failed, defaulting to English');
      }

      // Extract emojis
      const emojis = this.extractEmojis(text);

      // Extract and normalize slang terms
      const slangTerms = this.extractSlangTerms(text);
      let normalizedText = this.normalizeSlang(text);

      // Clean text
      let cleanedText = this.cleanText(normalizedText);

      // Tokenization and entity extraction using compromise
      const doc = compromise(cleanedText);
      const tokens = doc.terms().out('array');
      const entities = this.extractEntities(doc);

      // Calculate preprocessing confidence
      const confidence = this.calculatePreprocessingConfidence(text, cleanedText, language, tokens);

      const result: TextPreprocessingResult = {
        originalText: text,
        cleanedText,
        normalizedText,
        language,
        emojis,
        slangTerms,
        tokens,
        entities,
        confidence,
      };

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.recordApiResponseTime('sentiment', 'preprocessing', duration);

      return result;
    } catch (error) {
      this.logger.error('Error preprocessing text:', error);
      this.metricsService.incrementErrors('sentiment_analysis', 'preprocessing');
      throw error;
    }
  }

  // T3.1.5a: Emoji and slang handling
  private extractEmojis(text: string): string[] {
    const regex = emojiRegex();
    const emojis: string[] = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
      emojis.push(match[0]);
    }

    return [...new Set(emojis)]; // Remove duplicates
  }

  private extractSlangTerms(text: string): string[] {
    const words = text.toLowerCase().split(/\s+/);
    const slangTerms: string[] = [];

    words.forEach(word => {
      const cleanWord = word.replace(/[^\w]/g, '');
      if (this.cryptoSlangMap.has(cleanWord)) {
        slangTerms.push(cleanWord);
      }
    });

    return [...new Set(slangTerms)];
  }

  private normalizeSlang(text: string): string {
    let normalizedText = text;

    this.cryptoSlangMap.forEach((replacement, slang) => {
      const regex = new RegExp(`\\b${slang}\\b`, 'gi');
      normalizedText = normalizedText.replace(regex, replacement);
    });

    return normalizedText;
  }

  private cleanText(text: string): string {
    return text
      // Remove URLs
      .replace(/https?:\/\/[^\s]+/g, '')
      // Remove mentions and hashtags (but keep the text)
      .replace(/[@#](\w+)/g, '$1')
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      // Remove special characters but keep punctuation
      .replace(/[^\w\s!?.,;:'"()-]/g, '')
      // Normalize case
      .toLowerCase()
      .trim();
  }

  private extractEntities(doc: any): any[] {
    try {
      return [
        ...doc.people().out('array').map((name: string) => ({ type: 'person', value: name })),
        ...doc.places().out('array').map((place: string) => ({ type: 'place', value: place })),
        ...doc.organizations().out('array').map((org: string) => ({ type: 'organization', value: org })),
        ...doc.money().out('array').map((money: string) => ({ type: 'money', value: money })),
        ...doc.dates().out('array').map((date: string) => ({ type: 'date', value: date })),
      ];
    } catch (error) {
      this.logger.debug('Entity extraction failed:', error);
      return [];
    }
  }

  private calculatePreprocessingConfidence(
    originalText: string,
    cleanedText: string,
    language: string,
    tokens: string[]
  ): number {
    let confidence = 0.5; // Base confidence

    // Language confidence
    if (language === 'en') confidence += 0.2;
    else if (['es', 'fr', 'de', 'it'].includes(language)) confidence += 0.1;

    // Text length confidence
    if (cleanedText.length > 50) confidence += 0.1;
    if (cleanedText.length > 100) confidence += 0.1;

    // Token count confidence
    if (tokens.length > 5) confidence += 0.1;
    if (tokens.length > 10) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  // T3.1.5b: Multi-model sentiment analysis
  async analyzeSentiment(text: string, source: string = 'manual'): Promise<SentimentAnalysisResult> {
    const startTime = Date.now();

    if (!this.isInitialized) {
      throw new Error('Sentiment engine not initialized');
    }

    try {
      this.logger.debug(`Analyzing sentiment for text from ${source}`);

      // T3.1.5a: Text preprocessing
      const preprocessing = await this.preprocessText(text);

      // T3.1.5b: Multi-model sentiment analysis
      const sentimentResults = await this.performMultiModelAnalysis(preprocessing.cleanedText, preprocessing.emojis);

      // T3.1.5b: Confidence scoring
      const confidence = this.calculateSentimentConfidence(sentimentResults, preprocessing);

      // T3.1.5b: Bias detection and correction
      const biasDetection = this.detectAndCorrectBias(sentimentResults, source, preprocessing);

      const result: SentimentAnalysisResult = {
        text: preprocessing.cleanedText,
        originalText: text,
        source,
        score: biasDetection.correctedScore,
        sentiment: this.categorizeSentiment(biasDetection.correctedScore),
        confidence,
        breakdown: sentimentResults,
        preprocessing,
        biasDetection,
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

  private async performMultiModelAnalysis(text: string, emojis: string[]): Promise<any> {
    // VADER sentiment analysis (primary)
    const vaderResult = vader.SentimentIntensityAnalyzer.polarity_scores(text);

    // Fallback sentiment analysis
    const sentimentAnalyzer = new sentiment();
    const fallbackResult = sentimentAnalyzer.analyze(text);

    // Compromise-based sentiment analysis
    const doc = compromise(text);
    const compromiseResult = this.analyzeWithCompromise(doc);

    // Emoji sentiment analysis
    const emojiSentiment = this.analyzeEmojiSentiment(emojis);

    return {
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
        positive: fallbackResult.positive,
        negative: fallbackResult.negative,
      },
      compromise: compromiseResult,
      emoji: emojiSentiment,
    };
  }

  private analyzeWithCompromise(doc: any): any {
    try {
      // Extract sentiment-bearing words
      const adjectives = doc.adjectives().out('array');
      const verbs = doc.verbs().out('array');

      // Simple sentiment scoring based on word types
      let score = 0;
      let wordCount = 0;

      // Analyze adjectives (usually carry sentiment)
      adjectives.forEach((adj: string) => {
        const sentimentScore = this.getWordSentiment(adj);
        score += sentimentScore;
        wordCount++;
      });

      // Analyze verbs (action sentiment)
      verbs.forEach((verb: string) => {
        const sentimentScore = this.getWordSentiment(verb) * 0.5; // Lower weight for verbs
        score += sentimentScore;
        wordCount++;
      });

      const averageScore = wordCount > 0 ? score / wordCount : 0;

      return {
        score: averageScore,
        adjectives,
        verbs,
        wordCount,
      };
    } catch (error) {
      this.logger.debug('Compromise analysis failed:', error);
      return { score: 0, adjectives: [], verbs: [], wordCount: 0 };
    }
  }

  private analyzeEmojiSentiment(emojis: string[]): any {
    if (emojis.length === 0) {
      return { score: 0, count: 0, breakdown: [] };
    }

    let totalScore = 0;
    const breakdown: { emoji: string; score: number }[] = [];

    emojis.forEach(emoji => {
      const score = this.emojiSentimentMap.get(emoji) || 0;
      totalScore += score;
      breakdown.push({ emoji, score });
    });

    return {
      score: totalScore / emojis.length,
      count: emojis.length,
      breakdown,
    };
  }

  private getWordSentiment(word: string): number {
    // Simple word sentiment scoring (can be enhanced with word embeddings)
    const positiveWords = [
      'good', 'great', 'excellent', 'amazing', 'awesome', 'fantastic', 'wonderful',
      'bull', 'bullish', 'moon', 'rocket', 'diamond', 'strong', 'buy', 'hold',
      'profit', 'gain', 'rise', 'up', 'high', 'positive', 'optimistic'
    ];

    const negativeWords = [
      'bad', 'terrible', 'awful', 'horrible', 'disappointing', 'weak', 'poor',
      'bear', 'bearish', 'crash', 'dump', 'sell', 'loss', 'fall', 'down',
      'low', 'negative', 'pessimistic', 'scam', 'fraud', 'risk', 'danger'
    ];

    const lowerWord = word.toLowerCase();

    if (positiveWords.includes(lowerWord)) return 0.5;
    if (negativeWords.includes(lowerWord)) return -0.5;

    return 0;
  }

  // T3.1.5b: Confidence scoring
  private calculateSentimentConfidence(sentimentResults: any, preprocessing: TextPreprocessingResult): number {
    let confidence = 0.3; // Base confidence

    // Model agreement confidence
    const scores = [
      sentimentResults.vader.compound,
      sentimentResults.fallback.comparative,
      sentimentResults.compromise.score,
      sentimentResults.emoji.score,
    ].filter(score => !isNaN(score) && score !== 0);

    if (scores.length > 1) {
      const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
      const agreement = Math.max(0, 1 - variance); // Lower variance = higher agreement
      confidence += agreement * 0.3;
    }

    // Text quality confidence
    confidence += preprocessing.confidence * 0.2;

    // VADER confidence (VADER provides its own confidence measure)
    const vaderConfidence = Math.abs(sentimentResults.vader.compound);
    confidence += vaderConfidence * 0.2;

    // Token count confidence
    if (preprocessing.tokens.length > 5) confidence += 0.1;
    if (preprocessing.tokens.length > 15) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  // T3.1.5b: Bias detection and correction
  private detectAndCorrectBias(sentimentResults: any, source: string, preprocessing: TextPreprocessingResult): any {
    let hasBias = false;
    const biasTypes: string[] = [];
    let correctedScore = sentimentResults.vader.compound;

    // Source bias detection
    const sourceBias = this.detectSourceBias(source);
    if (sourceBias.hasBias) {
      hasBias = true;
      biasTypes.push(`source_${sourceBias.type}`);
      correctedScore = this.applySourceBiasCorrection(correctedScore, sourceBias);
    }

    // Length bias detection (very short or very long texts)
    const lengthBias = this.detectLengthBias(preprocessing.originalText);
    if (lengthBias.hasBias) {
      hasBias = true;
      biasTypes.push('length');
      correctedScore = this.applyLengthBiasCorrection(correctedScore, lengthBias);
    }

    // Emoji bias detection (emoji-heavy content)
    const emojiBias = this.detectEmojiBias(preprocessing.emojis, preprocessing.tokens);
    if (emojiBias.hasBias) {
      hasBias = true;
      biasTypes.push('emoji');
      correctedScore = this.applyEmojiBiasCorrection(correctedScore, emojiBias, sentimentResults.emoji);
    }

    // Slang bias detection
    const slangBias = this.detectSlangBias(preprocessing.slangTerms, preprocessing.tokens);
    if (slangBias.hasBias) {
      hasBias = true;
      biasTypes.push('slang');
      correctedScore = this.applySlangBiasCorrection(correctedScore, slangBias);
    }

    return {
      hasBias,
      biasType: biasTypes,
      correctedScore: Math.max(-1, Math.min(1, correctedScore)), // Clamp to [-1, 1]
    };
  }

  private detectSourceBias(source: string): { hasBias: boolean; type: string; factor: number } {
    const sourceBiasMap: { [key: string]: { type: string; factor: number } } = {
      'twitter': { type: 'social_media', factor: 0.1 }, // Twitter tends to be more emotional
      'reddit': { type: 'social_media', factor: 0.05 }, // Reddit is more discussion-based
      'news': { type: 'media', factor: -0.05 }, // News tends to be more neutral
      'manual': { type: 'user_input', factor: 0.0 }, // No bias for manual input
    };

    const bias = sourceBiasMap[source] || { type: 'unknown', factor: 0.0 };
    return {
      hasBias: Math.abs(bias.factor) > 0,
      type: bias.type,
      factor: bias.factor,
    };
  }

  private detectLengthBias(text: string): { hasBias: boolean; factor: number } {
    const length = text.length;

    if (length < 20) {
      return { hasBias: true, factor: 0.1 }; // Short texts tend to be more extreme
    } else if (length > 500) {
      return { hasBias: true, factor: -0.05 }; // Long texts tend to be more neutral
    }

    return { hasBias: false, factor: 0.0 };
  }

  private detectEmojiBias(emojis: string[], tokens: string[]): { hasBias: boolean; factor: number } {
    if (emojis.length === 0) return { hasBias: false, factor: 0.0 };

    const emojiRatio = emojis.length / Math.max(tokens.length, 1);

    if (emojiRatio > 0.2) {
      return { hasBias: true, factor: 0.15 }; // Emoji-heavy content tends to be more emotional
    }

    return { hasBias: false, factor: 0.0 };
  }

  private detectSlangBias(slangTerms: string[], tokens: string[]): { hasBias: boolean; factor: number } {
    if (slangTerms.length === 0) return { hasBias: false, factor: 0.0 };

    const slangRatio = slangTerms.length / Math.max(tokens.length, 1);

    if (slangRatio > 0.1) {
      return { hasBias: true, factor: 0.1 }; // Slang-heavy content tends to be more informal/emotional
    }

    return { hasBias: false, factor: 0.0 };
  }

  private applySourceBiasCorrection(score: number, bias: any): number {
    // Apply source-specific correction
    return score - (score * bias.factor);
  }

  private applyLengthBiasCorrection(score: number, bias: any): number {
    // Moderate extreme scores for very short/long texts
    return score * (1 - Math.abs(bias.factor));
  }

  private applyEmojiBiasCorrection(score: number, bias: any, emojiSentiment: any): number {
    // Balance text sentiment with emoji sentiment
    const emojiWeight = Math.min(bias.factor, 0.3);
    return score * (1 - emojiWeight) + emojiSentiment.score * emojiWeight;
  }

  private applySlangBiasCorrection(score: number, bias: any): number {
    // Moderate scores for slang-heavy content
    return score * (1 - bias.factor);
  }

  // T3.1.5c: Aggregation and weighting - Source-weighted aggregation
  async getSymbolSentiment(symbol: string): Promise<AggregatedSentiment> {
    const startTime = Date.now();

    try {
      this.logger.log(`Getting aggregated sentiment for symbol: ${symbol}`);

      // Check cache first
      const cacheKey = `sentiment:aggregated:${symbol}`;
      const cached = await this.cacheService.get(cacheKey);
      if (cached) {
        this.metricsService.incrementCacheHits('sentiment');
        return cached as AggregatedSentiment;
      }

      this.metricsService.incrementCacheMisses('sentiment');

      // Get sentiment data from all sources
      const [twitterSentiment, redditSentiment, newsSentiment] = await Promise.all([
        this.getSourceSentiment(symbol, 'twitter'),
        this.getSourceSentiment(symbol, 'reddit'),
        this.getSourceSentiment(symbol, 'news'),
      ]);

      // T3.1.5c: Source-weighted aggregation
      const aggregatedResult = this.aggregateSourceSentiments({
        twitter: twitterSentiment,
        reddit: redditSentiment,
        news: newsSentiment,
      });

      // T3.1.5c: Time-decay factors
      const timeDecayFactor = this.calculateTimeDecayFactor();

      // T3.1.5c: Outlier detection
      const outliers = this.detectOutliers([twitterSentiment, redditSentiment, newsSentiment]);

      const result: AggregatedSentiment = {
        symbol,
        overallSentiment: aggregatedResult.weightedScore,
        weightedSentiment: aggregatedResult.weightedScore * timeDecayFactor,
        sources: {
          twitter: {
            score: twitterSentiment.score,
            weight: twitterSentiment.weight,
            count: twitterSentiment.count,
          },
          reddit: {
            score: redditSentiment.score,
            weight: redditSentiment.weight,
            count: redditSentiment.count,
          },
          news: {
            score: newsSentiment.score,
            weight: newsSentiment.weight,
            count: newsSentiment.count,
          },
        },
        confidence: aggregatedResult.confidence,
        timeDecayFactor,
        outliers,
        lastUpdated: new Date().toISOString(),
      };

      // Cache the result for 30 minutes
      await this.cacheService.set(cacheKey, result, 1800);

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('sentiment', 'aggregated', 'success');
      this.metricsService.recordApiResponseTime('sentiment', 'aggregated', duration);

      return result;
    } catch (error) {
      this.logger.error(`Error getting sentiment for symbol ${symbol}:`, error);
      this.metricsService.incrementApiRequests('sentiment', 'aggregated', 'error');
      this.metricsService.incrementErrors('symbol_sentiment', 'aggregation');
      throw error;
    }
  }

  private async getSourceSentiment(symbol: string, source: string): Promise<any> {
    try {
      // Get recent sentiment data from cache or generate mock data
      const cacheKey = `sentiment:source:${source}:${symbol}`;
      const cached = await this.cacheService.get(cacheKey);

      if (cached) {
        return cached;
      }

      // Mock sentiment data (in real implementation, this would fetch from actual sources)
      const mockData = {
        score: (Math.random() - 0.5) * 2, // Random score between -1 and 1
        weight: this.getSourceWeight(source),
        count: Math.floor(Math.random() * 100) + 10,
        confidence: Math.random() * 0.5 + 0.5,
        timestamp: new Date().toISOString(),
      };

      // Cache for 10 minutes
      await this.cacheService.set(cacheKey, mockData, 600);

      return mockData;
    } catch (error) {
      this.logger.warn(`Failed to get ${source} sentiment for ${symbol}:`, error);
      return {
        score: 0,
        weight: this.getSourceWeight(source),
        count: 0,
        confidence: 0,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private getSourceWeight(source: string): number {
    const sourceWeights: { [key: string]: number } = {
      'twitter': 0.3,  // High volume, real-time, but noisy
      'reddit': 0.4,   // Good discussion quality, community-driven
      'news': 0.3,     // Professional analysis, but slower
    };

    return sourceWeights[source] || 0.1;
  }

  private aggregateSourceSentiments(sources: any): any {
    const validSources = Object.entries(sources).filter(([_, data]: [string, any]) =>
      data && typeof data.score === 'number' && !isNaN(data.score)
    );

    if (validSources.length === 0) {
      return { weightedScore: 0, confidence: 0 };
    }

    let totalWeightedScore = 0;
    let totalWeight = 0;
    let totalConfidence = 0;

    validSources.forEach(([source, data]: [string, any]) => {
      const weight = data.weight * data.confidence; // Weight by confidence
      totalWeightedScore += data.score * weight;
      totalWeight += weight;
      totalConfidence += data.confidence;
    });

    const weightedScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
    const averageConfidence = totalConfidence / validSources.length;

    return {
      weightedScore,
      confidence: averageConfidence,
    };
  }

  // T3.1.5c: Time-decay factors
  private calculateTimeDecayFactor(): number {
    // Simple time decay: sentiment becomes less relevant over time
    // In real implementation, this would consider actual timestamps
    const hoursOld = Math.random() * 24; // Mock: 0-24 hours old
    const decayRate = 0.1; // 10% decay per hour
    return Math.max(0.1, 1 - (hoursOld * decayRate));
  }

  // T3.1.5c: Outlier detection
  private detectOutliers(sentimentData: any[]): any[] {
    const scores = sentimentData
      .filter(data => data && typeof data.score === 'number')
      .map(data => data.score);

    if (scores.length < 2) return [];

    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const stdDev = Math.sqrt(
      scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length
    );

    const outliers: any[] = [];
    const threshold = 2; // 2 standard deviations

    sentimentData.forEach((data, index) => {
      if (data && typeof data.score === 'number') {
        const zScore = Math.abs(data.score - mean) / stdDev;
        if (zScore > threshold) {
          outliers.push({
            source: ['twitter', 'reddit', 'news'][index],
            score: data.score,
            zScore,
            deviation: data.score - mean,
          });
        }
      }
    });

    return outliers;
  }

  // Utility methods
  private categorizeSentiment(score: number): string {
    if (score > 0.1) return 'positive';
    if (score < -0.1) return 'negative';
    return 'neutral';
  }

  // Advanced sentiment analysis methods
  async analyzeBatchSentiment(texts: string[], source: string = 'batch'): Promise<SentimentAnalysisResult[]> {
    const startTime = Date.now();

    try {
      this.logger.log(`Analyzing batch sentiment for ${texts.length} texts from ${source}`);

      const results = await Promise.all(
        texts.map(text => this.analyzeSentiment(text, source))
      );

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('sentiment', 'batch', 'success');
      this.metricsService.recordApiResponseTime('sentiment', 'batch', duration);

      return results;
    } catch (error) {
      this.logger.error('Error analyzing batch sentiment:', error);
      this.metricsService.incrementApiRequests('sentiment', 'batch', 'error');
      this.metricsService.incrementErrors('sentiment_analysis', 'batch');
      throw error;
    }
  }

  async getRealtimeSentiment(symbol: string, timeWindow: number = 3600): Promise<any> {
    const startTime = Date.now();

    try {
      this.logger.log(`Getting real-time sentiment for ${symbol} (${timeWindow}s window)`);

      const cacheKey = `sentiment:realtime:${symbol}:${timeWindow}`;
      const cached = await this.cacheService.get(cacheKey);

      if (cached) {
        this.metricsService.incrementCacheHits('sentiment_realtime');
        return cached;
      }

      // Get recent sentiment data
      const aggregatedSentiment = await this.getSymbolSentiment(symbol);

      // Calculate trend (mock implementation)
      const trend = this.calculateSentimentTrend(aggregatedSentiment);

      const result = {
        symbol,
        currentSentiment: aggregatedSentiment.overallSentiment,
        trend: trend.direction,
        trendStrength: trend.strength,
        volatility: trend.volatility,
        timeWindow,
        sources: aggregatedSentiment.sources,
        confidence: aggregatedSentiment.confidence,
        lastUpdated: new Date().toISOString(),
      };

      // Cache for 5 minutes (real-time data)
      await this.cacheService.set(cacheKey, result, 300);

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('sentiment', 'realtime', 'success');
      this.metricsService.recordApiResponseTime('sentiment', 'realtime', duration);
      this.metricsService.incrementCacheMisses('sentiment_realtime');

      return result;
    } catch (error) {
      this.logger.error(`Error getting real-time sentiment for ${symbol}:`, error);
      this.metricsService.incrementApiRequests('sentiment', 'realtime', 'error');
      this.metricsService.incrementErrors('sentiment_analysis', 'realtime');
      throw error;
    }
  }

  private calculateSentimentTrend(sentiment: AggregatedSentiment): any {
    // Mock trend calculation (in real implementation, this would analyze historical data)
    const currentScore = sentiment.overallSentiment;
    const previousScore = currentScore + (Math.random() - 0.5) * 0.4; // Mock previous score

    const change = currentScore - previousScore;
    const direction = change > 0.05 ? 'bullish' : change < -0.05 ? 'bearish' : 'neutral';
    const strength = Math.abs(change);
    const volatility = Math.random() * 0.5; // Mock volatility

    return {
      direction,
      strength,
      volatility,
      change,
    };
  }

  async getHealthStatus(): Promise<{ status: string; details?: any }> {
    try {
      const details = {
        initialized: this.isInitialized,
        slangTermsLoaded: this.cryptoSlangMap.size,
        emojiMappingsLoaded: this.emojiSentimentMap.size,
        lastCheck: new Date().toISOString(),
      };

      // Test sentiment analysis
      if (this.isInitialized) {
        const testResult = await this.analyzeSentiment('test positive sentiment', 'health_check');
        details['testAnalysis'] = {
          score: testResult.score,
          sentiment: testResult.sentiment,
          confidence: testResult.confidence,
        };
      }

      return {
        status: this.isInitialized ? 'healthy' : 'unhealthy',
        details,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error.message }
      };
    }
  }

  // Cross-platform sentiment aggregation
  async getCrossPlatformSentiment(symbol: string): Promise<any> {
    const startTime = Date.now();

    try {
      this.logger.log(`Getting cross-platform sentiment for ${symbol}`);

      const cacheKey = `sentiment:cross_platform:${symbol}`;
      const cached = await this.cacheService.get(cacheKey);

      if (cached) {
        this.metricsService.incrementCacheHits('sentiment_cross_platform');
        return cached;
      }

      // Get sentiment from all platforms
      const [symbolSentiment, realtimeSentiment] = await Promise.all([
        this.getSymbolSentiment(symbol),
        this.getRealtimeSentiment(symbol),
      ]);

      const result = {
        symbol,
        aggregated: symbolSentiment,
        realtime: realtimeSentiment,
        crossPlatformScore: (symbolSentiment.overallSentiment + realtimeSentiment.currentSentiment) / 2,
        consensus: this.calculateConsensus(symbolSentiment, realtimeSentiment),
        lastUpdated: new Date().toISOString(),
      };

      // Cache for 15 minutes
      await this.cacheService.set(cacheKey, result, 900);

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('sentiment', 'cross_platform', 'success');
      this.metricsService.recordApiResponseTime('sentiment', 'cross_platform', duration);
      this.metricsService.incrementCacheMisses('sentiment_cross_platform');

      return result;
    } catch (error) {
      this.logger.error(`Error getting cross-platform sentiment for ${symbol}:`, error);
      this.metricsService.incrementApiRequests('sentiment', 'cross_platform', 'error');
      this.metricsService.incrementErrors('sentiment_analysis', 'cross_platform');
      throw error;
    }
  }

  private calculateConsensus(aggregated: AggregatedSentiment, realtime: any): any {
    const scores = [
      aggregated.sources.twitter.score,
      aggregated.sources.reddit.score,
      aggregated.sources.news.score,
      realtime.currentSentiment,
    ].filter(score => !isNaN(score));

    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    const consensus = Math.max(0, 1 - variance); // Lower variance = higher consensus

    return {
      score: mean,
      strength: consensus,
      agreement: consensus > 0.7 ? 'high' : consensus > 0.4 ? 'medium' : 'low',
    };
  }
}
