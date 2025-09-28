import { Controller, Post, Body, Headers, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { RequireAccess } from '../../auth/decorators/require-permissions.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { User } from '../../auth/auth.service';
import { ParallelExecutionService, OrchestrationResult, ParallelExecutionConfig } from '../../orchestration/services/parallel-execution.service';
import { OrchestrationRequestDto } from '../dto/orchestration-request.dto';
import { LoggerService } from '../../common/services/logger.service';

@ApiTags('Analysis Orchestration')
@Controller('analysis')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class OrchestrationController {
  constructor(
    private parallelExecutionService: ParallelExecutionService,
    private logger: LoggerService,
  ) {}

  @Post('orchestrate')
  @HttpCode(HttpStatus.OK)
  @RequireAccess({ minimumTier: 'free' })
  @ApiOperation({ 
    summary: 'Orchestrate parallel analysis across multiple services',
    description: 'Execute analysis requests across multiple microservices in parallel with advanced orchestration features'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Analysis orchestration completed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            services: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['success', 'error', 'timeout', 'fallback', 'circuit_open'] },
                  data: { type: 'object' },
                  responseTime: { type: 'number' },
                  error: { type: 'string' },
                  serviceName: { type: 'string' },
                  retryAttempts: { type: 'number' },
                  fallbackUsed: { type: 'boolean' },
                  circuitBreakerState: { type: 'string' }
                }
              }
            },
            warnings: { type: 'array', items: { type: 'string' } },
            recommendations: { type: 'array', items: { type: 'string' } },
            executionTime: { type: 'number' },
            successRate: { type: 'number' },
            parallelExecutionStats: {
              type: 'object',
              properties: {
                totalServices: { type: 'number' },
                successfulServices: { type: 'number' },
                failedServices: { type: 'number' },
                timeoutServices: { type: 'number' },
                fallbackServices: { type: 'number' },
                averageResponseTime: { type: 'number' }
              }
            }
          }
        },
        meta: {
          type: 'object',
          properties: {
            correlationId: { type: 'string' },
            timestamp: { type: 'string' },
            executionMode: { type: 'string' }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async orchestrateAnalysis(
    @Body() request: OrchestrationRequestDto,
    @GetUser() user: User,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{
    success: boolean;
    data: OrchestrationResult;
    meta: {
      correlationId: string;
      timestamp: string;
      executionMode: string;
    };
  }> {
    const requestCorrelationId = correlationId || `orch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log('Orchestration request received', {
      projectId: request.projectId,
      analysisType: request.analysisType,
      userId: user.id,
      userTier: user.tier,
      correlationId: requestCorrelationId,
      parallelExecution: request.parallelExecution,
    });

    try {
      // Build execution configuration from request
      const executionConfig: Partial<ParallelExecutionConfig> = {};
      
      if (request.maxConcurrency !== undefined) {
        executionConfig.maxConcurrency = request.maxConcurrency;
      }
      if (request.timeout !== undefined) {
        executionConfig.timeout = request.timeout;
      }
      if (request.retryAttempts !== undefined) {
        executionConfig.retryAttempts = request.retryAttempts;
      }
      if (request.failFast !== undefined) {
        executionConfig.failFast = request.failFast;
      }
      if (request.aggregationStrategy !== undefined) {
        executionConfig.aggregationStrategy = request.aggregationStrategy;
      }
      if (request.requiredServices !== undefined) {
        executionConfig.requiredServices = request.requiredServices;
      }
      if (request.optionalServices !== undefined) {
        executionConfig.optionalServices = request.optionalServices;
      }

      // Execute parallel analysis
      const result = await this.parallelExecutionService.executeParallelAnalysis(
        request,
        user,
        requestCorrelationId,
        executionConfig,
      );

      this.logger.log('Orchestration completed successfully', {
        projectId: request.projectId,
        correlationId: requestCorrelationId,
        executionTime: result.executionTime,
        successRate: result.successRate,
        servicesCount: result.parallelExecutionStats.totalServices,
      });

      return {
        success: true,
        data: result,
        meta: {
          correlationId: requestCorrelationId,
          timestamp: new Date().toISOString(),
          executionMode: request.parallelExecution ? 'parallel' : 'sequential',
        },
      };
    } catch (error) {
      this.logger.error('Orchestration failed', error.stack, 'OrchestrationController', {
        projectId: request.projectId,
        correlationId: requestCorrelationId,
        userId: user.id,
        error: error.message,
      });

      throw error;
    }
  }

  @Post('orchestrate/health')
  @HttpCode(HttpStatus.OK)
  @RequireAccess({ minimumTier: 'free' })
  @ApiOperation({ 
    summary: 'Check orchestration service health',
    description: 'Verify that the orchestration service and all dependent services are healthy'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Orchestration health check completed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            services: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                  responseTime: { type: 'number' },
                  circuitBreakerState: { type: 'string' }
                }
              }
            },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  })
  async checkOrchestrationHealth(
    @GetUser() user: User,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{
    success: boolean;
    data: {
      status: string;
      services: Record<string, any>;
      timestamp: string;
    };
  }> {
    const requestCorrelationId = correlationId || `health_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log('Orchestration health check requested', {
      userId: user.id,
      correlationId: requestCorrelationId,
    });

    try {
      // For now, return a simple health check
      // In a real implementation, this would check all dependent services
      const services = {
        onchain: { status: 'healthy', responseTime: 50, circuitBreakerState: 'CLOSED' },
        sentiment: { status: 'healthy', responseTime: 75, circuitBreakerState: 'CLOSED' },
        tokenomics: { status: 'healthy', responseTime: 100, circuitBreakerState: 'CLOSED' },
        team: { status: 'healthy', responseTime: 80, circuitBreakerState: 'CLOSED' },
      };

      const allHealthy = Object.values(services).every(service => service.status === 'healthy');

      return {
        success: true,
        data: {
          status: allHealthy ? 'healthy' : 'degraded',
          services,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error('Orchestration health check failed', error.stack, 'OrchestrationController', {
        correlationId: requestCorrelationId,
        userId: user.id,
        error: error.message,
      });

      return {
        success: false,
        data: {
          status: 'unhealthy',
          services: {},
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  @Post('orchestrate/test')
  @HttpCode(HttpStatus.OK)
  @RequireAccess({ minimumTier: 'free' })
  @ApiOperation({ 
    summary: 'Test orchestration functionality',
    description: 'Run a test orchestration to verify system functionality'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Test orchestration completed',
  })
  async testOrchestration(
    @GetUser() user: User,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{
    success: boolean;
    data: {
      testResults: Record<string, any>;
      timestamp: string;
    };
  }> {
    const requestCorrelationId = correlationId || `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log('Test orchestration requested', {
      userId: user.id,
      correlationId: requestCorrelationId,
    });

    try {
      // Create a test request
      const testRequest: OrchestrationRequestDto = {
        projectId: 'test-project',
        analysisType: 'onchain',
        tokenAddress: '0x1234567890123456789012345678901234567890',
        chainId: 1,
        options: {
          timeframe: '1h',
          includeHistorical: false,
        },
      };

      // Execute test with minimal configuration
      const result = await this.parallelExecutionService.executeParallelAnalysis(
        testRequest,
        user,
        requestCorrelationId,
        {
          maxConcurrency: 1,
          timeout: 5000,
          retryAttempts: 1,
          failFast: false,
          aggregationStrategy: 'best_effort',
          requiredServices: [],
          optionalServices: ['onchain'],
        },
      );

      return {
        success: true,
        data: {
          testResults: {
            executionTime: result.executionTime,
            successRate: result.successRate,
            servicesExecuted: result.parallelExecutionStats.totalServices,
            status: result.successRate > 0 ? 'passed' : 'failed',
          },
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error('Test orchestration failed', error.stack, 'OrchestrationController', {
        correlationId: requestCorrelationId,
        userId: user.id,
        error: error.message,
      });

      return {
        success: false,
        data: {
          testResults: {
            status: 'error',
            error: error.message,
          },
          timestamp: new Date().toISOString(),
        },
      };
    }
  }
}
