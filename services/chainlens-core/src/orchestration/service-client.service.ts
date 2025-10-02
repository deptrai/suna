import { Injectable, HttpException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse, AxiosError } from 'axios';
import { LoggerService } from '../common/services/logger.service';

interface ServiceEndpoint {
  url: string;
  timeout: number;
  retries: number;
  retryDelay: number;
}

@Injectable()
export class ServiceClientService {
  private readonly serviceEndpoints: Map<string, ServiceEndpoint>;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
    private logger: LoggerService,
  ) {
    this.serviceEndpoints = new Map([
      ['onchain', {
        url: this.configService.get<string>('services.onchain.url', 'http://localhost:3001'),
        timeout: this.configService.get<number>('services.onchain.timeout', 15000),
        retries: this.configService.get<number>('services.onchain.retries', 3),
        retryDelay: this.configService.get<number>('services.onchain.retryDelay', 1000),
      }],
      ['sentiment', {
        url: this.configService.get<string>('services.sentiment.url', 'http://localhost:3002'),
        timeout: this.configService.get<number>('services.sentiment.timeout', 20000),
        retries: this.configService.get<number>('services.sentiment.retries', 3),
        retryDelay: this.configService.get<number>('services.sentiment.retryDelay', 1000),
      }],
      ['tokenomics', {
        url: this.configService.get<string>('services.tokenomics.url', 'http://localhost:3003'),
        timeout: this.configService.get<number>('services.tokenomics.timeout', 10000),
        retries: this.configService.get<number>('services.tokenomics.retries', 3),
        retryDelay: this.configService.get<number>('services.tokenomics.retryDelay', 1000),
      }],
      ['team', {
        url: this.configService.get<string>('services.team.url', 'http://localhost:3004'),
        timeout: this.configService.get<number>('services.team.timeout', 25000),
        retries: this.configService.get<number>('services.team.retries', 3),
        retryDelay: this.configService.get<number>('services.team.retryDelay', 1000),
      }],
    ]);
  }

  async callService(
    serviceName: string,
    endpoint: string,
    data: any,
    correlationId: string,
  ): Promise<any> {
    const serviceConfig = this.serviceEndpoints.get(serviceName);
    
    if (!serviceConfig) {
      throw new Error(`Unknown service: ${serviceName}`);
    }

    const url = `${serviceConfig.url}${endpoint}`;
    const startTime = Date.now();

    this.logger.log(`Calling ${serviceName} service`, {
      serviceName,
      endpoint,
      url,
      correlationId,
    });

    try {
      const response = await this.executeWithRetry(
        () => this.makeHttpRequest(url, data, serviceConfig, correlationId),
        serviceConfig.retries,
        serviceConfig.retryDelay,
        serviceName,
        correlationId,
      );

      const responseTime = Date.now() - startTime;
      
      this.logger.log(`${serviceName} service call successful`, {
        serviceName,
        endpoint,
        responseTime,
        statusCode: response.status,
        correlationId,
      });

      return response.data;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error(`${serviceName} service call failed`, error.stack, 'ServiceClientService', {
        serviceName,
        endpoint,
        responseTime,
        error: error.message,
        correlationId,
      });

      throw this.handleServiceError(error, serviceName, endpoint);
    }
  }

  async healthCheck(serviceName: string): Promise<{
    status: 'healthy' | 'unhealthy';
    responseTime: number;
    error?: string;
  }> {
    const serviceConfig = this.serviceEndpoints.get(serviceName);
    
    if (!serviceConfig) {
      return {
        status: 'unhealthy',
        responseTime: 0,
        error: `Unknown service: ${serviceName}`,
      };
    }

    const url = `${serviceConfig.url}/api/v1/health`;
    const startTime = Date.now();

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          timeout: 5000, // Short timeout for health checks
          headers: {
            'Content-Type': 'application/json',
            'X-Service-Name': 'chainlens-core',
          },
        })
      );

      const responseTime = Date.now() - startTime;
      
      return {
        status: response.status === 200 ? 'healthy' : 'unhealthy',
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'unhealthy',
        responseTime,
        error: error.message,
      };
    }
  }

  async getAllServicesHealth(): Promise<Record<string, {
    status: 'healthy' | 'unhealthy';
    responseTime: number;
    error?: string;
  }>> {
    const healthChecks = Array.from(this.serviceEndpoints.keys()).map(async serviceName => {
      const health = await this.healthCheck(serviceName);
      return { serviceName, health };
    });

    const results = await Promise.all(healthChecks);
    
    return results.reduce((acc, { serviceName, health }) => {
      acc[serviceName] = health;
      return acc;
    }, {});
  }

  private async makeHttpRequest(
    url: string,
    data: any,
    config: ServiceEndpoint,
    correlationId: string,
  ): Promise<AxiosResponse> {
    return firstValueFrom(
      this.httpService.post(url, data, {
        timeout: config.timeout,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': correlationId,
          'X-Service-Name': 'chainlens-core',
          'X-Request-ID': `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        },
        validateStatus: (status) => status < 500, // Don't throw on 4xx errors
      })
    );
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    retryDelay: number,
    serviceName: string,
    correlationId: string,
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Don't retry on client errors (4xx)
        if (this.isClientError(error)) {
          throw error;
        }
        
        // Don't retry on the last attempt
        if (attempt > maxRetries) {
          break;
        }
        
        const delay = retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
        
        this.logger.warn(`${serviceName} service call failed, retrying in ${delay}ms`, {
          serviceName,
          attempt,
          maxRetries,
          error: error.message,
          correlationId,
        });
        
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }

  private isClientError(error: any): boolean {
    if (error.response && error.response.status) {
      return error.response.status >= 400 && error.response.status < 500;
    }
    return false;
  }

  private handleServiceError(error: any, serviceName: string, endpoint: string): Error {
    if (error.code === 'ECONNREFUSED') {
      return new Error(`${serviceName} service is unavailable`);
    }
    
    if (error.code === 'ETIMEDOUT' || error.name === 'TimeoutError') {
      return new Error(`${serviceName} service timeout`);
    }
    
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.message || error.response.statusText;
      
      if (status >= 400 && status < 500) {
        return new HttpException(`${serviceName} service error: ${message}`, status);
      }
      
      if (status >= 500) {
        return new Error(`${serviceName} service internal error: ${message}`);
      }
    }
    
    return new Error(`${serviceName} service error: ${error.message}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get service configuration for debugging
  getServiceConfig(serviceName: string): ServiceEndpoint | null {
    return this.serviceEndpoints.get(serviceName) || null;
  }

  // Update service configuration at runtime
  updateServiceConfig(serviceName: string, config: Partial<ServiceEndpoint>): void {
    const currentConfig = this.serviceEndpoints.get(serviceName);
    
    if (currentConfig) {
      this.serviceEndpoints.set(serviceName, {
        ...currentConfig,
        ...config,
      });
      
      this.logger.log(`Updated configuration for ${serviceName} service`, {
        serviceName,
        newConfig: config,
      });
    }
  }
}
