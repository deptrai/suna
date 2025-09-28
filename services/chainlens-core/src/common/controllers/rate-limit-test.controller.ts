import {
  Controller,
  Get,
  Post,
  UseGuards,
  Request,
  Query,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { RateLimitGuard } from '../guards/rate-limit.guard';
import { RateLimitMetricsService } from '../services/rate-limit-metrics.service';
import { RateLimit, StrictRateLimit, ModerateRateLimit } from '../decorators/rate-limit.decorator';
import { RequireAccess } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserContext } from '../../auth/interfaces/user-context.interface';

@ApiTags('Rate Limiting')
@Controller('rate-limit')
@UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard)
@ApiBearerAuth()
export class RateLimitTestController {
  constructor(
    private rateLimitMetricsService: RateLimitMetricsService,
  ) {}

  @Get('test/normal')
  @ApiOperation({ summary: 'Test normal rate limiting (tier-based)' })
  @ApiResponse({ status: 200, description: 'Request successful' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async testNormalRateLimit(@CurrentUser() user: UserContext) {
    return {
      success: true,
      data: {
        message: 'Normal rate limit test successful',
        userTier: user.tier,
        timestamp: new Date().toISOString(),
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };
  }

  @Get('test/strict')
  @StrictRateLimit() // 5 requests per minute
  @ApiOperation({ summary: 'Test strict rate limiting (5 requests/minute)' })
  @ApiResponse({ status: 200, description: 'Request successful' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async testStrictRateLimit(@CurrentUser() user: UserContext) {
    return {
      success: true,
      data: {
        message: 'Strict rate limit test successful',
        userTier: user.tier,
        limit: '5 requests per minute',
        timestamp: new Date().toISOString(),
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };
  }

  @Get('test/moderate')
  @ModerateRateLimit() // 30 requests per minute
  @ApiOperation({ summary: 'Test moderate rate limiting (30 requests/minute)' })
  @ApiResponse({ status: 200, description: 'Request successful' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async testModerateRateLimit(@CurrentUser() user: UserContext) {
    return {
      success: true,
      data: {
        message: 'Moderate rate limit test successful',
        userTier: user.tier,
        limit: '30 requests per minute',
        timestamp: new Date().toISOString(),
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };
  }

  @Get('test/custom')
  @RateLimit({ requests: 3, windowMs: 30000 }) // 3 requests per 30 seconds
  @ApiOperation({ summary: 'Test custom rate limiting (3 requests/30 seconds)' })
  @ApiResponse({ status: 200, description: 'Request successful' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async testCustomRateLimit(@CurrentUser() user: UserContext) {
    return {
      success: true,
      data: {
        message: 'Custom rate limit test successful',
        userTier: user.tier,
        limit: '3 requests per 30 seconds',
        timestamp: new Date().toISOString(),
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };
  }

  @Get('metrics')
  @RequireAccess({ roles: ['admin'] })
  @ApiOperation({ summary: 'Get rate limiting metrics' })
  @ApiQuery({ name: 'timeRange', enum: ['hour', 'day'], required: false })
  @ApiResponse({ status: 200, description: 'Rate limiting metrics retrieved' })
  async getRateLimitMetrics(
    @Query('timeRange') timeRange: 'hour' | 'day' = 'hour',
  ) {
    const metrics = await this.rateLimitMetricsService.getRateLimitMetrics(timeRange);
    
    return {
      success: true,
      data: {
        metrics,
        timeRange,
        timestamp: new Date().toISOString(),
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };
  }

  @Get('user/:userId/stats')
  @RequireAccess({ roles: ['admin'] })
  @ApiOperation({ summary: 'Get user rate limit statistics' })
  @ApiResponse({ status: 200, description: 'User rate limit stats retrieved' })
  @ApiResponse({ status: 404, description: 'User stats not found' })
  async getUserRateLimitStats(@Param('userId') userId: string) {
    const stats = await this.rateLimitMetricsService.getUserRateLimitStats(userId);
    
    if (!stats) {
      return {
        success: false,
        error: {
          code: 'USER_STATS_NOT_FOUND',
          message: 'Rate limit statistics not found for this user',
        },
        meta: {
          timestamp: new Date().toISOString(),
          version: '1.0',
        },
      };
    }
    
    return {
      success: true,
      data: {
        stats,
        timestamp: new Date().toISOString(),
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };
  }

  @Get('users/near-limit')
  @RequireAccess({ roles: ['admin'] })
  @ApiOperation({ summary: 'Get users approaching their rate limits' })
  @ApiQuery({ name: 'threshold', type: 'number', required: false, description: 'Usage percentage threshold (default: 80)' })
  @ApiResponse({ status: 200, description: 'Users near limit retrieved' })
  async getUsersNearLimit(
    @Query('threshold') threshold: number = 80,
  ) {
    const users = await this.rateLimitMetricsService.getUsersNearLimit(threshold);
    
    return {
      success: true,
      data: {
        users,
        threshold,
        count: users.length,
        timestamp: new Date().toISOString(),
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };
  }

  @Get('my-stats')
  @ApiOperation({ summary: 'Get current user rate limit statistics' })
  @ApiResponse({ status: 200, description: 'Current user rate limit stats retrieved' })
  async getMyRateLimitStats(@CurrentUser() user: UserContext) {
    const stats = await this.rateLimitMetricsService.getUserRateLimitStats(user.id);
    
    return {
      success: true,
      data: {
        stats: stats || {
          userId: user.id,
          tier: user.tier,
          totalRequests: 0,
          blockedRequests: 0,
          lastRequest: null,
          currentWindowUsage: 0,
          currentWindowLimit: 0,
          usagePercentage: 0,
        },
        timestamp: new Date().toISOString(),
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };
  }

  @Post('test/burst')
  @ApiOperation({ summary: 'Test burst requests (for testing rate limiting)' })
  @ApiResponse({ status: 200, description: 'Burst test completed' })
  async testBurstRequests(@CurrentUser() user: UserContext) {
    // This endpoint can be called multiple times quickly to test rate limiting
    return {
      success: true,
      data: {
        message: 'Burst request successful',
        userTier: user.tier,
        requestTime: new Date().toISOString(),
        note: 'Call this endpoint multiple times quickly to test rate limiting',
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };
  }
}
