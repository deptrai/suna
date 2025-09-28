import { Injectable } from '@nestjs/common';
import { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { MetricsService } from '../../metrics/metrics.service';
import { LoggerService } from '../../common/services/logger.service';

export interface RequestMetrics {
  requestId: string;
  serviceName: string;
  method: string;
  endpoint: string;
  startTime: number;
  endTime?: number;
  responseTime?: number;
  statusCode?: number;
  success: boolean;
  error?: string;
  retryAttempt: number;
  requestSize?: number;
  responseSize?: number;
  cacheHit?: boolean;
}

export interface ServiceMetrics {
  serviceName: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  totalResponseTime: number;
  errorRate: number;
  lastRequestTime: number;
  requestsPerMinute: number;
}

@Injectable()
export class MetricsInterceptorService {
  private readonly requestMetrics: Map<string, RequestMetrics> = new Map();
  private readonly serviceMetrics: Map<string, ServiceMetrics> = new Map();
  private readonly recentRequests: RequestMetrics[] = [];
  private readonly maxRecentRequests = 1000;

  constructor(
    private metricsService: MetricsService,
    private logger: LoggerService,
  ) {}

  createMetricsRequestInterceptor(serviceName: string) {
    return (config: any): any => {
      const requestId = config.headers?.['X-Request-ID'] || this.generateRequestId();
      const startTime = Date.now();

      const metrics: RequestMetrics = {
        requestId,
        serviceName,
        method: (config.method || 'GET').toUpperCase(),
        endpoint: this.extractEndpoint(config),
        startTime,
        success: false,
        retryAttempt: this.extractRetryAttempt(config),
        requestSize: this.calculateRequestSize(config),
      };

      this.requestMetrics.set(requestId, metrics);
      this.updateServiceMetrics(serviceName, 'request_started');

      // Attach metrics to config for later use
      config.metadata = {
        ...config.metadata,
        metrics,
      };

      return config;
    };
  }

  createMetricsResponseInterceptor(serviceName: string) {
    return (response: AxiosResponse): AxiosResponse => {
      const metrics = this.getMetricsFromConfig(response.config);
      
      if (metrics) {
        const endTime = Date.now();
        const responseTime = endTime - metrics.startTime;

        // Update metrics
        metrics.endTime = endTime;
        metrics.responseTime = responseTime;
        metrics.statusCode = response.status;
        metrics.success = response.status < 400;
        metrics.responseSize = this.calculateResponseSize(response);

        // Record metrics
        this.recordRequestMetrics(metrics);
        this.updateServiceMetrics(serviceName, 'request_completed', metrics);

        // Send to metrics service
        this.sendToMetricsService(metrics);

        // Cleanup
        this.requestMetrics.delete(metrics.requestId);
      }

      return response;
    };
  }

  createMetricsErrorInterceptor(serviceName: string) {
    return (error: AxiosError): Promise<never> => {
      const metrics = this.getMetricsFromConfig(error.config);
      
      if (metrics) {
        const endTime = Date.now();
        const responseTime = endTime - metrics.startTime;

        // Update metrics
        metrics.endTime = endTime;
        metrics.responseTime = responseTime;
        metrics.statusCode = error.response?.status || 0;
        metrics.success = false;
        metrics.error = error.message;
        metrics.responseSize = this.calculateResponseSize(error.response);

        // Record metrics
        this.recordRequestMetrics(metrics);
        this.updateServiceMetrics(serviceName, 'request_failed', metrics);

        // Send to metrics service
        this.sendToMetricsService(metrics);

        // Cleanup
        this.requestMetrics.delete(metrics.requestId);
      }

      return Promise.reject(error);
    };
  }

  private getMetricsFromConfig(config: any): RequestMetrics | null {
    return config?.metadata?.metrics || null;
  }

  private recordRequestMetrics(metrics: RequestMetrics): void {
    // Add to recent requests
    this.recentRequests.push({ ...metrics });
    
    // Keep only recent requests
    if (this.recentRequests.length > this.maxRecentRequests) {
      this.recentRequests.splice(0, this.recentRequests.length - this.maxRecentRequests);
    }

    this.logger.debug('Request metrics recorded', {
      requestId: metrics.requestId,
      serviceName: metrics.serviceName,
      method: metrics.method,
      endpoint: metrics.endpoint,
      responseTime: metrics.responseTime,
      statusCode: metrics.statusCode,
      success: metrics.success,
    });
  }

  private updateServiceMetrics(serviceName: string, event: string, metrics?: RequestMetrics): void {
    let serviceMetrics = this.serviceMetrics.get(serviceName);
    
    if (!serviceMetrics) {
      serviceMetrics = {
        serviceName,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        minResponseTime: Infinity,
        maxResponseTime: 0,
        totalResponseTime: 0,
        errorRate: 0,
        lastRequestTime: 0,
        requestsPerMinute: 0,
      };
      this.serviceMetrics.set(serviceName, serviceMetrics);
    }

    switch (event) {
      case 'request_started':
        serviceMetrics.totalRequests++;
        serviceMetrics.lastRequestTime = Date.now();
        break;
        
      case 'request_completed':
        if (metrics) {
          if (metrics.success) {
            serviceMetrics.successfulRequests++;
          } else {
            serviceMetrics.failedRequests++;
          }
          
          if (metrics.responseTime) {
            serviceMetrics.totalResponseTime += metrics.responseTime;
            serviceMetrics.averageResponseTime = serviceMetrics.totalResponseTime / 
              (serviceMetrics.successfulRequests + serviceMetrics.failedRequests);
            serviceMetrics.minResponseTime = Math.min(serviceMetrics.minResponseTime, metrics.responseTime);
            serviceMetrics.maxResponseTime = Math.max(serviceMetrics.maxResponseTime, metrics.responseTime);
          }
        }
        break;
        
      case 'request_failed':
        if (metrics) {
          serviceMetrics.failedRequests++;
          
          if (metrics.responseTime) {
            serviceMetrics.totalResponseTime += metrics.responseTime;
            serviceMetrics.averageResponseTime = serviceMetrics.totalResponseTime / 
              (serviceMetrics.successfulRequests + serviceMetrics.failedRequests);
            serviceMetrics.minResponseTime = Math.min(serviceMetrics.minResponseTime, metrics.responseTime);
            serviceMetrics.maxResponseTime = Math.max(serviceMetrics.maxResponseTime, metrics.responseTime);
          }
        }
        break;
    }

    // Calculate error rate
    const totalCompleted = serviceMetrics.successfulRequests + serviceMetrics.failedRequests;
    serviceMetrics.errorRate = totalCompleted > 0 ? (serviceMetrics.failedRequests / totalCompleted) * 100 : 0;

    // Calculate requests per minute
    serviceMetrics.requestsPerMinute = this.calculateRequestsPerMinute(serviceName);
  }

  private sendToMetricsService(metrics: RequestMetrics): void {
    try {
      this.metricsService.recordHttpRequest(
        metrics.endpoint,
        metrics.method,
        metrics.statusCode || 0,
        metrics.responseTime || 0,
        metrics.success ? 'success' : 'error'
      );
    } catch (error) {
      this.logger.warn('Failed to send metrics to metrics service', {
        error: error.message,
        requestId: metrics.requestId,
      });
    }
  }

  private extractEndpoint(config: any): string {
    if (!config) return 'unknown';
    
    const url = config.url || '';
    const baseURL = config.baseURL || '';
    
    if (url.startsWith('http')) {
      return url;
    }
    
    return `${baseURL}${url}`;
  }

  private extractRetryAttempt(config: any): number {
    const retryHeader = config.headers?.['X-Retry-Attempt'];
    return retryHeader ? parseInt(retryHeader, 10) : 0;
  }

  private calculateRequestSize(config: any): number {
    if (!config.data) return 0;
    
    try {
      const dataString = typeof config.data === 'string' ? config.data : JSON.stringify(config.data);
      return new Blob([dataString]).size;
    } catch {
      return 0;
    }
  }

  private calculateResponseSize(response: any): number {
    if (!response?.data) return 0;
    
    try {
      const dataString = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      return new Blob([dataString]).size;
    } catch {
      return 0;
    }
  }

  private calculateRequestsPerMinute(serviceName: string): number {
    const oneMinuteAgo = Date.now() - 60000;
    const recentServiceRequests = this.recentRequests.filter(
      req => req.serviceName === serviceName && req.startTime > oneMinuteAgo
    );
    return recentServiceRequests.length;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public API methods

  getServiceMetrics(serviceName?: string): ServiceMetrics[] {
    if (serviceName) {
      const metrics = this.serviceMetrics.get(serviceName);
      return metrics ? [metrics] : [];
    }
    
    return Array.from(this.serviceMetrics.values());
  }

  getRecentRequests(serviceName?: string, limit: number = 100): RequestMetrics[] {
    let requests = this.recentRequests;
    
    if (serviceName) {
      requests = requests.filter(req => req.serviceName === serviceName);
    }
    
    return requests.slice(-limit);
  }

  getActiveRequests(): RequestMetrics[] {
    return Array.from(this.requestMetrics.values());
  }

  getMetricsSummary(): {
    totalRequests: number;
    activeRequests: number;
    averageResponseTime: number;
    errorRate: number;
    requestsPerMinute: number;
  } {
    const allMetrics = this.getServiceMetrics();
    
    const totalRequests = allMetrics.reduce((sum, m) => sum + m.totalRequests, 0);
    const totalCompleted = allMetrics.reduce((sum, m) => sum + m.successfulRequests + m.failedRequests, 0);
    const totalFailed = allMetrics.reduce((sum, m) => sum + m.failedRequests, 0);
    const totalResponseTime = allMetrics.reduce((sum, m) => sum + m.totalResponseTime, 0);
    const totalRequestsPerMinute = allMetrics.reduce((sum, m) => sum + m.requestsPerMinute, 0);

    return {
      totalRequests,
      activeRequests: this.requestMetrics.size,
      averageResponseTime: totalCompleted > 0 ? totalResponseTime / totalCompleted : 0,
      errorRate: totalCompleted > 0 ? (totalFailed / totalCompleted) * 100 : 0,
      requestsPerMinute: totalRequestsPerMinute,
    };
  }

  clearMetrics(): void {
    this.requestMetrics.clear();
    this.serviceMetrics.clear();
    this.recentRequests.length = 0;
    
    this.logger.log('All metrics cleared');
  }

  exportMetrics(): {
    serviceMetrics: ServiceMetrics[];
    recentRequests: RequestMetrics[];
    activeRequests: RequestMetrics[];
    summary: any;
  } {
    return {
      serviceMetrics: this.getServiceMetrics(),
      recentRequests: this.getRecentRequests(),
      activeRequests: this.getActiveRequests(),
      summary: this.getMetricsSummary(),
    };
  }
}
