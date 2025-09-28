/**
 * T2.1.1a: Analysis Controller
 * Main analysis endpoints (placeholder for T2.1.2+)
 */

import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AnalysisService } from './analysis.service';
import { TokenAnalysisService } from './services/token-analysis.service';
import { TransactionAnalysisService, TransactionAnalysisRequest, TransactionAnalysisResponse } from './services/transaction-analysis.service';
import { RiskAssessmentService, RiskAssessmentRequest, ComprehensiveRiskAssessment } from './services/risk-assessment.service';
import { TokenAnalysisRequestDto } from './dto/token-analysis-request.dto';
import { TokenAnalysisResponseDto } from './dto/token-analysis-response.dto';
import { DexScreenerService } from '../external-apis/dexscreener.service';
import {
  DexPairAnalysisRequestDto,
  TokenLiquidityAnalysisRequestDto,
  DexTradingAnalysisRequestDto,
  MultiDexComparisonRequestDto
} from './dto/dex-analysis-request.dto';

@ApiTags('onchain')
@Controller('onchain')
export class AnalysisController {
  constructor(
    private readonly analysisService: AnalysisService,
    private readonly tokenAnalysisService: TokenAnalysisService,
    private readonly transactionAnalysisService: TransactionAnalysisService,
    private readonly riskAssessmentService: RiskAssessmentService,
    private readonly dexScreenerService: DexScreenerService,
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

  @Post('risk/assess')
  @ApiOperation({
    summary: 'Comprehensive risk assessment',
    description: 'Performs comprehensive risk assessment including protocol, market, yield, and liquidity risks with cross-chain data'
  })
  @ApiResponse({
    status: 200,
    description: 'Risk assessment completed successfully',
    schema: {
      type: 'object',
      properties: {
        tokenAddress: { type: 'string' },
        chainId: { type: 'string' },
        overallRiskScore: { type: 'number' },
        riskCategory: { type: 'string', enum: ['low', 'medium', 'high', 'extreme'] },
        confidence: { type: 'number' },
        protocolRisk: { type: 'object' },
        marketRisk: { type: 'object' },
        yieldRisk: { type: 'object' },
        liquidityRisk: { type: 'object' },
        keyRiskFactors: { type: 'array', items: { type: 'string' } },
        recommendations: { type: 'array', items: { type: 'string' } },
        warnings: { type: 'array', items: { type: 'string' } },
        crossChainData: { type: 'object' },
        analyzedAt: { type: 'string', format: 'date-time' },
        processingTime: { type: 'number' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async assessRisk(@Body() request: RiskAssessmentRequest): Promise<ComprehensiveRiskAssessment> {
    return this.riskAssessmentService.assessRisk(request);
  }

  // T2.1.4a: DEX Pair Analysis
  @Post('dex/pair/analyze')
  @ApiOperation({
    summary: 'Analyze DEX pair trading data',
    description: 'Comprehensive analysis of DEX pair including price, volume, liquidity, and trading metrics'
  })
  @ApiResponse({
    status: 200,
    description: 'DEX pair analysis completed successfully',
    schema: {
      type: 'object',
      properties: {
        pairAddress: { type: 'string' },
        chainId: { type: 'string' },
        dexId: { type: 'string' },
        baseToken: { type: 'object' },
        quoteToken: { type: 'object' },
        priceData: { type: 'object' },
        volumeData: { type: 'object' },
        liquidityData: { type: 'object' },
        tradingActivity: { type: 'object' },
        riskMetrics: { type: 'object' },
        metadata: { type: 'object' }
      }
    }
  })
  async analyzeDexPair(@Body() request: DexPairAnalysisRequestDto) {
    return this.dexScreenerService.analyzePair(request.pairAddress);
  }

  // T2.1.4b: Token Liquidity Analysis
  @Post('dex/liquidity/analyze')
  @ApiOperation({
    summary: 'Analyze token liquidity across DEXes',
    description: 'Comprehensive liquidity analysis including distribution, concentration risk, and slippage estimation'
  })
  @ApiResponse({
    status: 200,
    description: 'Liquidity analysis completed successfully',
    schema: {
      type: 'object',
      properties: {
        tokenAddress: { type: 'string' },
        chainId: { type: 'string' },
        totalPairs: { type: 'number' },
        totalLiquidityUsd: { type: 'number' },
        liquidityDistribution: { type: 'array' },
        liquidityMetrics: { type: 'object' },
        recommendations: { type: 'array', items: { type: 'string' } },
        warnings: { type: 'array', items: { type: 'string' } }
      }
    }
  })
  async analyzeLiquidity(@Body() request: TokenLiquidityAnalysisRequestDto) {
    return this.dexScreenerService.analyzeLiquidity(request.tokenAddress, request.chainId);
  }

  // T2.1.4a: Get token pairs from DexScreener
  @Post('dex/pairs')
  @ApiOperation({
    summary: 'Get DEX pairs for token',
    description: 'Retrieve all DEX pairs for a given token address'
  })
  @ApiResponse({
    status: 200,
    description: 'DEX pairs retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          chainId: { type: 'string' },
          dexId: { type: 'string' },
          pairAddress: { type: 'string' },
          baseToken: { type: 'object' },
          quoteToken: { type: 'object' },
          priceUsd: { type: 'string' },
          volume: { type: 'object' },
          liquidity: { type: 'object' }
        }
      }
    }
  })
  async getTokenPairs(@Body() request: { tokenAddress: string }) {
    return this.dexScreenerService.getPairsByToken(request.tokenAddress);
  }
}
