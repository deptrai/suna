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
import { RiskScoringService, TokenRiskData, RiskScore } from './services/risk-scoring.service';
import { TokenAnalysisRequestDto } from './dto/token-analysis-request.dto';
import { TokenAnalysisResponseDto } from './dto/token-analysis-response.dto';
import { DexScreenerService } from '../external-apis/dexscreener.service';
import {
  DexPairAnalysisRequestDto,
  TokenLiquidityAnalysisRequestDto,
  DexTradingAnalysisRequestDto,
  MultiDexComparisonRequestDto
} from './dto/dex-analysis-request.dto';
import {
  RiskScoringRequestDto,
  TokenDataInputDto,
  BulkRiskScoringRequestDto,
  CustomRiskScoringRequestDto
} from './dto/risk-scoring-request.dto';

@ApiTags('onchain')
@Controller('onchain')
export class AnalysisController {
  constructor(
    private readonly analysisService: AnalysisService,
    private readonly tokenAnalysisService: TokenAnalysisService,
    private readonly transactionAnalysisService: TransactionAnalysisService,
    private readonly riskAssessmentService: RiskAssessmentService,
    private readonly riskScoringService: RiskScoringService,
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

  // Story 2.2: Advanced OnChain Analytics
  @Post('analyze/advanced')
  @ApiOperation({
    summary: 'Advanced on-chain analytics',
    description: 'Comprehensive advanced analysis including liquidity, holder distribution, transaction patterns, whale activity, and contract security'
  })
  @ApiResponse({
    status: 200,
    description: 'Advanced analysis completed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        tokenAddress: { type: 'string' },
        chain: { type: 'string' },
        liquidity: {
          type: 'object',
          properties: {
            totalLiquidity: { type: 'number' },
            liquidityPools: { type: 'array' },
            liquidityScore: { type: 'number' },
            poolHealthScore: { type: 'number' },
            warnings: { type: 'array', items: { type: 'string' } }
          }
        },
        holders: {
          type: 'object',
          properties: {
            totalHolders: { type: 'number' },
            top10Percentage: { type: 'number' },
            distributionScore: { type: 'number' },
            giniCoefficient: { type: 'number' },
            warnings: { type: 'array', items: { type: 'string' } }
          }
        },
        transactions: {
          type: 'object',
          properties: {
            totalTransactions24h: { type: 'number' },
            buyTransactions: { type: 'number' },
            sellTransactions: { type: 'number' },
            suspiciousPatterns: { type: 'array', items: { type: 'string' } },
            patternScore: { type: 'number' }
          }
        },
        whales: {
          type: 'object',
          properties: {
            whaleCount: { type: 'number' },
            whaleHoldingsPercentage: { type: 'number' },
            whaleActivityLevel: { type: 'string', enum: ['low', 'moderate', 'high', 'extreme'] },
            riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] }
          }
        },
        security: {
          type: 'object',
          properties: {
            isVerified: { type: 'boolean' },
            securityScore: { type: 'number' },
            vulnerabilities: { type: 'array', items: { type: 'string' } },
            warnings: { type: 'array', items: { type: 'string' } }
          }
        },
        overallRiskScore: { type: 'number' },
        processingTime: { type: 'number' },
        timestamp: { type: 'string' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async analyzeAdvanced(@Body() request: { tokenAddress: string; chain?: string }) {
    return this.analysisService.analyzeAdvanced(request.tokenAddress, request.chain);
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

  // Risk Scoring Endpoints

  @Post('risk/score')
  @ApiOperation({
    summary: 'Calculate comprehensive risk score',
    description: 'Calculate detailed risk score for a token using multiple risk factors'
  })
  @ApiResponse({
    status: 200,
    description: 'Risk score calculated successfully',
    schema: {
      type: 'object',
      properties: {
        overallScore: { type: 'number', description: 'Overall risk score (0-100)' },
        riskCategory: { type: 'string', enum: ['low', 'medium', 'high', 'extreme'] },
        confidence: { type: 'number', description: 'Confidence level (0-1)' },
        factors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              value: { type: 'number' },
              weight: { type: 'number' },
              category: { type: 'string' },
              confidence: { type: 'number' },
              description: { type: 'string' }
            }
          }
        },
        breakdown: {
          type: 'object',
          properties: {
            liquidityRisk: { type: 'number' },
            volatilityRisk: { type: 'number' },
            holderRisk: { type: 'number' },
            marketRisk: { type: 'number' },
            technicalRisk: { type: 'number' }
          }
        },
        recommendations: { type: 'array', items: { type: 'string' } },
        warnings: { type: 'array', items: { type: 'string' } }
      }
    }
  })
  async calculateRiskScore(@Body() request: RiskScoringRequestDto): Promise<RiskScore> {
    // Convert DTO to TokenRiskData format
    const tokenData: TokenRiskData = {
      tokenAddress: request.tokenAddress,
      chainId: request.chainId,
    };

    return this.riskScoringService.calculateRiskScore(tokenData);
  }

