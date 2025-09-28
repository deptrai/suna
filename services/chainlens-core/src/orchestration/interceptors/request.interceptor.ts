import { Injectable } from '@nestjs/common';
import { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { LoggerService } from '../../common/services/logger.service';
import { MetricsService } from '../../metrics/metrics.service';

export interface RequestContext {
  correlationId: string;
  requestId: string;
  serviceName: string;
  startTime: number;
  retryAttempt?: number;
  metadata?: Record<string, any>;
}

export interface InterceptorConfig {
  enableLogging: boolean;
  enableMetrics: boolean;
  enableTracing: boolean;
  enableRetryLogging: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  sensitiveHeaders: string[];
  maxLogBodySize: number;
}

@Injectable()
export class RequestInterceptorService {
  private readonly config: InterceptorConfig;
  private readonly requestContexts: Map<string, RequestContext> = new Map();

  constructor(
    private logger: LoggerService,
    private metricsService: MetricsService,
  ) {
    this.config = {
      enableLogging: true,
      enableMetrics: true,
      enableTracing: true,
      enableRetryLogging: true,
      logLevel: 'debug',
      sensitiveHeaders: ['authorization', 'x-api-key', 'cookie', 'set-cookie'],
      maxLogBodySize: 1000,
    };
  }

  createRequestInterceptor(serviceName: string) {
    return (config: any): any => {
      const context = this.createRequestContext(serviceName, config);
      this.attachContextToConfig(config, context);
      
      if (this.config.enableLogging) {
        this.logRequest(context, config);
      }

      if (this.config.enableMetrics) {
        this.recordRequestMetrics(context);
      }

      if (this.config.enableTracing) {
        this.addTracingHeaders(config, context);
      }

      return config;
    };
  }

  createRequestErrorInterceptor(serviceName: string) {
    return (error: any): Promise<never> => {
      this.logger.error(`Request setup failed for ${serviceName}`, error.stack, 'RequestInterceptor', {
        serviceName,
        error: error.message,
        config: this.sanitizeConfig(error.config),
      });

      return Promise.reject(error);
    };
  }

  createResponseInterceptor(serviceName: string) {
    return (response: AxiosResponse): AxiosResponse => {
      const context = this.getContextFromConfig(response.config);
      
      if (context) {
        context.metadata = {
          ...context.metadata,
          responseTime: Date.now() - context.startTime,
          statusCode: response.status,
          success: true,
        };

        if (this.config.enableLogging) {
          this.logResponse(context, response);
        }

        if (this.config.enableMetrics) {
          this.recordResponseMetrics(context, response);
        }

        this.cleanupContext(context.requestId);
      }

      return response;
    };
  }

  createResponseErrorInterceptor(serviceName: string) {
    return (error: AxiosError): Promise<never> => {
      const context = this.getContextFromConfig(error.config);
      
      if (context) {
        context.metadata = {
          ...context.metadata,
          responseTime: Date.now() - context.startTime,
          statusCode: error.response?.status,
          success: false,
          error: error.message,
        };

        if (this.config.enableLogging) {
          this.logResponseError(context, error);
        }

        if (this.config.enableMetrics) {
          this.recordErrorMetrics(context, error);
        }

        this.cleanupContext(context.requestId);
      }

      return Promise.reject(error);
    };
  }

  private createRequestContext(serviceName: string, config: any): RequestContext {
    const correlationId = config.headers?.['X-Correlation-ID'] || this.generateCorrelationId();
    const requestId = this.generateRequestId();

    const context: RequestContext = {
      correlationId,
      requestId,
      serviceName,
      startTime: Date.now(),
      retryAttempt: config.headers?.['X-Retry-Attempt'] ? parseInt(config.headers['X-Retry-Attempt']) : 0,
      metadata: {
        method: config.method?.toUpperCase() || 'GET',
        url: config.url,
        baseURL: config.baseURL,
      },
    };

    this.requestContexts.set(requestId, context);
    return context;
  }

  private attachContextToConfig(config: any, context: RequestContext): void {
    config.metadata = { context };
    
    // Add standard headers
    config.headers = {
      ...config.headers,
      'X-Correlation-ID': context.correlationId,
      'X-Request-ID': context.requestId,
      'X-Request-Timestamp': new Date(context.startTime).toISOString(),
      'X-Service-Name': 'chainlens-core',
      'X-Client-Version': '1.0.0',
    };
  }

  private getContextFromConfig(config: any): RequestContext | null {
    return config?.metadata?.context || null;
  }

  private logRequest(context: RequestContext, config: any): void {
    const logData = {
      correlationId: context.correlationId,
      requestId: context.requestId,
      serviceName: context.serviceName,
      method: context.metadata?.method,
      url: this.buildFullUrl(config),
      headers: this.sanitizeHeaders(config.headers),
      retryAttempt: context.retryAttempt,
    };

    // Add request body if present and not too large
    if (config.data && this.shouldLogBody(config.data)) {
      logData['body'] = this.truncateBody(config.data);
    }

    this.logger[this.config.logLevel]('HTTP request started', logData);
  }

  private logResponse(context: RequestContext, response: AxiosResponse): void {
    const logData = {
      correlationId: context.correlationId,
      requestId: context.requestId,
      serviceName: context.serviceName,
      method: context.metadata?.method,
      url: this.buildFullUrl(response.config),
      statusCode: response.status,
      responseTime: context.metadata?.responseTime,
      headers: this.sanitizeHeaders(response.headers),
    };

    // Add response body if present and not too large
    if (response.data && this.shouldLogBody(response.data)) {
      logData['body'] = this.truncateBody(response.data);
    }

    this.logger[this.config.logLevel]('HTTP response received', logData);
  }

  private logResponseError(context: RequestContext, error: AxiosError): void {
    const logData = {
      correlationId: context.correlationId,
      requestId: context.requestId,
      serviceName: context.serviceName,
      method: context.metadata?.method,
      url: this.buildFullUrl(error.config),
      statusCode: error.response?.status,
      responseTime: context.metadata?.responseTime,
      error: error.message,
      code: error.code,
    };

    if (error.response?.data && this.shouldLogBody(error.response.data)) {
      logData['responseBody'] = this.truncateBody(error.response.data);
    }

    this.logger.error('HTTP response error', error.stack, 'RequestInterceptor', logData);
  }

  private recordRequestMetrics(context: RequestContext): void {
    this.metricsService.recordHttpRequest(
      context.metadata?.url || 'unknown',
      context.metadata?.method || 'GET',
      0, // Status code not available yet
      0, // Response time not available yet
      'started'
    );
  }

  private recordResponseMetrics(context: RequestContext, response: AxiosResponse): void {
    this.metricsService.recordHttpRequest(
      context.metadata?.url || 'unknown',
      context.metadata?.method || 'GET',
      response.status,
      context.metadata?.responseTime || 0,
      'success'
    );
  }

  private recordErrorMetrics(context: RequestContext, error: AxiosError): void {
    this.metricsService.recordHttpRequest(
      context.metadata?.url || 'unknown',
      context.metadata?.method || 'GET',
      error.response?.status || 0,
      context.metadata?.responseTime || 0,
      'error'
    );
  }

  private addTracingHeaders(config: any, context: RequestContext): void {
    config.headers = {
      ...config.headers,
      'X-Trace-ID': context.correlationId,
      'X-Span-ID': context.requestId,
      'X-Parent-Span-ID': config.headers?.['X-Parent-Span-ID'] || 'root',
    };
  }

  private sanitizeHeaders(headers: any): any {
    if (!headers) return {};

    const sanitized = { ...headers };
    
    for (const sensitiveHeader of this.config.sensitiveHeaders) {
      if (sanitized[sensitiveHeader]) {
        sanitized[sensitiveHeader] = '[REDACTED]';
      }
      if (sanitized[sensitiveHeader.toLowerCase()]) {
        sanitized[sensitiveHeader.toLowerCase()] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  private sanitizeConfig(config: any): any {
    if (!config) return {};

    return {
      method: config.method,
      url: config.url,
      baseURL: config.baseURL,
      timeout: config.timeout,
      headers: this.sanitizeHeaders(config.headers),
    };
  }

  private shouldLogBody(body: any): boolean {
    if (!body) return false;
    
    const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
    return bodyString.length <= this.config.maxLogBodySize;
  }

  private truncateBody(body: any): any {
    if (!body) return body;

    const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
    
    if (bodyString.length <= this.config.maxLogBodySize) {
      return body;
    }

    return bodyString.substring(0, this.config.maxLogBodySize) + '... [TRUNCATED]';
  }

  private buildFullUrl(config: any): string {
    if (!config) return 'unknown';
    
    const baseURL = config.baseURL || '';
    const url = config.url || '';
    
    if (url.startsWith('http')) {
      return url;
    }
    
    return `${baseURL}${url}`;
  }

  private cleanupContext(requestId: string): void {
    this.requestContexts.delete(requestId);
  }

  private generateCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Configuration methods
  updateConfig(updates: Partial<InterceptorConfig>): void {
    Object.assign(this.config, updates);
    
    this.logger.log('Request interceptor configuration updated', {
      updates,
      newConfig: this.config,
    });
  }

  getConfig(): InterceptorConfig {
    return { ...this.config };
  }

  getActiveContexts(): RequestContext[] {
    return Array.from(this.requestContexts.values());
  }

  getContextStats(): {
    activeRequests: number;
    oldestRequestAge: number;
    averageRequestAge: number;
  } {
    const contexts = this.getActiveContexts();
    const now = Date.now();
    
    if (contexts.length === 0) {
      return {
        activeRequests: 0,
        oldestRequestAge: 0,
        averageRequestAge: 0,
      };
    }

    const ages = contexts.map(ctx => now - ctx.startTime);
    
    return {
      activeRequests: contexts.length,
      oldestRequestAge: Math.max(...ages),
      averageRequestAge: ages.reduce((sum, age) => sum + age, 0) / ages.length,
    };
  }
}
