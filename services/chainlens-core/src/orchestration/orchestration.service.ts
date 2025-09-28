import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '../auth/auth.service';
import { LoggerService } from '../common/services/logger.service';
import { MetricsService } from '../metrics/metrics.service';
import { CircuitBreakerService, FallbackStrategy } from './circuit-breaker.service';
import { ServiceClientService } from './service-client.service';
import { ServiceClientFactoryService } from './services/service-client-factory.service';
import { OrchestrationCacheService } from './services/orchestration-cache.service';
import { OrchestrationQueueService } from './services/orchestration-queue.service';
import { AnalysisRequestDto } from '../analysis/dto/analysis-request.dto';
import { OrchestrationCacheOptions } from './interfaces/cache.interfaces';
import { QueueMetrics, QueueHealth, QueueStatistics, JobStatus, JobProgress } from './interfaces/queue.interfaces';

export interface ServiceResponse {
  status: 'success' | 'error' | 'timeout' | 'fallback' | 'circuit_open';
  data: any;
  responseTime: number;
  error?: string;
  serviceName: string;
  retryAttempts?: number;
  fallbackUsed?: boolean;
  circuitBreakerState?: string;
}

export interface ParallelExecutionConfig {
  maxConcurrency: number;
  timeout: number;
  retryAttempts: number;
  failFast: boolean;
  aggregationStrategy: 'all' | 'partial' | 'best_effort';
  requiredServices: string[];
  optionalServices: string[];
}

export interface OrchestrationResult {
  services: Record<string, ServiceResponse>;
  warnings: string[];
  recommendations: string[];
  executionTime: number;
  successRate: number;
  parallelExecutionStats: {
    totalServices: number;
    successfulServices: number;
    failedServices: number;
    timeoutServices: number;
    fallbackServices: number;
    averageResponseTime: number;
  };
}

export interface ServiceExecutionPlan {
  serviceName: string;
  endpoint: string;
  priority: number;
  timeout: number;
  retryAttempts: number;
  dependencies: string[];
  fallbackStrategies: FallbackStrategy<any>[];
  required: boolean;
}

