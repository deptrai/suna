/**
 * T2.1.1a: Analysis Controller
 * Main analysis endpoints (placeholder for T2.1.2+)
 */

import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AnalysisService } from './analysis.service';
import { TokenAnalysisService } from './services/token-analysis.service';
import { TransactionAnalysisService, TransactionAnalysisRequest, TransactionAnalysisResponse } from './services/transaction-analysis.service';
import { TokenAnalysisRequestDto } from './dto/token-analysis-request.dto';
import { TokenAnalysisResponseDto } from './dto/token-analysis-response.dto';

@ApiTags('onchain')
@Controller('onchain')
export class AnalysisController {
  constructor(
    private readonly analysisService: AnalysisService,
    private readonly tokenAnalysisService: TokenAnalysisService,
    private readonly transactionAnalysisService: TransactionAnalysisService,
  ) {}

  @Post('analyze')
  @ApiOperation({
    summary: 'Analyze token on-chain data',
    description: 'Performs comprehensive on-chain analysis for a given token using Moralis API'
  })
  @ApiResponse({
    status: 200,
    description: 'Analysis completed successfully',
    type: TokenAnalysisResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async analyze(@Body() request: TokenAnalysisRequestDto): Promise<TokenAnalysisResponseDto> {
    return this.tokenAnalysisService.analyzeToken(request);
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

  @Post('transactions/analyze')
  @ApiOperation({
    summary: 'Analyze token transaction patterns',
    description: 'Performs transaction analysis including volume analysis and whale activity detection'
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction analysis completed successfully',
    schema: {
      type: 'object',
      properties: {
        tokenAddress: { type: 'string' },
        chainId: { type: 'string' },
        timeframe: { type: 'string' },
        volumeAnalysis: { type: 'object' },
        whaleActivity: { type: 'object' },
        riskFactors: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'number' },
        analyzedAt: { type: 'string', format: 'date-time' },
        processingTime: { type: 'number' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async analyzeTransactions(@Body() request: TransactionAnalysisRequest): Promise<TransactionAnalysisResponse> {
    return this.transactionAnalysisService.analyzeTransactions(request);
  }
}
