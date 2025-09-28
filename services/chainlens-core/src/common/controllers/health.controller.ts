import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    database: 'healthy' | 'unhealthy';
    redis: 'healthy' | 'unhealthy';
    auth: 'healthy' | 'unhealthy';
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
  };
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly startTime = Date.now();

  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({
    status: 200,
    description: 'Service health status',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['healthy', 'unhealthy'] },
        timestamp: { type: 'string' },
        uptime: { type: 'number' },
        version: { type: 'string' },
        environment: { type: 'string' },
        services: {
          type: 'object',
          properties: {
            database: { type: 'string', enum: ['healthy', 'unhealthy'] },
            redis: { type: 'string', enum: ['healthy', 'unhealthy'] },
            auth: { type: 'string', enum: ['healthy', 'unhealthy'] },
          },
        },
        memory: {
          type: 'object',
          properties: {
            used: { type: 'number' },
            total: { type: 'number' },
            percentage: { type: 'number' },
          },
        },
        cpu: {
          type: 'object',
          properties: {
            usage: { type: 'number' },
          },
        },
      },
    },
  })
  async getHealth(): Promise<HealthCheckResponse> {
    const memoryUsage = process.memoryUsage();
    const uptime = Date.now() - this.startTime;

    // In a real implementation, these would be actual health checks
    const services = {
      database: 'healthy' as const,
      redis: 'healthy' as const,
      auth: 'healthy' as const,
    };

    const memory = {
      used: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
      total: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
      percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
    };

    const cpu = {
      usage: Math.round(Math.random() * 100), // Mock CPU usage
    };

    const allServicesHealthy = Object.values(services).every(status => status === 'healthy');

    return {
      status: allServicesHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime,
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services,
      memory,
      cpu,
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness check endpoint' })
  @ApiResponse({
    status: 200,
    description: 'Service readiness status',
    schema: {
      type: 'object',
      properties: {
        ready: { type: 'boolean' },
        timestamp: { type: 'string' },
        checks: {
          type: 'object',
          properties: {
            database: { type: 'boolean' },
            redis: { type: 'boolean' },
            auth: { type: 'boolean' },
          },
        },
      },
    },
  })
  async getReadiness(): Promise<{
    ready: boolean;
    timestamp: string;
    checks: {
      database: boolean;
      redis: boolean;
      auth: boolean;
    };
  }> {
    // In a real implementation, these would be actual readiness checks
    const checks = {
      database: true,
      redis: true,
      auth: true,
    };

    const ready = Object.values(checks).every(check => check);

    return {
      ready,
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness check endpoint' })
  @ApiResponse({
    status: 200,
    description: 'Service liveness status',
    schema: {
      type: 'object',
      properties: {
        alive: { type: 'boolean' },
        timestamp: { type: 'string' },
        uptime: { type: 'number' },
      },
    },
  })
  async getLiveness(): Promise<{
    alive: boolean;
    timestamp: string;
    uptime: number;
  }> {
    const uptime = Date.now() - this.startTime;

    return {
      alive: true,
      timestamp: new Date().toISOString(),
      uptime,
    };
  }
}
