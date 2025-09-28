import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SentimentService } from './sentiment.service';

@ApiTags('sentiment')
@Controller('sentiment')
export class SentimentController {
  constructor(private readonly sentimentService: SentimentService) {}

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
}