@Injectable()
export class OrchestrationService {
  private readonly serviceEndpoints: Record<string, string>;
  private readonly defaultExecutionConfig: ParallelExecutionConfig;
  private readonly executionQueue: Map<string, Promise<ServiceResponse>> = new Map();

  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
    private metricsService: MetricsService,
    private circuitBreakerService: CircuitBreakerService,
    private serviceClientService: ServiceClientService,
    private serviceClientFactory: ServiceClientFactoryService,
    private orchestrationCacheService: OrchestrationCacheService,
    private orchestrationQueueService: OrchestrationQueueService,
  ) {
    this.serviceEndpoints = {
      onchain: this.configService.get<string>('services.onchain.url', 'http://localhost:3001'),
      sentiment: this.configService.get<string>('services.sentiment.url', 'http://localhost:3002'),
      tokenomics: this.configService.get<string>('services.tokenomics.url', 'http://localhost:3003'),
      team: this.configService.get<string>('services.team.url', 'http://localhost:3004'),
    };

    this.defaultExecutionConfig = {
      maxConcurrency: this.configService.get<number>('orchestration.maxConcurrency', 4),
      timeout: this.configService.get<number>('orchestration.timeout', 30000),
      retryAttempts: this.configService.get<number>('orchestration.retryAttempts', 2),
      failFast: this.configService.get<boolean>('orchestration.failFast', false),
      aggregationStrategy: this.configService.get<'all' | 'partial' | 'best_effort'>('orchestration.aggregationStrategy', 'best_effort'),
      requiredServices: this.configService.get<string[]>('orchestration.requiredServices', ['onchain']),
      optionalServices: this.configService.get<string[]>('orchestration.optionalServices', ['sentiment', 'tokenomics', 'team']),
    };
  }

  async orchestrateAnalysis(
    request: AnalysisRequestDto,
    user: User,
    correlationId: string,
    executionConfig?: Partial<ParallelExecutionConfig>,
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const config = { ...this.defaultExecutionConfig, ...executionConfig };

    this.logger.log('Starting parallel analysis orchestration', {
      projectId: request.projectId,
      correlationId,
      config,
      analysisType: request.analysisType,
      userId: user.id,
    });

    // T1.3.4: Check cache first
    const cacheKey = this.orchestrationCacheService.generateAnalysisKey(
      request.projectId,
      request.analysisType,
      {
        tokenAddress: request.tokenAddress,
        chainId: request.chainId,
        timeframe: request.options?.timeframe,
        includeHistorical: request.options?.includeHistorical,
        enableDetailedAnalysis: request.options?.enableDetailedAnalysis,
        userId: user.id,
      },
    );

    // Try to get cached result
    const cachedResult = await this.orchestrationCacheService.getCachedAnalysisResult<OrchestrationResult>(
      cacheKey,
      'orchestration',
    );

    if (cachedResult) {
      this.logger.log('Returning cached analysis result', {
        projectId: request.projectId,
        cacheKey,
        responseTime: cachedResult.responseTime,
        correlationId,
      });

      return cachedResult.data;
    }

    // Determine which services to call based on analysis type
    const servicesToCall = this.determineServicesToCall(request.analysisType);
    
    // Prepare service requests
    const serviceRequests = servicesToCall.map(serviceName => ({
      serviceName,
      request: this.prepareServiceRequest(serviceName, request, correlationId),
    }));

    // Execute services in parallel with circuit breaker protection
    const servicePromises = serviceRequests.map(({ serviceName, request: serviceRequest }) =>
      this.executeServiceWithCircuitBreaker(serviceName, serviceRequest, correlationId)
    );

    const serviceResults = await Promise.allSettled(servicePromises);

    // Process results
    const services: Record<string, ServiceResponse> = {};
    const warnings: string[] = [];
    const recommendations: string[] = [];

    serviceResults.forEach((result, index) => {
      const serviceName = serviceRequests[index].serviceName;
      
      if (result.status === 'fulfilled') {
        services[serviceName] = result.value;
        
        // Extract warnings and recommendations from service response
        if (result.value.data?.warnings) {
          warnings.push(...result.value.data.warnings);
        }
        if (result.value.data?.recommendations) {
          recommendations.push(...result.value.data.recommendations);
        }
      } else {
        services[serviceName] = {
          status: 'error',
          data: null,
          responseTime: 0,
          error: result.reason?.message || 'Service failed',
          serviceName,
        };
        
        warnings.push(`${serviceName}_service_unavailable`);
      }
    });

    // Add global recommendations based on service results
    const globalRecommendations = this.generateGlobalRecommendations(services);
    recommendations.push(...globalRecommendations);

    const totalTime = Date.now() - startTime;
    
    this.logger.log('Analysis orchestration completed', {
      projectId: request.projectId,
      userId: user.id,
      totalTime,
      successfulServices: Object.values(services).filter(s => s.status === 'success').length,
      totalServices: Object.keys(services).length,
      correlationId,
    });

    const totalServices = Object.keys(services).length;
    const successfulServices = Object.values(services).filter(s => s.status === 'success').length;
    const successRate = totalServices > 0 ? successfulServices / totalServices : 0;
    const averageResponseTime = totalServices > 0
      ? Object.values(services).reduce((sum, s) => sum + s.responseTime, 0) / totalServices
      : 0;

    const result: OrchestrationResult = {
      services,
      warnings: [...new Set(warnings)], // Remove duplicates
      recommendations: [...new Set(recommendations)], // Remove duplicates
      executionTime: Date.now() - startTime,
      successRate,
      parallelExecutionStats: {
        totalServices,
        successfulServices,
        failedServices: totalServices - successfulServices,
        timeoutServices: Object.values(services).filter(s => s.status === 'timeout').length,
        fallbackServices: Object.values(services).filter(s => s.status === 'fallback').length,
        averageResponseTime,
      },
    };

    // T1.3.4: Cache the result based on success rate and confidence
    const cacheOptions: OrchestrationCacheOptions = {
      confidence: successRate, // Use success rate as confidence
      analysisType: request.analysisType,
      tags: [
        `project:${request.projectId}`,
        `analysis:${request.analysisType}`,
        `user:${user.id}`,
      ],
    };

    // Cache the result asynchronously (don't wait for it)
    this.orchestrationCacheService.cacheAnalysisResult(cacheKey, result, cacheOptions)
      .catch(error => {
        this.logger.error('Failed to cache analysis result', error.stack, 'OrchestrationService', {
          cacheKey,
          projectId: request.projectId,
        });
      });

    return result;
  }

  private determineServicesToCall(analysisType: string): string[] {
    switch (analysisType) {
      case 'full':
        return ['onchain', 'sentiment', 'tokenomics', 'team'];
      case 'onchain':
        return ['onchain'];
      case 'sentiment':
        return ['sentiment'];
      case 'tokenomics':
        return ['tokenomics'];
      case 'team':
        return ['team'];
      default:
        return ['onchain', 'sentiment', 'tokenomics', 'team'];
    }
  }

  private prepareServiceRequest(
    serviceName: string,
    request: AnalysisRequestDto,
    correlationId: string,
  ): any {
    const baseRequest = {
      projectId: request.projectId,
      correlationId,
    };

    switch (serviceName) {
      case 'onchain':
        return {
          ...baseRequest,
          tokenAddress: request.tokenAddress,
          chainId: request.chainId || 1,
          timeframe: request.options?.timeframe || '24h',
          includeHistorical: request.options?.includeHistorical || false,
        };
      
      case 'sentiment':
        return {
          ...baseRequest,
          keywords: [request.projectId, `$${request.projectId.toUpperCase()}`],
          timeframe: request.options?.timeframe || '24h',
          sources: ['twitter', 'reddit', 'news'],
        };
      
      case 'tokenomics':
        return {
          ...baseRequest,
          tokenAddress: request.tokenAddress,
          protocolName: request.projectId,
          includeDefi: true,
        };
      
      case 'team':
        return {
          ...baseRequest,
          projectWebsite: `https://${request.projectId}.org`,
          githubOrg: request.projectId,
          includeBackground: request.options?.enableDetailedAnalysis || false,
        };
      
      default:
        return baseRequest;
    }
  }

  private async executeServiceWithCircuitBreaker(
    serviceName: string,
    request: any,
    correlationId: string,
  ): Promise<ServiceResponse> {
    const startTime = Date.now();
    
    try {
      const result = await this.circuitBreakerService.executeWithBreaker(
        serviceName,
        () => this.serviceClientService.callService(serviceName, '/analyze', request, correlationId)
      );

      const responseTime = Date.now() - startTime;
      
      // Record metrics
      this.metricsService.recordExternalApiCall(
        serviceName,
        '/analyze',
        200,
        responseTime,
        true,
      );

      return {
        status: 'success',
        data: result,
        responseTime,
        serviceName,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error(`Service ${serviceName} failed`, error.stack, 'OrchestrationService', {
        serviceName,
        correlationId,
        responseTime,
      });

      // Record metrics
      this.metricsService.recordExternalApiCall(
        serviceName,
        '/analyze',
        error.status || 500,
        responseTime,
        false,
      );

      return {
        status: error.name === 'TimeoutError' ? 'timeout' : 'error',
        data: null,
        responseTime,
        error: error.message,
        serviceName,
      };
    }
  }

  private generateGlobalRecommendations(services: Record<string, ServiceResponse>): string[] {
    const recommendations: string[] = [];
    
    // Check overall service health
    const successfulServices = Object.values(services).filter(s => s.status === 'success').length;
    const totalServices = Object.keys(services).length;
    const successRate = successfulServices / totalServices;
    
    if (successRate < 0.5) {
      recommendations.push('limited_data_availability');
    }
    
    // Check for high response times
    const avgResponseTime = Object.values(services)
      .filter(s => s.status === 'success')
      .reduce((sum, s) => sum + s.responseTime, 0) / successfulServices;
    
    if (avgResponseTime > 5000) {
      recommendations.push('slow_data_processing');
    }
    
    // Check for specific service combinations
    if (services.onchain?.status === 'success' && services.sentiment?.status === 'success') {
      const onchainScore = services.onchain.data?.riskScore || 50;
      const sentimentScore = (services.sentiment.data?.overallSentiment || 0) * 100;
      
      if (onchainScore < 30 && sentimentScore > 70) {
        recommendations.push('positive_sentiment_despite_risk');
      }
      
      if (onchainScore > 70 && sentimentScore < 30) {
        recommendations.push('negative_sentiment_despite_fundamentals');
      }
    }

    return recommendations;
  }

  /**
   * T1.3.4: Cache management methods
   */

  /**
   * Warm cache for popular projects
   */
  async warmCacheForPopularProjects(): Promise<void> {
    const popularProjects = this.configService.get<string[]>('cache.warming.popularTokens', [
      'bitcoin', 'ethereum', 'binancecoin', 'cardano', 'solana',
    ]);

    await this.orchestrationCacheService.warmCache(popularProjects, ['full', 'onchain']);
  }

  /**
   * Get cache statistics
   */
  async getCacheStatistics() {
    return this.orchestrationCacheService.getCacheStatistics();
  }

  /**
   * Invalidate cache for a project
   */
  async invalidateProjectCache(projectId: string, reason: string = 'manual') {
    await this.orchestrationCacheService.invalidateProjectCache(projectId, reason);
  }

  /**
   * Get cache health status
   */
  async getCacheHealth() {
    return this.orchestrationCacheService.healthCheck();
  }

  /**
   * Get cache performance report
   */
  getCachePerformanceReport() {
    return this.orchestrationCacheService.getPerformanceReport();
  }

  // ===== T1.3.5: Queue Management Methods =====

  /**
   * T1.3.5a: Queue orchestration request for high load scenarios
   */
  async queueAnalysis(
    request: AnalysisRequestDto,
    user: User,
    correlationId: string,
  ): Promise<string> {
    this.logger.log('Queueing analysis request', {
      projectId: request.projectId,
      analysisType: request.analysisType,
      userId: user.id,
      userTier: user.tier,
      correlationId,
    });

    const jobId = await this.orchestrationQueueService.addJob(
      request,
      user,
      correlationId,
    );

    this.logger.log('Analysis request queued successfully', {
      jobId,
      projectId: request.projectId,
      userId: user.id,
      correlationId,
    });

    return jobId;
  }

  /**
   * Get job status and progress
   */
  async getJobStatus(jobId: string): Promise<{ status: JobStatus; progress?: JobProgress }> {
    const result = await this.orchestrationQueueService.getJobStatus(jobId);
    return {
      status: result.status,
      progress: result.progress,
    };
  }

  /**
   * T1.3.5b: Get queue metrics for monitoring
   */
  getQueueMetrics(): QueueMetrics {
    return this.orchestrationQueueService.getMetrics();
  }

  /**
   * T1.3.5b: Get queue health status
   */
  async getQueueHealth(): Promise<QueueHealth> {
    return this.orchestrationQueueService.getHealth();
  }

  /**
   * T1.3.5b: Get queue statistics for reporting
   */
  async getQueueStatistics(): Promise<QueueStatistics> {
    return this.orchestrationQueueService.getStatistics();
  }

  /**
   * T1.3.5b: Get dead letter queue entries
   */
  getDeadLetterQueue() {
    return this.orchestrationQueueService.getDeadLetterQueue();
  }

  /**
   * T1.3.5b: Retry job from dead letter queue
   */
  async retryDeadLetterJob(jobId: string): Promise<boolean> {
    return this.orchestrationQueueService.retryDeadLetterJob(jobId);
  }

  /**
   * Pause queue processing
   */
  async pauseQueue(): Promise<void> {
    await this.orchestrationQueueService.pauseQueue();
  }

  /**
   * Resume queue processing
   */
  async resumeQueue(): Promise<void> {
    await this.orchestrationQueueService.resumeQueue();
  }

  /**
   * Clean completed and failed jobs
   */
  async cleanQueue(): Promise<void> {
    await this.orchestrationQueueService.cleanQueue();
  }
}
