import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '../../auth/auth.service';
import { LoggerService } from '../../common/services/logger.service';
import { MetricsService } from '../../metrics/metrics.service';
import { CircuitBreakerService, FallbackStrategy } from '../circuit-breaker.service';
import { ServiceClientFactoryService } from './service-client-factory.service';
import { AnalysisRequestDto } from '../../analysis/dto/analysis-request.dto';

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
  payload: any;
}

@Injectable()
export class ParallelExecutionService {
  private readonly serviceEndpoints: Record<string, string>;
  private readonly defaultExecutionConfig: ParallelExecutionConfig;
  private readonly executionQueue: Map<string, Promise<ServiceResponse>> = new Map();
  private readonly dependencyGraph: Map<string, string[]> = new Map();

  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
    private metricsService: MetricsService,
    private circuitBreakerService: CircuitBreakerService,
    private serviceClientFactory: ServiceClientFactoryService,
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

    // Initialize dependency graph
    this.initializeDependencyGraph();
  }

  async executeParallelAnalysis(
    request: AnalysisRequestDto,
    user: User,
    correlationId: string,
    executionConfig?: Partial<ParallelExecutionConfig>,
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const config = { ...this.defaultExecutionConfig, ...executionConfig };
    
    this.logger.log('Starting parallel analysis execution', {
      projectId: request.projectId,
      correlationId,
      config,
      userId: user.id,
      userTier: user.tier,
    });

    try {
      // Create execution plan
      const executionPlan = this.createExecutionPlan(request, user, config);
      
      this.logger.log('Execution plan created', {
        totalServices: executionPlan.length,
        requiredServices: executionPlan.filter(p => p.required).length,
        optionalServices: executionPlan.filter(p => !p.required).length,
        correlationId,
      });

      // Execute services in parallel with orchestration
      const result = await this.executeParallelServices(executionPlan, correlationId, config);
      
      const totalTime = Date.now() - startTime;
      result.executionTime = totalTime;

      this.logger.log('Parallel analysis execution completed', {
        projectId: request.projectId,
        totalTime,
        successRate: result.successRate,
        servicesCount: result.parallelExecutionStats.totalServices,
        correlationId,
      });

      // Record metrics
      this.metricsService.recordAnalysis(
        request.projectId,
        'parallel_orchestrated',
        totalTime,
        result.successRate > 0.5, // Consider successful if more than 50% services succeed
        user.id,
        user.tier,
      );

      return result;
    } catch (error) {
      this.logger.error('Parallel analysis execution failed', error.stack, 'ParallelExecutionService', {
        projectId: request.projectId,
        correlationId,
        error: error.message,
      });

      throw error;
    }
  }

  private createExecutionPlan(
    request: AnalysisRequestDto,
    user: User,
    config: ParallelExecutionConfig,
  ): ServiceExecutionPlan[] {
    const servicesToCall = this.determineServicesToCall(request.analysisType, user.tier);
    const executionPlan: ServiceExecutionPlan[] = [];

    for (const serviceName of servicesToCall) {
      const isRequired = config.requiredServices.includes(serviceName);
      const priority = this.getServicePriority(serviceName, user.tier);
      const dependencies = this.dependencyGraph.get(serviceName) || [];
      
      executionPlan.push({
        serviceName,
        endpoint: this.serviceEndpoints[serviceName],
        priority,
        timeout: config.timeout,
        retryAttempts: config.retryAttempts,
        dependencies,
        fallbackStrategies: this.createFallbackStrategies(serviceName),
        required: isRequired,
        payload: this.prepareServiceRequest(serviceName, request),
      });
    }

    // Sort by priority (higher priority first) and dependencies
    return this.sortExecutionPlan(executionPlan);
  }

  private async executeParallelServices(
    executionPlan: ServiceExecutionPlan[],
    correlationId: string,
    config: ParallelExecutionConfig,
  ): Promise<OrchestrationResult> {
    const results: Record<string, ServiceResponse> = {};
    const warnings: string[] = [];
    const recommendations: string[] = [];
    const stats = {
      totalServices: executionPlan.length,
      successfulServices: 0,
      failedServices: 0,
      timeoutServices: 0,
      fallbackServices: 0,
      averageResponseTime: 0,
    };

    // Create semaphore for concurrency control
    const semaphore = new Semaphore(config.maxConcurrency);
    
    // Execute services with dependency resolution
    const executionPromises = executionPlan.map(async (plan) => {
      // Wait for dependencies
      await this.waitForDependencies(plan.dependencies, results);
      
      // Acquire semaphore
      await semaphore.acquire();
      
      try {
        const result = await this.executeService(plan, correlationId);
        results[plan.serviceName] = result;
        
        // Update stats
        this.updateExecutionStats(result, stats);
        
        // Check fail-fast condition
        if (config.failFast && result.status === 'error' && plan.required) {
          throw new Error(`Required service ${plan.serviceName} failed in fail-fast mode`);
        }
        
        return result;
      } finally {
        semaphore.release();
      }
    });

    // Wait for all services to complete
    const serviceResults = await Promise.allSettled(executionPromises);
    
    // Process results and generate warnings/recommendations
    serviceResults.forEach((result, index) => {
      const plan = executionPlan[index];
      
      if (result.status === 'rejected') {
        warnings.push(`Service ${plan.serviceName} execution failed: ${result.reason?.message}`);
        
        if (plan.required) {
          warnings.push(`Required service ${plan.serviceName} is unavailable`);
        }
      }
    });

    // Calculate final stats
    stats.averageResponseTime = this.calculateAverageResponseTime(results);
    const successRate = stats.successfulServices / stats.totalServices;

    // Generate recommendations based on execution results
    recommendations.push(...this.generateExecutionRecommendations(results, stats));

    return {
      services: results,
      warnings: [...new Set(warnings)],
      recommendations: [...new Set(recommendations)],
      executionTime: 0, // Will be set by caller
      successRate,
      parallelExecutionStats: stats,
    };
  }

  private async executeService(
    plan: ServiceExecutionPlan,
    correlationId: string,
  ): Promise<ServiceResponse> {
    const startTime = Date.now();
    
    try {
      // Execute with circuit breaker
      const result = await this.circuitBreakerService.executeWithBreaker(
        plan.serviceName,
        async () => {
          return await this.serviceClientFactory.callService(
            plan.serviceName,
            '/analyze',
            plan.payload,
            {
              timeout: plan.timeout,
              headers: {
                'X-Correlation-ID': correlationId,
                'X-Service-Name': plan.serviceName,
              },
            }
          );
        },
        plan.fallbackStrategies,
      );

      const responseTime = Date.now() - startTime;
      
      return {
        status: 'success',
        data: result.data,
        responseTime,
        serviceName: plan.serviceName,
        retryAttempts: 0,
        fallbackUsed: false,
        circuitBreakerState: 'CLOSED',
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Determine error type
      let status: ServiceResponse['status'] = 'error';
      if (error.name === 'TimeoutError') {
        status = 'timeout';
      } else if (error.name === 'CircuitBreakerOpenError') {
        status = 'circuit_open';
      }

      return {
        status,
        data: null,
        responseTime,
        error: error.message,
        serviceName: plan.serviceName,
        retryAttempts: plan.retryAttempts,
        fallbackUsed: false,
        circuitBreakerState: this.circuitBreakerService.getCircuitBreakerState(plan.serviceName).state,
      };
    }
  }

  private determineServicesToCall(analysisType: string, userTier: string): string[] {
    const baseServices = ['onchain']; // Always include onchain
    const tierServices = this.getServicesForTier(userTier);
    
    switch (analysisType) {
      case 'full':
        return [...baseServices, ...tierServices];
      case 'onchain':
        return ['onchain'];
      case 'sentiment':
        return tierServices.includes('sentiment') ? ['sentiment'] : ['onchain'];
      case 'tokenomics':
        return tierServices.includes('tokenomics') ? ['tokenomics'] : ['onchain'];
      case 'team':
        return tierServices.includes('team') ? ['team'] : ['onchain'];
      default:
        return [...baseServices, ...tierServices];
    }
  }

  private getServicesForTier(userTier: string): string[] {
    switch (userTier) {
      case 'free':
        return ['sentiment'];
      case 'pro':
        return ['sentiment', 'tokenomics'];
      case 'enterprise':
      case 'admin':
        return ['sentiment', 'tokenomics', 'team'];
      default:
        return [];
    }
  }

  private getServicePriority(serviceName: string, userTier: string): number {
    const basePriorities = {
      onchain: 100,
      sentiment: 80,
      tokenomics: 60,
      team: 40,
    };
    
    // Adjust priority based on user tier
    const tierMultiplier = userTier === 'enterprise' || userTier === 'admin' ? 1.2 : 1.0;
    
    return (basePriorities[serviceName] || 50) * tierMultiplier;
  }

  private prepareServiceRequest(serviceName: string, request: AnalysisRequestDto): any {
    const baseRequest = {
      projectId: request.projectId,
      timestamp: Date.now(),
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
          includeSupplyAnalysis: true,
          includeDistributionAnalysis: true,
        };
      
      case 'team':
        return {
          ...baseRequest,
          includeLinkedIn: true,
          includeGitHub: true,
          includeTwitter: true,
        };
      
      default:
        return baseRequest;
    }
  }

  private createFallbackStrategies(serviceName: string): FallbackStrategy<any>[] {
    // Create service-specific fallback strategies
    const strategies: FallbackStrategy<any>[] = [];
    
    // Cache fallback strategy
    strategies.push({
      execute: async () => {
        // Try to get cached result
        return { data: { cached: true, message: `Cached result for ${serviceName}` } };
      },
      canExecute: () => true,
      priority: 10,
    });
    
    // Default fallback strategy
    strategies.push({
      execute: async () => {
        return { data: { fallback: true, message: `Default fallback for ${serviceName}` } };
      },
      canExecute: () => true,
      priority: 1,
    });
    
    return strategies;
  }

  private initializeDependencyGraph(): void {
    // Define service dependencies
    this.dependencyGraph.set('onchain', []);
    this.dependencyGraph.set('sentiment', []);
    this.dependencyGraph.set('tokenomics', ['onchain']);
    this.dependencyGraph.set('team', []);
  }

  private sortExecutionPlan(executionPlan: ServiceExecutionPlan[]): ServiceExecutionPlan[] {
    // Topological sort based on dependencies and priority
    const sorted: ServiceExecutionPlan[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    
    const visit = (plan: ServiceExecutionPlan) => {
      if (visiting.has(plan.serviceName)) {
        throw new Error(`Circular dependency detected: ${plan.serviceName}`);
      }
      
      if (visited.has(plan.serviceName)) {
        return;
      }
      
      visiting.add(plan.serviceName);
      
      // Visit dependencies first
      for (const depName of plan.dependencies) {
        const depPlan = executionPlan.find(p => p.serviceName === depName);
        if (depPlan) {
          visit(depPlan);
        }
      }
      
      visiting.delete(plan.serviceName);
      visited.add(plan.serviceName);
      sorted.push(plan);
    };
    
    // Sort by priority first, then apply topological sort
    const prioritySorted = [...executionPlan].sort((a, b) => b.priority - a.priority);
    
    for (const plan of prioritySorted) {
      visit(plan);
    }
    
    return sorted;
  }

  private async waitForDependencies(
    dependencies: string[],
    results: Record<string, ServiceResponse>,
  ): Promise<void> {
    // Wait for all dependencies to complete
    while (dependencies.some(dep => !results[dep])) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  private updateExecutionStats(result: ServiceResponse, stats: any): void {
    switch (result.status) {
      case 'success':
        stats.successfulServices++;
        break;
      case 'timeout':
        stats.timeoutServices++;
        stats.failedServices++;
        break;
      case 'fallback':
        stats.fallbackServices++;
        stats.successfulServices++;
        break;
      default:
        stats.failedServices++;
        break;
    }
  }

  private calculateAverageResponseTime(results: Record<string, ServiceResponse>): number {
    const responseTimes = Object.values(results).map(r => r.responseTime);
    return responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
      : 0;
  }

  private generateExecutionRecommendations(
    results: Record<string, ServiceResponse>,
    stats: any,
  ): string[] {
    const recommendations: string[] = [];
    
    if (stats.successfulServices === 0) {
      recommendations.push('all_services_failed');
    } else if (stats.failedServices > stats.successfulServices) {
      recommendations.push('majority_services_failed');
    }
    
    if (stats.timeoutServices > 0) {
      recommendations.push('service_timeouts_detected');
    }
    
    if (stats.fallbackServices > 0) {
      recommendations.push('fallback_strategies_used');
    }
    
    if (stats.averageResponseTime > 10000) {
      recommendations.push('high_response_times');
    }
    
    return recommendations;
  }
}

// Semaphore class for concurrency control
class Semaphore {
  private permits: number;
  private waitQueue: (() => void)[] = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    if (this.waitQueue.length > 0) {
      const resolve = this.waitQueue.shift()!;
      resolve();
    } else {
      this.permits++;
    }
  }
}
