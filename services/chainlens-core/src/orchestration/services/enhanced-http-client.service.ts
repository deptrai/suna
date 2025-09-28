import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { Agent } from 'https';
import { firstValueFrom, Observable } from 'rxjs';
import { LoggerService } from '../../common/services/logger.service';
import { MetricsService } from '../../metrics/metrics.service';
import { HttpClientConfigService, ServiceConfig } from '../config/http-client.config';
import { RequestInterceptorService } from '../interceptors/request.interceptor';
import { MetricsInterceptorService } from '../interceptors/metrics.interceptor';

export interface RequestMetrics {
  serviceName: string;
  endpoint: string;
  method: string;
  startTime: number;
  endTime?: number;
  responseTime?: number;
  statusCode?: number;
  success: boolean;
  error?: string;
  retryAttempt?: number;
  correlationId: string;
}

@Injectable()
export class EnhancedHttpClientService implements OnModuleInit, OnModuleDestroy {
  private readonly clients: Map<string, AxiosInstance> = new Map();
  private readonly httpsAgent: Agent;
  private readonly requestMetrics: RequestMetrics[] = [];

  constructor(
    private httpService: HttpService,
    private logger: LoggerService,
    private metricsService: MetricsService,
    private configService: HttpClientConfigService,
    private requestInterceptor: RequestInterceptorService,
    private metricsInterceptor: MetricsInterceptorService,
  ) {
    // Create HTTPS agent with connection pooling
    this.httpsAgent = new Agent({
      keepAlive: true,
      maxSockets: 100,
      maxFreeSockets: 10,
      timeout: 60000,
    });
  }

  async onModuleInit() {
    await this.initializeClients();
    this.logger.log('Enhanced HTTP Client Service initialized', {
      clientCount: this.clients.size,
      services: Array.from(this.clients.keys()),
    });
  }

  async onModuleDestroy() {
    // Clean up connections
    this.httpsAgent.destroy();
    this.clients.clear();
    this.logger.log('Enhanced HTTP Client Service destroyed');
  }

  private async initializeClients(): Promise<void> {
    const serviceConfigs = this.configService.getAllServiceConfigs();

    for (const [serviceName, config] of serviceConfigs) {
      const client = this.createAxiosClient(serviceName, config);
      this.clients.set(serviceName, client);
      
      this.logger.debug(`Created HTTP client for ${serviceName}`, {
        serviceName,
        baseURL: config.baseURL,
        timeout: config.timeout,
      });
    }
  }

  private createAxiosClient(serviceName: string, config: ServiceConfig): AxiosInstance {
    const client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout,
      maxRedirects: config.maxRedirects,
      httpsAgent: this.httpsAgent,
      validateStatus: config.validateStatus,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'ChainLens-Core/1.0.0',
        'X-Service-Name': 'chainlens-core',
        'X-Client-Version': '1.0.0',
      },
    });

    // Enhanced request interceptors
    client.interceptors.request.use(
      this.requestInterceptor.createRequestInterceptor(serviceName),
      this.requestInterceptor.createRequestErrorInterceptor(serviceName)
    );

    // Enhanced response interceptors
    client.interceptors.response.use(
      this.requestInterceptor.createResponseInterceptor(serviceName),
      this.requestInterceptor.createResponseErrorInterceptor(serviceName)
    );

    // Metrics interceptors
    client.interceptors.request.use(
      this.metricsInterceptor.createMetricsRequestInterceptor(serviceName)
    );

    client.interceptors.response.use(
      this.metricsInterceptor.createMetricsResponseInterceptor(serviceName),
      this.metricsInterceptor.createMetricsErrorInterceptor(serviceName)
    );

    return client;
  }





  async makeRequest<T = any>(
    serviceName: string,
    config: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    const client = this.clients.get(serviceName);
    
    if (!client) {
      throw new Error(`HTTP client not found for service: ${serviceName}`);
    }

    return client.request<T>(config);
  }

  async get<T = any>(
    serviceName: string,
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.makeRequest<T>(serviceName, { ...config, method: 'GET', url });
  }

  async post<T = any>(
    serviceName: string,
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.makeRequest<T>(serviceName, { ...config, method: 'POST', url, data });
  }

  async put<T = any>(
    serviceName: string,
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.makeRequest<T>(serviceName, { ...config, method: 'PUT', url, data });
  }

  async delete<T = any>(
    serviceName: string,
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.makeRequest<T>(serviceName, { ...config, method: 'DELETE', url });
  }

  getClient(serviceName: string): AxiosInstance | null {
    return this.clients.get(serviceName) || null;
  }

  getMetrics(serviceName?: string): RequestMetrics[] {
    if (serviceName) {
      return this.requestMetrics.filter(m => m.serviceName === serviceName);
    }
    return [...this.requestMetrics];
  }

  clearMetrics(): void {
    this.requestMetrics.length = 0;
  }



  async healthCheck(serviceName: string): Promise<{
    status: 'healthy' | 'unhealthy';
    responseTime: number;
    error?: string;
  }> {
    const serviceConfig = this.configService.getServiceConfig(serviceName);
    
    if (!serviceConfig) {
      return {
        status: 'unhealthy',
        responseTime: 0,
        error: `Unknown service: ${serviceName}`,
      };
    }

    const startTime = Date.now();

    try {
      const response = await this.get(serviceName, serviceConfig.healthCheckPath, {
        timeout: 5000, // Short timeout for health checks
      });

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
}
