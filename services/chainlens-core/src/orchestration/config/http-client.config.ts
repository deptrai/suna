import { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../common/services/logger.service';

export interface HttpClientConfig {
  timeout: number;
  maxRedirects: number;
  retries: number;
  retryDelay: number;
  retryDelayMultiplier: number;
  maxRetryDelay: number;
  connectionTimeout: number;
  keepAlive: boolean;
  maxSockets: number;
  maxFreeSockets: number;
  enableCompression: boolean;
  validateStatus: (status: number) => boolean;
}

export interface ServiceConfig extends HttpClientConfig {
  baseURL: string;
  serviceName: string;
  healthCheckPath: string;
  priority: number; // For load balancing
  weight: number; // For weighted round-robin
}

@Injectable()
export class HttpClientConfigService {
  private readonly defaultConfig: HttpClientConfig;
  private readonly serviceConfigs: Map<string, ServiceConfig>;

  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
  ) {
    this.defaultConfig = this.loadDefaultConfig();
    this.serviceConfigs = this.loadServiceConfigs();
  }

  private loadDefaultConfig(): HttpClientConfig {
    return {
      timeout: this.configService.get<number>('http.timeout', 30000),
      maxRedirects: this.configService.get<number>('http.maxRedirects', 5),
      retries: this.configService.get<number>('http.retries', 3),
      retryDelay: this.configService.get<number>('http.retryDelay', 1000),
      retryDelayMultiplier: this.configService.get<number>('http.retryDelayMultiplier', 2),
      maxRetryDelay: this.configService.get<number>('http.maxRetryDelay', 10000),
      connectionTimeout: this.configService.get<number>('http.connectionTimeout', 5000),
      keepAlive: this.configService.get<boolean>('http.keepAlive', true),
      maxSockets: this.configService.get<number>('http.maxSockets', 100),
      maxFreeSockets: this.configService.get<number>('http.maxFreeSockets', 10),
      enableCompression: this.configService.get<boolean>('http.enableCompression', true),
      validateStatus: (status: number) => status < 500, // Don't throw on 4xx errors
    };
  }

  private loadServiceConfigs(): Map<string, ServiceConfig> {
    const configs = new Map<string, ServiceConfig>();

    // OnChain Analysis Service
    configs.set('onchain', {
      ...this.defaultConfig,
      baseURL: this.configService.get<string>('services.onchain.url', 'http://localhost:3001'),
      serviceName: 'onchain',
      healthCheckPath: '/api/v1/health',
      timeout: this.configService.get<number>('services.onchain.timeout', 15000),
      retries: this.configService.get<number>('services.onchain.retries', 3),
      retryDelay: this.configService.get<number>('services.onchain.retryDelay', 1000),
      priority: this.configService.get<number>('services.onchain.priority', 1),
      weight: this.configService.get<number>('services.onchain.weight', 1),
    });

    // Sentiment Analysis Service
    configs.set('sentiment', {
      ...this.defaultConfig,
      baseURL: this.configService.get<string>('services.sentiment.url', 'http://localhost:3002'),
      serviceName: 'sentiment',
      healthCheckPath: '/api/v1/health',
      timeout: this.configService.get<number>('services.sentiment.timeout', 20000),
      retries: this.configService.get<number>('services.sentiment.retries', 3),
      retryDelay: this.configService.get<number>('services.sentiment.retryDelay', 1000),
      priority: this.configService.get<number>('services.sentiment.priority', 2),
      weight: this.configService.get<number>('services.sentiment.weight', 1),
    });

    // Tokenomics Analysis Service
    configs.set('tokenomics', {
      ...this.defaultConfig,
      baseURL: this.configService.get<string>('services.tokenomics.url', 'http://localhost:3003'),
      serviceName: 'tokenomics',
      healthCheckPath: '/api/v1/health',
      timeout: this.configService.get<number>('services.tokenomics.timeout', 10000),
      retries: this.configService.get<number>('services.tokenomics.retries', 3),
      retryDelay: this.configService.get<number>('services.tokenomics.retryDelay', 1000),
      priority: this.configService.get<number>('services.tokenomics.priority', 3),
      weight: this.configService.get<number>('services.tokenomics.weight', 1),
    });

    // Team Analysis Service
    configs.set('team', {
      ...this.defaultConfig,
      baseURL: this.configService.get<string>('services.team.url', 'http://localhost:3004'),
      serviceName: 'team',
      healthCheckPath: '/api/v1/health',
      timeout: this.configService.get<number>('services.team.timeout', 25000),
      retries: this.configService.get<number>('services.team.retries', 3),
      retryDelay: this.configService.get<number>('services.team.retryDelay', 1000),
      priority: this.configService.get<number>('services.team.priority', 4),
      weight: this.configService.get<number>('services.team.weight', 1),
    });

    return configs;
  }

  getDefaultConfig(): HttpClientConfig {
    return { ...this.defaultConfig };
  }

  getServiceConfig(serviceName: string): ServiceConfig | null {
    return this.serviceConfigs.get(serviceName) || null;
  }

  getAllServiceConfigs(): Map<string, ServiceConfig> {
    return new Map(this.serviceConfigs);
  }

  updateServiceConfig(serviceName: string, updates: Partial<ServiceConfig>): void {
    const currentConfig = this.serviceConfigs.get(serviceName);
    
    if (currentConfig) {
      const updatedConfig = { ...currentConfig, ...updates };
      this.serviceConfigs.set(serviceName, updatedConfig);
      
      this.logger.log(`Updated HTTP client configuration for ${serviceName}`, {
        serviceName,
        updates,
        newConfig: updatedConfig,
      });
    } else {
      this.logger.warn(`Attempted to update configuration for unknown service: ${serviceName}`);
    }
  }

  createAxiosConfig(serviceName: string, overrides?: Partial<AxiosRequestConfig>): AxiosRequestConfig {
    const serviceConfig = this.getServiceConfig(serviceName);
    
    if (!serviceConfig) {
      throw new Error(`Unknown service: ${serviceName}`);
    }

    const config: AxiosRequestConfig = {
      baseURL: serviceConfig.baseURL,
      timeout: serviceConfig.timeout,
      maxRedirects: serviceConfig.maxRedirects,
      validateStatus: serviceConfig.validateStatus,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'ChainLens-Core/1.0.0',
        'X-Service-Name': 'chainlens-core',
        'X-Client-Version': '1.0.0',
        ...(overrides?.headers || {}),
      },
      ...overrides,
    };

    return config;
  }

  shouldRetry(error: AxiosError, attempt: number, maxRetries: number): boolean {
    // Don't retry if we've exceeded max attempts
    if (attempt >= maxRetries) {
      return false;
    }

    // Don't retry on client errors (4xx)
    if (error.response && error.response.status >= 400 && error.response.status < 500) {
      return false;
    }

    // Retry on network errors, timeouts, and server errors (5xx)
    return (
      !error.response || // Network error
      error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNRESET' ||
      (error.response.status >= 500) // Server error
    );
  }

  calculateRetryDelay(attempt: number, baseDelay: number, multiplier: number, maxDelay: number): number {
    const delay = baseDelay * Math.pow(multiplier, attempt - 1);
    const jitter = Math.random() * 0.1 * delay; // Add 10% jitter
    return Math.min(delay + jitter, maxDelay);
  }

  isRetryableError(error: AxiosError): boolean {
    return this.shouldRetry(error, 1, 1);
  }

  getServiceNames(): string[] {
    return Array.from(this.serviceConfigs.keys());
  }

  validateServiceConfig(config: Partial<ServiceConfig>): string[] {
    const errors: string[] = [];

    if (config.timeout && (config.timeout < 1000 || config.timeout > 60000)) {
      errors.push('Timeout must be between 1000ms and 60000ms');
    }

    if (config.retries && (config.retries < 0 || config.retries > 10)) {
      errors.push('Retries must be between 0 and 10');
    }

    if (config.retryDelay && (config.retryDelay < 100 || config.retryDelay > 10000)) {
      errors.push('Retry delay must be between 100ms and 10000ms');
    }

    if (config.priority && (config.priority < 1 || config.priority > 10)) {
      errors.push('Priority must be between 1 and 10');
    }

    if (config.weight && (config.weight < 0.1 || config.weight > 10)) {
      errors.push('Weight must be between 0.1 and 10');
    }

    return errors;
  }
}
