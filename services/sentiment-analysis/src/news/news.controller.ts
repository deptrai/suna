import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { NewsService } from './news.service';

@ApiTags('news')
@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get('health')
  @ApiOperation({ summary: 'Check news service health' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  getHealth() {
    return { status: 'ok', service: 'news' };
  }

  @Post('analyze')
  @ApiOperation({ summary: 'Analyze news sentiment for a query' })
  @ApiResponse({ status: 200, description: 'News sentiment analysis' })
  async analyzeNews(@Body() body: { query: string; sources?: string[] }) {
    return this.newsService.analyzeNewsSentiment(body.query, body.sources);
  }

  @Get('trending')
  @ApiOperation({ summary: 'Get trending crypto news sentiment' })
  @ApiResponse({ status: 200, description: 'Trending news sentiment' })
  async getTrendingNews() {
    return this.newsService.getTrendingNewsSentiment();
  }
}
