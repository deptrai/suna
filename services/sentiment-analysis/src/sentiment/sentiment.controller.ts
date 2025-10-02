import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SentimentService } from './sentiment.service';
import { AdvancedSentimentService } from '../analysis/advanced-sentiment.service';

@ApiTags('sentiment')
@Controller('sentiment')
export class SentimentController {
  constructor(
    private readonly sentimentService: SentimentService,
    private readonly advancedSentimentService: AdvancedSentimentService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Check sentiment service health' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  getHealth() {
    return { status: 'ok', service: 'sentiment-analysis' };
  }

  @Post('analyze')
  @ApiOperation({ summary: 'Analyze sentiment of text' })
  @ApiResponse({ status: 200, description: 'Sentiment analysis result' })
  async analyzeSentiment(@Body() body: { text: string; source?: string }) {
    return this.sentimentService.analyzeSentiment(body.text, body.source);
  }

  @Get('symbol/:symbol')
  @ApiOperation({ summary: 'Get sentiment for a crypto symbol' })
  @ApiResponse({ status: 200, description: 'Symbol sentiment data' })
  async getSymbolSentiment(@Param('symbol') symbol: string) {
    return this.sentimentService.getSymbolSentiment(symbol);
  }

  // Story 3.2: Advanced Sentiment Analytics

  @Get('trend/:projectId')
  @ApiOperation({ summary: 'Get sentiment trend analysis' })
  @ApiResponse({ status: 200, description: 'Sentiment trend data' })
  async getSentimentTrend(
    @Param('projectId') projectId: string,
    @Query('timeframe') timeframe?: '24h' | '7d' | '30d',
  ) {
    return this.advancedSentimentService.analyzeSentimentTrend(projectId, timeframe);
  }

  @Get('influencers/:projectId')
  @ApiOperation({ summary: 'Get influencer impact analysis' })
  @ApiResponse({ status: 200, description: 'Influencer impact data' })
  async getInfluencerImpact(@Param('projectId') projectId: string) {
    return this.advancedSentimentService.analyzeInfluencerImpact(projectId);
  }

  @Get('fear-greed/:projectId')
  @ApiOperation({ summary: 'Get Fear & Greed index' })
  @ApiResponse({ status: 200, description: 'Fear & Greed index data' })
  async getFearGreedIndex(@Param('projectId') projectId: string) {
    return this.advancedSentimentService.calculateFearGreedIndex(projectId);
  }

  @Get('social-volume/:projectId')
  @ApiOperation({ summary: 'Get social volume metrics' })
  @ApiResponse({ status: 200, description: 'Social volume data' })
  async getSocialVolume(@Param('projectId') projectId: string) {
    return this.advancedSentimentService.analyzeSocialVolume(projectId);
  }

  @Get('correlation/:projectId')
  @ApiOperation({ summary: 'Get sentiment-price correlation' })
  @ApiResponse({ status: 200, description: 'Correlation analysis data' })
  async getSentimentPriceCorrelation(@Param('projectId') projectId: string) {
    return this.advancedSentimentService.analyzeSentimentPriceCorrelation(projectId);
  }
}
