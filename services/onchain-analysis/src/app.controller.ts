/**
 * T2.1.1a: OnChain Analysis Service - Main Application Controller
 * Basic service information and root endpoints
 */

import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('service')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ 
    summary: 'Get service information',
    description: 'Returns basic information about the OnChain Analysis Service'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Service information retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        service: { type: 'string', example: 'onchain-analysis' },
        version: { type: 'string', example: '1.0.0' },
        description: { type: 'string', example: 'Blockchain data analysis and risk assessment' },
        status: { type: 'string', example: 'running' },
        timestamp: { type: 'string', format: 'date-time' },
        endpoints: {
          type: 'object',
          properties: {
            health: { type: 'string', example: '/health' },
            metrics: { type: 'string', example: '/metrics' },
            docs: { type: 'string', example: '/api/docs' },
            analyze: { type: 'string', example: '/api/v1/onchain/analyze' }
          }
        }
      }
    }
  })
  getServiceInfo() {
    return this.appService.getServiceInfo();
  }

  @Get('version')
  @ApiOperation({ 
    summary: 'Get service version',
    description: 'Returns the current version of the OnChain Analysis Service'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Service version retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        version: { type: 'string', example: '1.0.0' },
        buildDate: { type: 'string', format: 'date-time' },
        gitCommit: { type: 'string', example: 'abc123def' },
        nodeVersion: { type: 'string', example: '18.17.0' }
      }
    }
  })
  getVersion() {
    return this.appService.getVersion();
  }
}
