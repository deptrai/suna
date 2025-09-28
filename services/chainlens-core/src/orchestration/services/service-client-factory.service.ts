import { Injectable, OnModuleInit } from '@nestjs/common';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { LoggerService } from '../../common/services/logger.service';
import { EnhancedHttpClientService } from './enhanced-http-client.service';
import { HttpClientConfigService, ServiceConfig } from '../config/http-client.config';

export interface ServiceClient {
  serviceName: string;
  config: ServiceConfig;
  isHealthy: boolean;
  lastHealthCheck: number;
  consecutiveFailures: number;
  totalRequests: number;
  successfulRequests: number;
  averageResponseTime: number;
}

export interface ServiceCallOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
  correlationId?: string;
  priority?: number;
}

@Injectable()
export class ServiceClientFactoryService implements OnModuleInit {
  private readonly clients: Map<string, ServiceClient> = new Map();
  private readonly healthCheckInterval = 30000; // 30 seconds
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(
    private logger: LoggerService,
    private httpClient: EnhancedHttpClientService,
    private configService: HttpClientConfigService,
  ) {}

  async onModuleInit() {
    await this.initializeClients();
    this.startHealthChecking();
    
    this.logger.log('Service Client Factory initialized', {
      clientCount: this.clients.size,
      services: Array.from(this.clients.keys()),
    });
  }

