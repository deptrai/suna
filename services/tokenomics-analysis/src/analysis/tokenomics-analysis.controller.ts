/**
 * Tokenomics Analysis Controller
 * REST API endpoints for tokenomics analysis
 */

import { Controller, Post, Body, Get, Param, Logger, HttpStatus, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { TokenomicsAnalysisService } from './tokenomics-analysis.service';
import { DeFiProtocolService } from './defi-protocol.service';
import { TokenomicsAnalysisRequestDto } from './dto/tokenomics-analysis-request.dto';
import { TokenomicsAnalysisResponseDto } from './dto/tokenomics-analysis-response.dto';

@ApiTags('tokenomics')
@Controller('tokenomics')
export class TokenomicsAnalysisController {
  private readonly logger = new Logger(TokenomicsAnalysisController.name);

  constructor(
    private readonly tokenomicsAnalysisService: TokenomicsAnalysisService,
    private readonly defiProtocolService: DeFiProtocolService,
  ) {}

  @Post('analyze')
  @ApiOperation({ 
    summary: 'Analyze token economics',
    description: 'Comprehensive tokenomics analysis including supply, distribution, vesting, and inflation'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Tokenomics analysis completed successfully',
    type: TokenomicsAnalysisResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async analyzeTokenomics(
    @Body() request: TokenomicsAnalysisRequestDto,
  ): Promise<TokenomicsAnalysisResponseDto> {
    this.logger.log(`Received tokenomics analysis request for ${request.projectId}`);

    try {
      const result = await this.tokenomicsAnalysisService.analyzeTokenomics(request);
      
      this.logger.log(`Tokenomics analysis completed for ${request.projectId}`, {
        projectId: request.projectId,
        tokenomicsScore: result.tokenomicsScore,
        confidence: result.confidence,
      });

      return result;
    } catch (error) {
      this.logger.error(`Tokenomics analysis failed for ${request.projectId}`, {
        projectId: request.projectId,
        error: error.message,
        stack: error.stack,
      });

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Tokenomics analysis failed',
          projectId: request.projectId,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('status/:projectId')
  @ApiOperation({ 
    summary: 'Get tokenomics analysis status',
    description: 'Retrieve the latest tokenomics analysis for a project'
  })
  @ApiParam({ name: 'projectId', description: 'Project identifier' })
  @ApiResponse({ 
    status: 200, 
    description: 'Tokenomics status retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async getTokenomicsStatus(
    @Param('projectId') projectId: string,
  ): Promise<any> {
    this.logger.log(`Retrieving tokenomics status for ${projectId}`);

    try {
      // This would typically query the database for the latest analysis
      // For now, return a placeholder response
      return {
        success: true,
        projectId,
        message: 'Tokenomics status endpoint - implementation pending',
        lastAnalysis: null,
      };
    } catch (error) {
      this.logger.error(`Failed to retrieve tokenomics status for ${projectId}`, {
        projectId,
        error: error.message,
      });

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Failed to retrieve tokenomics status',
          projectId,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('history/:projectId')
  @ApiOperation({ 
    summary: 'Get tokenomics analysis history',
    description: 'Retrieve historical tokenomics analyses for a project'
  })
  @ApiParam({ name: 'projectId', description: 'Project identifier' })
  @ApiResponse({ 
    status: 200, 
    description: 'Tokenomics history retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async getTokenomicsHistory(
    @Param('projectId') projectId: string,
  ): Promise<any> {
    this.logger.log(`Retrieving tokenomics history for ${projectId}`);

    try {
      // This would typically query the database for historical analyses
      // For now, return a placeholder response
      return {
        success: true,
        projectId,
        message: 'Tokenomics history endpoint - implementation pending',
        analyses: [],
      };
    } catch (error) {
      this.logger.error(`Failed to retrieve tokenomics history for ${projectId}`, {
        projectId,
        error: error.message,
      });

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Failed to retrieve tokenomics history',
          projectId,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Story 4.2: DeFi Protocol Analysis

  @Get('defi/tvl/:protocolId')
  @ApiOperation({ summary: 'Get TVL analysis for DeFi protocol' })
  @ApiResponse({ status: 200, description: 'TVL analysis retrieved successfully' })
  async getTVLAnalysis(@Param('protocolId') protocolId: string) {
    return this.defiProtocolService.analyzeTVL(protocolId);
  }

  @Get('defi/yield/:protocolId')
  @ApiOperation({ summary: 'Get yield sustainability assessment' })
  @ApiResponse({ status: 200, description: 'Yield assessment retrieved successfully' })
  async getYieldSustainability(@Param('protocolId') protocolId: string) {
    return this.defiProtocolService.assessYieldSustainability(protocolId);
  }

  @Get('defi/revenue/:protocolId')
  @ApiOperation({ summary: 'Get protocol revenue analysis' })
  @ApiResponse({ status: 200, description: 'Revenue analysis retrieved successfully' })
  async getProtocolRevenue(@Param('protocolId') protocolId: string) {
    return this.defiProtocolService.analyzeProtocolRevenue(protocolId);
  }

  @Get('defi/governance/:protocolId')
  @ApiOperation({ summary: 'Get governance evaluation' })
  @ApiResponse({ status: 200, description: 'Governance evaluation retrieved successfully' })
  async getGovernanceEvaluation(@Param('protocolId') protocolId: string) {
    return this.defiProtocolService.evaluateGovernance(protocolId);
  }

  @Get('defi/risk/:protocolId')
  @ApiOperation({ summary: 'Get protocol risk assessment' })
  @ApiResponse({ status: 200, description: 'Risk assessment retrieved successfully' })
  async getProtocolRisk(@Param('protocolId') protocolId: string) {
    return this.defiProtocolService.assessProtocolRisk(protocolId);
  }
}

