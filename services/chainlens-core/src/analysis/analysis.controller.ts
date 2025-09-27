import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

import { AnalysisService } from './analysis.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../auth/auth.service';
import { AnalysisRequestDto } from './dto/analysis-request.dto';
import { AnalysisResponseDto } from './dto/analysis-response.dto';
import { AnalysisStatusDto } from './dto/analysis-status.dto';
import { LoggerService } from '../common/services/logger.service';

@ApiTags('Analysis')
@Controller('analyze')
@UseGuards(ThrottlerGuard, AuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class AnalysisController {
  constructor(
    private readonly analysisService: AnalysisService,
    private readonly logger: LoggerService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('crypto:analyze')
  @ApiOperation({
    summary: 'Request crypto analysis',
    description: 'Initiates a comprehensive cryptocurrency analysis by orchestrating multiple microservices',
  })
  @ApiResponse({
    status: 200,
    description: 'Analysis completed successfully',
    type: AnalysisResponseDto,
  })
  @ApiResponse({
    status: 202,
    description: 'Analysis queued for processing',
    schema: {
      type: 'object',
      properties: {
        analysisId: { type: 'string', format: 'uuid' },
        status: { type: 'string', enum: ['queued', 'processing'] },
        estimatedCompletion: { type: 'number', description: 'Estimated completion time in seconds' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request parameters',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded',
  })
  async requestAnalysis(
    @Body() analysisRequest: AnalysisRequestDto,
    @GetUser() user: User,
    @Request() req: any,
  ): Promise<AnalysisResponseDto | { analysisId: string; status: string; estimatedCompletion: number; message: string }> {
    const startTime = Date.now();
    const correlationId = req.headers['x-correlation-id'] || 'unknown';

    this.logger.log('Analysis request received', {
      projectId: analysisRequest.projectId,
      userId: user.id,
      analysisType: analysisRequest.analysisType,
      correlationId,
    });

    try {
      // Check if analysis can be processed immediately or needs to be queued
      const canProcessImmediately = await this.analysisService.canProcessImmediately(
        analysisRequest,
        user,
      );

      if (canProcessImmediately) {
        // Process analysis immediately
        const result = await this.analysisService.processAnalysis(
          analysisRequest,
          user,
          correlationId,
        );

        const processingTime = Date.now() - startTime;
        this.logger.log('Analysis completed', {
          projectId: analysisRequest.projectId,
          userId: user.id,
          processingTime,
          overallScore: result.overallScore,
          confidence: result.confidence,
          correlationId,
        });

        return result;
      } else {
        // Queue analysis for background processing
        const queueResult = await this.analysisService.queueAnalysis(
          analysisRequest,
          user,
          correlationId,
        );

        this.logger.log('Analysis queued', {
          projectId: analysisRequest.projectId,
          userId: user.id,
          analysisId: queueResult.analysisId,
          estimatedCompletion: queueResult.estimatedCompletion,
          correlationId,
        });

        return {
          analysisId: queueResult.analysisId,
          status: 'queued',
          estimatedCompletion: queueResult.estimatedCompletion,
          message: 'Analysis has been queued for processing. Use the analysis ID to check status.',
        };
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error('Analysis request failed', {
        projectId: analysisRequest.projectId,
        userId: user.id,
        error: error.message,
        processingTime,
        correlationId,
      });
      throw error;
    }
  }

  @Get(':analysisId/status')
  @ApiOperation({
    summary: 'Get analysis status',
    description: 'Retrieves the current status of a queued or processing analysis',
  })
  @ApiParam({
    name: 'analysisId',
    description: 'UUID of the analysis request',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Analysis status retrieved successfully',
    type: AnalysisStatusDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Analysis not found',
  })
  async getAnalysisStatus(
    @Param('analysisId') analysisId: string,
    @Request() req: any,
  ): Promise<AnalysisStatusDto> {
    const user = req.user;
    const correlationId = req.correlationId;

    this.logger.log('Analysis status requested', {
      analysisId,
      userId: user.id,
      correlationId,
    });

    const status = await this.analysisService.getAnalysisStatus(analysisId, user.id);

    this.logger.log('Analysis status retrieved', {
      analysisId,
      userId: user.id,
      status: status.status,
      progress: status.progress,
      correlationId,
    });

    return status;
  }

  @Get('history')
  @ApiOperation({
    summary: 'Get user analysis history',
    description: 'Retrieves the analysis history for the authenticated user',
  })
  @ApiQuery({
    name: 'limit',
    description: 'Maximum number of results to return',
    type: 'number',
    required: false,
    example: 10,
  })
  @ApiQuery({
    name: 'offset',
    description: 'Number of results to skip',
    type: 'number',
    required: false,
    example: 0,
  })
  @ApiQuery({
    name: 'projectId',
    description: 'Filter by specific project ID',
    type: 'string',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Analysis history retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        analyses: {
          type: 'array',
          items: { $ref: '#/components/schemas/AnalysisResponseDto' },
        },
        total: { type: 'number' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
  })
  async getAnalysisHistory(
    @Request() req: any,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
    @Query('projectId') projectId?: string,
  ) {
    const user = req.user;
    const correlationId = req.correlationId;

    this.logger.log('Analysis history requested', {
      userId: user.id,
      limit,
      offset,
      projectId,
      correlationId,
    });

    const history = await this.analysisService.getAnalysisHistory(
      user.id,
      { limit, offset, projectId },
    );

    this.logger.log('Analysis history retrieved', {
      userId: user.id,
      total: history.total,
      returned: history.analyses.length,
      correlationId,
    });

    return history;
  }

  @Get('popular')
  @ApiOperation({
    summary: 'Get popular analysis projects',
    description: 'Retrieves the most frequently analyzed cryptocurrency projects',
  })
  @ApiQuery({
    name: 'limit',
    description: 'Maximum number of results to return',
    type: 'number',
    required: false,
    example: 10,
  })
  @ApiResponse({
    status: 200,
    description: 'Popular projects retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        projects: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              projectId: { type: 'string' },
              analysisCount: { type: 'number' },
              lastAnalysis: { type: 'string', format: 'date-time' },
              averageScore: { type: 'number' },
            },
          },
        },
      },
    },
  })
  async getPopularProjects(
    @Query('limit') limit: number = 10,
    @Request() req: any,
  ) {
    const correlationId = req.correlationId;

    this.logger.log('Popular projects requested', {
      limit,
      correlationId,
    });

    const popularProjects = await this.analysisService.getPopularProjects(limit);

    this.logger.log('Popular projects retrieved', {
      count: popularProjects.projects.length,
      correlationId,
    });

    return popularProjects;
  }
}
