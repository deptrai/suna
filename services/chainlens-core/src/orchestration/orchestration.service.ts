import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '../auth/auth.service';
import { LoggerService } from '../common/services/logger.service';
import { MetricsService } from '../metrics/metrics.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ServiceClientService } from './service-client.service';
import { AnalysisRequestDto } from '../analysis/dto/analysis-request.dto';

interface ServiceResponse {
  status: 'success' | 'error' | 'timeout';
  data: any;
  responseTime: number;
  error?: string;
}

interface OrchestrationResult {
  services: Record<string, ServiceResponse>;
  warnings: string[];
  recommendations: string[];
}

@Injectable()
export class OrchestrationService {
  private readonly serviceEndpoints: Record<string, string>;

  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
    private metricsService: MetricsService,
    private circuitBreakerService: CircuitBreakerService,
    private serviceClientService: ServiceClientService,
  ) {
    this.serviceEndpoints = {
      onchain: this.configService.get<string>('services.onchain.url'),
      sentiment: this.configService.get<string>('services.sentiment.url'),
      tokenomics: this.configService.get<string>('services.tokenomics.url'),
      team: this.configService.get<string>('services.team.url'),
    };
  }

  async orchestrateAnalysis(
    request: AnalysisRequestDto,
    user: User,
    correlationId: string,
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    
    this.logger.log('Starting analysis orchestration', {
      projectId: request.projectId,
      analysisType: request.analysisType,
      userId: user.id,
      correlationId,
    });

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

    return {
      services,
      warnings: [...new Set(warnings)], // Remove duplicates
      recommendations: [...new Set(recommendations)], // Remove duplicates
    };
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
}
