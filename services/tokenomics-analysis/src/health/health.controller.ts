/**
 * Health Controller for Tokenomics Analysis
 * Health check endpoints
 */

import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ 
    summary: 'Basic health check',
    description: 'Returns basic service health status'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Service is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', format: 'date-time' },
        uptime: { type: 'number', example: 12345 },
        version: { type: 'string', example: '1.0.0' }
      }
    }
  })
  @ApiResponse({ status: 503, description: 'Service is unhealthy' })
  async check() {
    return this.healthService.getBasicHealth();
  }

  @Get('detailed')
  @ApiOperation({ 
    summary: 'Detailed health check',
    description: 'Returns detailed health status including dependencies'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Detailed health information',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', format: 'date-time' },
        uptime: { type: 'number' },
        version: { type: 'string' },
        dependencies: {
          type: 'object',
          properties: {
            database: { type: 'object' },
            redis: { type: 'object' },
            externalApis: { type: 'object' }
          }
        }
      }
    }
  })
  async detailed() {
    return this.healthService.getDetailedHealth();
  }

  @Get('ready')
  @ApiOperation({ 
    summary: 'Readiness check',
    description: 'Returns readiness status for Kubernetes'
  })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  @ApiResponse({ status: 503, description: 'Service is not ready' })
  async ready() {
    return this.healthService.getReadinessCheck();
  }

  @Get('live')
  @ApiOperation({ 
    summary: 'Liveness check',
    description: 'Returns liveness status for Kubernetes'
  })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  @ApiResponse({ status: 503, description: 'Service is not alive' })
  async live() {
    return this.healthService.getLivenessCheck();
  }
}

