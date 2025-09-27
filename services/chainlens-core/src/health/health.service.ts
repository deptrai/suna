import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from '../common/services/logger.service';

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  responseTime?: number;
  error?: string;
  lastCheck: string;
}

interface HealthMetrics {
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
  };
  database: {
    connected: boolean;
    connectionCount: number;
  };
  services: ServiceHealth[];
  timestamp: string;
}

@Injectable()
export class HealthService {
  private readonly microservices = [
    { name: 'onchain-service', url: 'http://localhost:3001' },
    { name: 'sentiment-service', url: 'http://localhost:3002' },
    { name: 'tokenomics-service', url: 'http://localhost:3003' },
    { name: 'team-service', url: 'http://localhost:3004' },
  ];

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    private logger: LoggerService,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  async getDetailedHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: ServiceHealth[];
    database: {
      status: 'connected' | 'disconnected';
      responseTime?: number;
    };
    timestamp: string;
  }> {
    const services = await this.checkMicroservicesHealth();
    const database = await this.checkDatabaseHealth();

    // Determine overall status
    const unhealthyServices = services.filter(s => s.status === 'unhealthy').length;
    const totalServices = services.length;
    
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (database.status === 'disconnected') {
      status = 'unhealthy';
    } else if (unhealthyServices === 0) {
      status = 'healthy';
    } else if (unhealthyServices < totalServices / 2) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      services,
      database,
      timestamp: new Date().toISOString(),
    };
  }

  async getHealthMetrics(): Promise<HealthMetrics> {
    const memoryUsage = process.memoryUsage();
    const services = await this.checkMicroservicesHealth();
    const dbConnected = this.dataSource.isInitialized;

    return {
      uptime: process.uptime(),
      memory: {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        percentage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
      },
      cpu: {
        usage: process.cpuUsage().user / 1000000, // Convert to seconds
      },
      database: {
        connected: dbConnected,
        connectionCount: dbConnected ? 1 : 0, // TypeORM doesn't expose pool size easily
      },
      services,
      timestamp: new Date().toISOString(),
    };
  }

  private async checkMicroservicesHealth(): Promise<ServiceHealth[]> {
    const healthChecks = this.microservices.map(async (service) => {
      const startTime = Date.now();
      
      try {
        const response = await firstValueFrom(
          this.httpService.get(`${service.url}/health`, {
            timeout: 5000,
          })
        );
        
        const responseTime = Date.now() - startTime;
        
        return {
          name: service.name,
          status: 'healthy' as const,
          responseTime,
          lastCheck: new Date().toISOString(),
        };
      } catch (error) {
        this.logger.warn(`Health check failed for ${service.name}`, 'HealthService');
        
        return {
          name: service.name,
          status: 'unhealthy' as const,
          error: error instanceof Error ? error.message : 'Unknown error',
          lastCheck: new Date().toISOString(),
        };
      }
    });

    return Promise.all(healthChecks);
  }

  private async checkDatabaseHealth(): Promise<{
    status: 'connected' | 'disconnected';
    responseTime?: number;
  }> {
    const startTime = Date.now();
    
    try {
      if (!this.dataSource.isInitialized) {
        return { status: 'disconnected' };
      }

      // Simple query to test database connectivity
      await this.dataSource.query('SELECT 1');
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'connected',
        responseTime,
      };
    } catch (error) {
      this.logger.error('Database health check failed', error.stack, 'HealthService');
      
      return { status: 'disconnected' };
    }
  }

  // Method to be called by monitoring systems
  async isHealthy(): Promise<boolean> {
    try {
      const health = await this.getDetailedHealthStatus();
      return health.status !== 'unhealthy';
    } catch (error) {
      this.logger.error('Health check failed', error.stack, 'HealthService');
      return false;
    }
  }

  // Method to check if service is ready to serve traffic
  async isReady(): Promise<boolean> {
    try {
      const dbHealth = await this.checkDatabaseHealth();
      return dbHealth.status === 'connected';
    } catch (error) {
      this.logger.error('Readiness check failed', error.stack, 'HealthService');
      return false;
    }
  }
}
