import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../../auth/constants/permissions.constants';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserContext } from '../../auth/interfaces/user-context.interface';
import { RateLimitMonitoringService } from '../services/rate-limit-monitoring.service';
import { ApiResponseDto } from '../dto/api-response.dto';

@ApiTags('Rate Limiting')
@Controller('api/v1/rate-limit')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class RateLimitController {
  constructor(
    private rateLimitMonitoringService: RateLimitMonitoringService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get rate limit statistics' })
  @ApiResponse({ status: 200, description: 'Rate limit statistics retrieved successfully' })
  @RequirePermissions(PERMISSIONS.ADMIN.SYSTEM_HEALTH)
  async getRateLimitStats(
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
  ): Promise<ApiResponseDto> {
    try {
      const start = startTime ? new Date(startTime) : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const end = endTime ? new Date(endTime) : new Date();

      if (start >= end) {
        throw new BadRequestException('Start time must be before end time');
      }

      const stats = await this.rateLimitMonitoringService.getRateLimitStats(start, end);

      return {
        success: true,
        data: stats,
        meta: {
          timestamp: new Date().toISOString(),
          version: '1.0',
          period: {
            startTime: start.toISOString(),
            endTime: end.toISOString(),
          },
        },
        errors: [],
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('user/:userId/stats')
  @ApiOperation({ summary: 'Get rate limit statistics for a specific user' })
  @ApiResponse({ status: 200, description: 'User rate limit statistics retrieved successfully' })
  @RequirePermissions(PERMISSIONS.ADMIN.USERS_READ)
  async getUserRateLimitStats(
    @Param('userId') userId: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
  ): Promise<ApiResponseDto> {
    try {
      const start = startTime ? new Date(startTime) : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const end = endTime ? new Date(endTime) : new Date();

      if (start >= end) {
        throw new BadRequestException('Start time must be before end time');
      }

      const stats = await this.rateLimitMonitoringService.getUserRateLimitStats(userId, start, end);

      return {
        success: true,
        data: stats,
        meta: {
          timestamp: new Date().toISOString(),
          version: '1.0',
          userId,
          period: {
            startTime: start.toISOString(),
            endTime: end.toISOString(),
          },
        },
        errors: [],
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('user/current/status')
  @ApiOperation({ summary: 'Get current user rate limit status' })
  @ApiResponse({ status: 200, description: 'Current user rate limit status retrieved successfully' })
  async getCurrentUserStatus(
    @CurrentUser() user: UserContext,
  ): Promise<ApiResponseDto> {
    try {
      const status = await this.rateLimitMonitoringService.getCurrentUserStatus(user.id);

      return {
        success: true,
        data: status,
        meta: {
          timestamp: new Date().toISOString(),
          version: '1.0',
          userId: user.id,
        },
        errors: [],
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('user/:userId/status')
  @ApiOperation({ summary: 'Get rate limit status for a specific user' })
  @ApiResponse({ status: 200, description: 'User rate limit status retrieved successfully' })
  @RequirePermissions(PERMISSIONS.ADMIN.USERS_READ)
  async getUserStatus(
    @Param('userId') userId: string,
  ): Promise<ApiResponseDto> {
    try {
      const status = await this.rateLimitMonitoringService.getCurrentUserStatus(userId);

      return {
        success: true,
        data: status,
        meta: {
          timestamp: new Date().toISOString(),
          version: '1.0',
          userId,
        },
        errors: [],
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('cleanup')
  @ApiOperation({ summary: 'Clean up old rate limit logs' })
  @ApiResponse({ status: 200, description: 'Old logs cleaned up successfully' })
  @RequirePermissions(PERMISSIONS.ADMIN.SYSTEM_MAINTENANCE)
  async cleanupOldLogs(
    @Query('days') days?: string,
  ): Promise<ApiResponseDto> {
    try {
      const olderThanDays = days ? parseInt(days, 10) : 7;
      
      if (olderThanDays < 1 || olderThanDays > 365) {
        throw new BadRequestException('Days must be between 1 and 365');
      }

      const deletedCount = await this.rateLimitMonitoringService.cleanupOldLogs(olderThanDays);

      return {
        success: true,
        data: {
          deletedCount,
          olderThanDays,
          cleanupTime: new Date().toISOString(),
        },
        meta: {
          timestamp: new Date().toISOString(),
          version: '1.0',
        },
        errors: [],
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