  onModuleDestroy() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
  }

  private async initializeClients(): Promise<void> {
    const serviceConfigs = this.configService.getAllServiceConfigs();

    for (const [serviceName, config] of serviceConfigs) {
      const client: ServiceClient = {
        serviceName,
        config,
        isHealthy: false,
        lastHealthCheck: 0,
        consecutiveFailures: 0,
        totalRequests: 0,
        successfulRequests: 0,
        averageResponseTime: 0,
      };

      this.clients.set(serviceName, client);
      
      // Perform initial health check
      await this.performHealthCheck(serviceName);
    }
  }

  private startHealthChecking(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performAllHealthChecks();
    }, this.healthCheckInterval);
  }

  private async performAllHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.clients.keys()).map(serviceName =>
      this.performHealthCheck(serviceName)
    );

    await Promise.allSettled(healthCheckPromises);
  }

  private async performHealthCheck(serviceName: string): Promise<void> {
    const client = this.clients.get(serviceName);
    
    if (!client) {
      return;
    }

    try {
      const healthResult = await this.httpClient.healthCheck(serviceName);
      
      client.isHealthy = healthResult.status === 'healthy';
      client.lastHealthCheck = Date.now();
      
      if (client.isHealthy) {
        client.consecutiveFailures = 0;
      } else {
        client.consecutiveFailures++;
      }

      this.logger.debug(`Health check completed for ${serviceName}`, {
        serviceName,
        status: healthResult.status,
        responseTime: healthResult.responseTime,
        consecutiveFailures: client.consecutiveFailures,
      });

    } catch (error) {
      client.isHealthy = false;
      client.lastHealthCheck = Date.now();
      client.consecutiveFailures++;

      this.logger.warn(`Health check failed for ${serviceName}`, {
        serviceName,
        error: error.message,
        consecutiveFailures: client.consecutiveFailures,
      });
    }
  }

  async callService<T = any>(
    serviceName: string,
    endpoint: string,
    data?: any,
    options: ServiceCallOptions = {},
  ): Promise<AxiosResponse<T>> {
    const client = this.clients.get(serviceName);
    
    if (!client) {
      throw new Error(`Unknown service: ${serviceName}`);
    }

    // Check if service is healthy
    if (!client.isHealthy && client.consecutiveFailures > 3) {
      throw new Error(`Service ${serviceName} is unhealthy (${client.consecutiveFailures} consecutive failures)`);
    }

    const startTime = Date.now();
    const correlationId = options.correlationId || this.generateCorrelationId();

    // Prepare request config
    const requestConfig: AxiosRequestConfig = {
      url: endpoint,
      method: data ? 'POST' : 'GET',
      data,
      timeout: options.timeout || client.config.timeout,
      headers: {
        'X-Correlation-ID': correlationId,
        'X-Request-Priority': (options.priority || client.config.priority).toString(),
        ...options.headers,
      },
    };

    try {
      // Execute request with retry logic
      const response = await this.executeWithRetry(
        serviceName,
        requestConfig,
        options.retries || client.config.retries,
        options.retryDelay || client.config.retryDelay,
        correlationId,
      );

      // Update client statistics
      const responseTime = Date.now() - startTime;
      this.updateClientStats(client, true, responseTime);

      this.logger.debug(`Service call successful`, {
        serviceName,
        endpoint,
        responseTime,
        statusCode: response.status,
        correlationId,
      });

      return response as AxiosResponse<T>;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateClientStats(client, false, responseTime);

      this.logger.error(`Service call failed`, error.stack, 'ServiceClientFactoryService', {
        serviceName,
        endpoint,
        responseTime,
        error: error.message,
        correlationId,
      });

      throw error;
    }
  }

  private async executeWithRetry<T>(
    serviceName: string,
    config: AxiosRequestConfig,
    maxRetries: number,
    retryDelay: number,
    correlationId: string,
  ): Promise<AxiosResponse<T>> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        return await this.httpClient.makeRequest<T>(serviceName, config);
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
        
        const delay = this.configService.calculateRetryDelay(
          attempt,
          retryDelay,
          2, // multiplier
          10000 // max delay
        );
        
        this.logger.warn(`Service call failed, retrying in ${delay}ms`, {
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

  private updateClientStats(client: ServiceClient, success: boolean, responseTime: number): void {
    client.totalRequests++;
    
    if (success) {
      client.successfulRequests++;
    }

    // Update average response time using exponential moving average
    const alpha = 0.1; // Smoothing factor
    client.averageResponseTime = client.averageResponseTime === 0
      ? responseTime
      : (alpha * responseTime) + ((1 - alpha) * client.averageResponseTime);
  }

  private isClientError(error: any): boolean {
    return error.response && error.response.status >= 400 && error.response.status < 500;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public methods for service management

  getServiceClient(serviceName: string): ServiceClient | null {
    return this.clients.get(serviceName) || null;
  }

  getAllServiceClients(): ServiceClient[] {
    return Array.from(this.clients.values());
  }

  getHealthyServices(): string[] {
    return Array.from(this.clients.values())
      .filter(client => client.isHealthy)
      .map(client => client.serviceName);
  }

  getUnhealthyServices(): string[] {
    return Array.from(this.clients.values())
      .filter(client => !client.isHealthy)
      .map(client => client.serviceName);
  }

  getServiceStats(serviceName: string): {
    totalRequests: number;
    successfulRequests: number;
    successRate: number;
    averageResponseTime: number;
    isHealthy: boolean;
    consecutiveFailures: number;
  } | null {
    const client = this.clients.get(serviceName);
    
    if (!client) {
      return null;
    }

    return {
      totalRequests: client.totalRequests,
      successfulRequests: client.successfulRequests,
      successRate: client.totalRequests > 0 ? (client.successfulRequests / client.totalRequests) * 100 : 0,
      averageResponseTime: Math.round(client.averageResponseTime),
      isHealthy: client.isHealthy,
      consecutiveFailures: client.consecutiveFailures,
    };
  }

  async forceHealthCheck(serviceName?: string): Promise<void> {
    if (serviceName) {
      await this.performHealthCheck(serviceName);
    } else {
      await this.performAllHealthChecks();
    }
  }

  updateServiceConfig(serviceName: string, updates: Partial<ServiceConfig>): void {
    const client = this.clients.get(serviceName);
    
    if (client) {
      client.config = { ...client.config, ...updates };
      this.configService.updateServiceConfig(serviceName, updates);
      
      this.logger.log(`Updated service client configuration`, {
        serviceName,
        updates,
      });
    }
  }
}
