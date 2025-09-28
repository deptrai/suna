/**
 * T2.1.1a: Analysis Controller
 * Main analysis endpoints (placeholder for T2.1.2+)
 */

import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AnalysisService } from './analysis.service';

@ApiTags('onchain')
@Controller('onchain')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post('analyze')
  @ApiOperation({ 
    summary: 'Analyze token on-chain data',
    description: 'Performs comprehensive on-chain analysis for a given token'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Analysis completed successfully',
    schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        tokenAddress: { type: 'string' },
        chainId: { type: 'number' },
        riskScore: { type: 'number' },
        confidence: { type: 'number' },
        analysis: { type: 'object' },
        timestamp: { type: 'string', format: 'date-time' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async analyze(@Body() analysisRequest: any) {
    return this.analysisService.analyzeToken(analysisRequest);
  }

  @Get('status/:projectId')
  @ApiOperation({ 
    summary: 'Get analysis status',
    description: 'Returns the status of an ongoing or completed analysis'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Analysis status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
        progress: { type: 'number' },
        result: { type: 'object', nullable: true },
        error: { type: 'string', nullable: true }
      }
    }
  })
  async getStatus(@Param('projectId') projectId: string) {
    return this.analysisService.getAnalysisStatus(projectId);
  }

  @Get('history/:projectId')
  @ApiOperation({ 
    summary: 'Get analysis history',
    description: 'Returns historical analysis data for a project'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Analysis history retrieved successfully'
  })
  async getHistory(@Param('projectId') projectId: string) {
    return this.analysisService.getAnalysisHistory(projectId);
  }
}
