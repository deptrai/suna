import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../common/services/logger.service';
import { EnhancedHttpClientService } from './enhanced-http-client.service';
import { ServiceConfig } from '../config/http-client.config';

export interface ServiceEndpoint {
  id: string;
  serviceName: string;
  url: string;
  healthCheckPath: string;
  isHealthy: boolean;
  lastHealthCheck: number;
  responseTime: number;
  consecutiveFailures: number;
  weight: number;
  priority: number;
  metadata: Record<string, any>;
}

export interface LoadBalancingStrategy {
  name: 'round-robin' | 'weighted-round-robin' | 'least-connections' | 'random' | 'priority';
  config?: Record<string, any>;
}

export interface ServiceDiscoveryConfig {
  healthCheckInterval: number;
  healthCheckTimeout: number;
  maxConsecutiveFailures: number;
  loadBalancingStrategy: LoadBalancingStrategy;
  enableAutoDiscovery: boolean;
  discoveryInterval: number;
}

@Injectable()
export class ServiceDiscoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly endpoints: Map<string, ServiceEndpoint[]> = new Map();
  private readonly roundRobinCounters: Map<string, number> = new Map();
  private readonly connectionCounts: Map<string, number> = new Map();
  private readonly config: ServiceDiscoveryConfig;
  private healthCheckTimer?: NodeJS.Timeout;
  private discoveryTimer?: NodeJS.Timeout;

  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
    private httpClient: EnhancedHttpClientService,
  ) {
    this.config = this.loadConfig();
  }

  async onModuleInit() {
    await this.initializeServiceEndpoints();
    this.startHealthChecking();
    
    if (this.config.enableAutoDiscovery) {
      this.startAutoDiscovery();
    }

    this.logger.log('Service Discovery initialized', {
      services: Array.from(this.endpoints.keys()),
      totalEndpoints: this.getTotalEndpointCount(),
      healthCheckInterval: this.config.healthCheckInterval,
      loadBalancingStrategy: this.config.loadBalancingStrategy.name,
    });
  }

  onModuleDestroy() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
    }
  }

  private loadConfig(): ServiceDiscoveryConfig {
    return {
      healthCheckInterval: this.configService.get<number>('discovery.healthCheckInterval', 30000),
      healthCheckTimeout: this.configService.get<number>('discovery.healthCheckTimeout', 5000),
      maxConsecutiveFailures: this.configService.get<number>('discovery.maxConsecutiveFailures', 3),
      loadBalancingStrategy: {
        name: this.configService.get<string>('discovery.loadBalancing', 'weighted-round-robin') as any,
      },
      enableAutoDiscovery: this.configService.get<boolean>('discovery.enableAutoDiscovery', false),
      discoveryInterval: this.configService.get<number>('discovery.discoveryInterval', 60000),
    };
  }

  private async initializeServiceEndpoints(): Promise<void> {
    // Initialize from configuration
    const serviceNames = ['onchain', 'sentiment', 'tokenomics', 'team'];
    
    for (const serviceName of serviceNames) {
      const endpoints = this.loadServiceEndpoints(serviceName);
      this.endpoints.set(serviceName, endpoints);
      this.roundRobinCounters.set(serviceName, 0);
      this.connectionCounts.set(serviceName, 0);
    }
  }

  private loadServiceEndpoints(serviceName: string): ServiceEndpoint[] {
    const baseUrl = this.configService.get<string>(`services.${serviceName}.url`);
    const healthPath = this.configService.get<string>(`services.${serviceName}.healthPath`, '/health');
    const weight = this.configService.get<number>(`services.${serviceName}.weight`, 1);
    const priority = this.configService.get<number>(`services.${serviceName}.priority`, 1);

    if (!baseUrl) {
      this.logger.warn(`No URL configured for service: ${serviceName}`);
      return [];
    }

    // For now, create single endpoint per service
    // In production, this could load multiple endpoints from service registry
    const endpoint: ServiceEndpoint = {
      id: `${serviceName}-primary`,
      serviceName,
      url: baseUrl,
      healthCheckPath: healthPath,
      isHealthy: false,
      lastHealthCheck: 0,
      responseTime: 0,
      consecutiveFailures: 0,
      weight,
      priority,
      metadata: {
        version: '1.0.0',
        region: 'local',
        environment: this.configService.get<string>('NODE_ENV', 'development'),
      },
    };

    return [endpoint];
  }

  private startHealthChecking(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckInterval);

    // Perform initial health check
    this.performHealthChecks();
  }

  private startAutoDiscovery(): void {
    this.discoveryTimer = setInterval(async () => {
      await this.performServiceDiscovery();
    }, this.config.discoveryInterval);
  }

  private async performHealthChecks(): Promise<void> {
    const allEndpoints = this.getAllEndpoints();
    const healthCheckPromises = allEndpoints.map(endpoint => 
      this.performHealthCheck(endpoint)
    );

    await Promise.allSettled(healthCheckPromises);
  }

  private async performHealthCheck(endpoint: ServiceEndpoint): Promise<void> {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get(
        endpoint.serviceName,
        endpoint.healthCheckPath,
        { timeout: this.config.healthCheckTimeout }
      );

      const responseTime = Date.now() - startTime;
      
      endpoint.isHealthy = response.status === 200;
      endpoint.lastHealthCheck = Date.now();
      endpoint.responseTime = responseTime;
      
      if (endpoint.isHealthy) {
        endpoint.consecutiveFailures = 0;
      } else {
        endpoint.consecutiveFailures++;
      }

      this.logger.debug(`Health check completed for ${endpoint.id}`, {
        endpointId: endpoint.id,
        serviceName: endpoint.serviceName,
        isHealthy: endpoint.isHealthy,
        responseTime,
        consecutiveFailures: endpoint.consecutiveFailures,
      });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      endpoint.isHealthy = false;
      endpoint.lastHealthCheck = Date.now();
      endpoint.responseTime = responseTime;
      endpoint.consecutiveFailures++;

      this.logger.warn(`Health check failed for ${endpoint.id}`, {
        endpointId: endpoint.id,
        serviceName: endpoint.serviceName,
        error: error.message,
        responseTime,
        consecutiveFailures: endpoint.consecutiveFailures,
      });
    }
  }

  private async performServiceDiscovery(): Promise<void> {
    // In a real implementation, this would query service registry
    // For now, we'll just log that discovery is running
    this.logger.debug('Performing service discovery', {
      services: Array.from(this.endpoints.keys()),
      totalEndpoints: this.getTotalEndpointCount(),
    });
  }

  // Public API methods

  getHealthyEndpoint(serviceName: string): ServiceEndpoint | null {
    const endpoints = this.endpoints.get(serviceName) || [];
    const healthyEndpoints = endpoints.filter(e => 
      e.isHealthy && e.consecutiveFailures < this.config.maxConsecutiveFailures
    );

    if (healthyEndpoints.length === 0) {
      return null;
    }

    return this.selectEndpoint(healthyEndpoints);
  }

  private selectEndpoint(endpoints: ServiceEndpoint[]): ServiceEndpoint {
    switch (this.config.loadBalancingStrategy.name) {
      case 'round-robin':
        return this.selectRoundRobin(endpoints);
      
      case 'weighted-round-robin':
        return this.selectWeightedRoundRobin(endpoints);
      
      case 'least-connections':
        return this.selectLeastConnections(endpoints);
      
      case 'random':
        return this.selectRandom(endpoints);
      
      case 'priority':
        return this.selectByPriority(endpoints);
      
      default:
        return this.selectRoundRobin(endpoints);
    }
  }

  private selectRoundRobin(endpoints: ServiceEndpoint[]): ServiceEndpoint {
    const serviceName = endpoints[0].serviceName;
    const counter = this.roundRobinCounters.get(serviceName) || 0;
    const selectedIndex = counter % endpoints.length;
    
    this.roundRobinCounters.set(serviceName, counter + 1);
    return endpoints[selectedIndex];
  }

  private selectWeightedRoundRobin(endpoints: ServiceEndpoint[]): ServiceEndpoint {
    const totalWeight = endpoints.reduce((sum, e) => sum + e.weight, 0);
    const random = Math.random() * totalWeight;
    
    let currentWeight = 0;
    for (const endpoint of endpoints) {
      currentWeight += endpoint.weight;
      if (random <= currentWeight) {
        return endpoint;
      }
    }
    
    return endpoints[0];
  }

  private selectLeastConnections(endpoints: ServiceEndpoint[]): ServiceEndpoint {
    return endpoints.reduce((least, current) => {
      const leastConnections = this.connectionCounts.get(least.id) || 0;
      const currentConnections = this.connectionCounts.get(current.id) || 0;
      return currentConnections < leastConnections ? current : least;
    });
  }

  private selectRandom(endpoints: ServiceEndpoint[]): ServiceEndpoint {
    const randomIndex = Math.floor(Math.random() * endpoints.length);
    return endpoints[randomIndex];
  }

  private selectByPriority(endpoints: ServiceEndpoint[]): ServiceEndpoint {
    return endpoints.reduce((highest, current) => 
      current.priority > highest.priority ? current : highest
    );
  }

  incrementConnectionCount(endpointId: string): void {
    const current = this.connectionCounts.get(endpointId) || 0;
    this.connectionCounts.set(endpointId, current + 1);
  }

  decrementConnectionCount(endpointId: string): void {
    const current = this.connectionCounts.get(endpointId) || 0;
    this.connectionCounts.set(endpointId, Math.max(0, current - 1));
  }

  getAllEndpoints(): ServiceEndpoint[] {
    const allEndpoints: ServiceEndpoint[] = [];
    for (const endpoints of this.endpoints.values()) {
      allEndpoints.push(...endpoints);
    }
    return allEndpoints;
  }

  getServiceEndpoints(serviceName: string): ServiceEndpoint[] {
    return this.endpoints.get(serviceName) || [];
  }

  getHealthyServices(): string[] {
    const healthyServices: string[] = [];
    
    for (const [serviceName, endpoints] of this.endpoints) {
      const hasHealthyEndpoint = endpoints.some(e => 
        e.isHealthy && e.consecutiveFailures < this.config.maxConsecutiveFailures
      );
      
      if (hasHealthyEndpoint) {
        healthyServices.push(serviceName);
      }
    }
    
    return healthyServices;
  }

  getServiceStats(serviceName: string): {
    totalEndpoints: number;
    healthyEndpoints: number;
    averageResponseTime: number;
    totalFailures: number;
  } | null {
    const endpoints = this.endpoints.get(serviceName);
    
    if (!endpoints) {
      return null;
    }

    const healthyEndpoints = endpoints.filter(e => e.isHealthy).length;
    const averageResponseTime = endpoints.length > 0
      ? endpoints.reduce((sum, e) => sum + e.responseTime, 0) / endpoints.length
      : 0;
    const totalFailures = endpoints.reduce((sum, e) => sum + e.consecutiveFailures, 0);

    return {
      totalEndpoints: endpoints.length,
      healthyEndpoints,
      averageResponseTime: Math.round(averageResponseTime),
      totalFailures,
    };
  }

  private getTotalEndpointCount(): number {
    return this.getAllEndpoints().length;
  }

  async forceHealthCheck(serviceName?: string): Promise<void> {
    if (serviceName) {
      const endpoints = this.endpoints.get(serviceName) || [];
      const promises = endpoints.map(e => this.performHealthCheck(e));
      await Promise.allSettled(promises);
    } else {
      await this.performHealthChecks();
    }
  }
}
