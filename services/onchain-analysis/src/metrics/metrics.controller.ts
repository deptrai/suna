/**
 * T2.1.1a: Metrics Controller
 * Prometheus metrics endpoints
 */

import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain')
  @ApiOperation({ 
    summary: 'Get Prometheus metrics',
    description: 'Returns metrics in Prometheus format'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Metrics in Prometheus format',
    content: {
      'text/plain': {
        example: '# HELP onchain_requests_total Total number of requests\n# TYPE onchain_requests_total counter\nonchain_requests_total 42'
      }
    }
  })
  async getMetrics() {
    return this.metricsService.getPrometheusMetrics();
  }

  @Get('json')
  @ApiOperation({ 
    summary: 'Get metrics in JSON format',
    description: 'Returns metrics in JSON format for debugging'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Metrics in JSON format',
    schema: {
      type: 'object',
      properties: {
        requests: { type: 'object' },
        responses: { type: 'object' },
        errors: { type: 'object' },
        performance: { type: 'object' }
      }
    }
  })
  async getJsonMetrics() {
    return this.metricsService.getJsonMetrics();
  }
}
