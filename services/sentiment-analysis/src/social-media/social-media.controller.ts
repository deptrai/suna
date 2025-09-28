import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SocialMediaService } from './social-media.service';

@ApiTags('social')
@Controller('social')
export class SocialMediaController {
  constructor(private readonly socialMediaService: SocialMediaService) {}

  @Get('health')
  @ApiOperation({ summary: 'Check social media service health' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  getHealth() {
    return { status: 'ok', service: 'social-media' };
  }

  @Post('twitter/analyze')
  @ApiOperation({ summary: 'Analyze Twitter sentiment for a query' })
  @ApiResponse({ status: 200, description: 'Twitter sentiment analysis' })
  async analyzeTwitter(@Body() body: { query: string; count?: number }) {
    return this.socialMediaService.analyzeTwitterSentiment(body.query, body.count);
  }

  @Post('reddit/analyze')
  @ApiOperation({ summary: 'Analyze Reddit sentiment for a query' })
  @ApiResponse({ status: 200, description: 'Reddit sentiment analysis' })
  async analyzeReddit(@Body() body: { query: string; subreddit?: string }) {
    return this.socialMediaService.analyzeRedditSentiment(body.query, body.subreddit);
  }
}