  @Post('risk/score/custom')
  @ApiOperation({
    summary: 'Calculate risk score with custom data',
    description: 'Calculate risk score using provided token data and optional custom weights'
  })
  @ApiResponse({
    status: 200,
    description: 'Custom risk score calculated successfully'
  })
  async calculateCustomRiskScore(@Body() request: CustomRiskScoringRequestDto): Promise<RiskScore> {
    const tokenData: TokenRiskData = {
      tokenAddress: request.tokenAddress,
      chainId: request.chainId,
      liquidityUsd: request.liquidityUsd,
      volume24h: request.volume24h,
      priceChange24h: request.priceChange24h,
      priceChange7d: request.priceChange7d,
      marketCap: request.marketCap,
      holders: request.holders,
      topHolderPercentage: request.topHolderPercentage,
      contractAge: request.contractAge,
      isVerified: request.isVerified,
      auditScore: request.auditScore,
      transactionCount24h: request.transactionCount24h,
      uniqueTraders24h: request.uniqueTraders24h,
      liquidityConcentration: request.liquidityConcentration,
      slippageEstimate: request.slippageEstimate,
    };

    return this.riskScoringService.calculateRiskScore(tokenData);
  }

  @Post('risk/score/bulk')
  @ApiOperation({
    summary: 'Calculate risk scores for multiple tokens',
    description: 'Bulk risk scoring for multiple tokens with optional comparison'
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk risk scores calculated successfully',
    schema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tokenAddress: { type: 'string' },
              riskScore: { type: 'object' }
            }
          }
        },
        comparison: {
          type: 'object',
          properties: {
            averageScore: { type: 'number' },
            riskDistribution: { type: 'object' },
            topRisks: { type: 'array' },
            recommendations: { type: 'array' }
          }
        }
      }
    }
  })
  async calculateBulkRiskScores(@Body() request: BulkRiskScoringRequestDto) {
    const results = [];

    for (const tokenInput of request.tokens) {
      const tokenData: TokenRiskData = {
        tokenAddress: tokenInput.tokenAddress,
        chainId: tokenInput.chainId,
        liquidityUsd: tokenInput.liquidityUsd,
        volume24h: tokenInput.volume24h,
        priceChange24h: tokenInput.priceChange24h,
        priceChange7d: tokenInput.priceChange7d,
        marketCap: tokenInput.marketCap,
        holders: tokenInput.holders,
        topHolderPercentage: tokenInput.topHolderPercentage,
        contractAge: tokenInput.contractAge,
        isVerified: tokenInput.isVerified,
        auditScore: tokenInput.auditScore,
        transactionCount24h: tokenInput.transactionCount24h,
        uniqueTraders24h: tokenInput.uniqueTraders24h,
        liquidityConcentration: tokenInput.liquidityConcentration,
        slippageEstimate: tokenInput.slippageEstimate,
      };

      const riskScore = await this.riskScoringService.calculateRiskScore(tokenData);
      results.push({
        tokenAddress: tokenInput.tokenAddress,
        riskScore,
      });
    }

    let comparison = null;
    if (request.includeComparison) {
      const scores = results.map(r => r.riskScore.overallScore);
      const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

      const riskDistribution = {
        low: results.filter(r => r.riskScore.riskCategory === 'low').length,
        medium: results.filter(r => r.riskScore.riskCategory === 'medium').length,
        high: results.filter(r => r.riskScore.riskCategory === 'high').length,
        extreme: results.filter(r => r.riskScore.riskCategory === 'extreme').length,
      };

      const topRisks = results
        .sort((a, b) => b.riskScore.overallScore - a.riskScore.overallScore)
        .slice(0, 3)
        .map(r => ({
          tokenAddress: r.tokenAddress,
          score: r.riskScore.overallScore,
          category: r.riskScore.riskCategory,
        }));

      comparison = {
        averageScore,
        riskDistribution,
        topRisks,
        recommendations: [
          `Average risk score: ${averageScore.toFixed(1)}`,
          `Risk distribution: ${riskDistribution.low} low, ${riskDistribution.medium} medium, ${riskDistribution.high} high, ${riskDistribution.extreme} extreme`,
          'Consider diversification across different risk categories',
        ],
      };
    }

    return {
      results,
      comparison,
    };
  }
}
