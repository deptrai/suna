import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private metricsService: MetricsService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get Prometheus metrics (public endpoint for monitoring)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Prometheus metrics in text format',
    content: {
      'text/plain': {
        schema: {
          type: 'string',
        },
      },
    },
  })
  async getPrometheusMetrics(): Promise<string> {
    return this.metricsService.getPrometheusMetrics();
  }

  @Get('performance')
  @UseGuards(AuthGuard, RolesGuard)
  @RequirePermissions('admin:analytics')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get detailed performance metrics (admin only)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Detailed performance metrics retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async getPerformanceMetrics(): Promise<any> {
    return this.metricsService.getPerformanceMetrics();
  }
}
