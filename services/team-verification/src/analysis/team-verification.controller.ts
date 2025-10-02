/**
 * Team Verification Controller
 * REST API endpoints for team background analysis and verification
 */

import { Controller, Post, Body, Get, Param, Logger, HttpStatus, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { TeamVerificationService } from './team-verification.service';
import { TeamVerificationRequestDto } from './dto/team-verification-request.dto';
import { TeamVerificationResponseDto } from './dto/team-verification-response.dto';

@ApiTags('team-verification')
@Controller('team')
export class TeamVerificationController {
  private readonly logger = new Logger(TeamVerificationController.name);

  constructor(
    private readonly teamVerificationService: TeamVerificationService,
  ) {}

  @Post('verify')
  @ApiOperation({ 
    summary: 'Verify team background and credibility',
    description: 'Comprehensive team verification including LinkedIn, GitHub, and social media analysis'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Team verification completed successfully',
    type: TeamVerificationResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async verifyTeam(
    @Body() request: TeamVerificationRequestDto,
  ): Promise<TeamVerificationResponseDto> {
    this.logger.log(`Received team verification request for ${request.projectId}`);

    try {
      const result = await this.teamVerificationService.verifyTeam(request);
      
      this.logger.log(`Team verification completed for ${request.projectId}`, {
        projectId: request.projectId,
        credibilityScore: result.credibilityScore,
        confidence: result.confidence,
      });

      return result;
    } catch (error) {
      this.logger.error(`Team verification failed for ${request.projectId}`, {
        projectId: request.projectId,
        error: error.message,
        stack: error.stack,
      });

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Team verification failed',
          projectId: request.projectId,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('status/:projectId')
  @ApiOperation({ 
    summary: 'Get team verification status',
    description: 'Retrieve the latest team verification for a project'
  })
  @ApiParam({ name: 'projectId', description: 'Project identifier' })
  @ApiResponse({ 
    status: 200, 
    description: 'Team verification status retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async getTeamStatus(
    @Param('projectId') projectId: string,
  ): Promise<any> {
    this.logger.log(`Retrieving team verification status for ${projectId}`);

    try {
      // This would typically query the database for the latest verification
      // For now, return a placeholder response
      return {
        success: true,
        projectId,
        message: 'Team verification status endpoint - implementation pending',
        lastVerification: null,
      };
    } catch (error) {
      this.logger.error(`Failed to retrieve team verification status for ${projectId}`, {
        projectId,
        error: error.message,
      });

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Failed to retrieve team verification status',
          projectId,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('history/:projectId')
  @ApiOperation({ 
    summary: 'Get team verification history',
    description: 'Retrieve historical team verifications for a project'
  })
  @ApiParam({ name: 'projectId', description: 'Project identifier' })
  @ApiResponse({ 
    status: 200, 
    description: 'Team verification history retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async getTeamHistory(
    @Param('projectId') projectId: string,
  ): Promise<any> {
    this.logger.log(`Retrieving team verification history for ${projectId}`);

    try {
      // This would typically query the database for historical verifications
      // For now, return a placeholder response
      return {
        success: true,
        projectId,
        message: 'Team verification history endpoint - implementation pending',
        verifications: [],
      };
    } catch (error) {
      this.logger.error(`Failed to retrieve team verification history for ${projectId}`, {
        projectId,
        error: error.message,
      });

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Failed to retrieve team verification history',
          projectId,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

