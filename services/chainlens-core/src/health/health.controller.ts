import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  HealthCheckService,
  HealthCheck,
  TypeOrmHealthIndicator,
  HttpHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private http: HttpHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    private healthService: HealthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get overall health status' })
  @ApiResponse({ status: 200, description: 'Health check successful' })
  @ApiResponse({ status: 503, description: 'Service unhealthy' })
  @HealthCheck()
  check() {
    return this.health.check([
      // Database health
      () => this.db.pingCheck('database'),
      
      // Memory health (heap should not exceed 300MB)
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
      
      // Memory health (RSS should not exceed 500MB)
      () => this.memory.checkRSS('memory_rss', 500 * 1024 * 1024),
      
      // Disk health (should have at least 1GB free)
      () => this.disk.checkStorage('storage', { 
        path: '/', 
        thresholdPercent: 0.9 
      }),
    ]);
  }

  @Get('detailed')
  @ApiOperation({ summary: 'Get detailed health status including microservices' })
  @ApiResponse({ status: 200, description: 'Detailed health check successful' })
  async getDetailedHealth(): Promise<any> {
    return this.healthService.getDetailedHealthStatus();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe for Kubernetes' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  @ApiResponse({ status: 503, description: 'Service not ready' })
  @HealthCheck()
  readiness() {
    return this.health.check([
      // Check if database is accessible
      () => this.db.pingCheck('database'),
      
      // Check if critical microservices are accessible
      () => this.http.pingCheck('onchain-service', 'http://localhost:3001/health'),
      () => this.http.pingCheck('sentiment-service', 'http://localhost:3002/health'),
      () => this.http.pingCheck('tokenomics-service', 'http://localhost:3003/health'),
      () => this.http.pingCheck('team-service', 'http://localhost:3004/health'),
    ]);
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe for Kubernetes' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  @HealthCheck()
  liveness() {
    return this.health.check([
      // Basic memory check
      () => this.memory.checkHeap('memory_heap', 500 * 1024 * 1024),
    ]);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get health metrics for monitoring' })
  @ApiResponse({ status: 200, description: 'Health metrics retrieved' })
  async getHealthMetrics(): Promise<any> {
    return this.healthService.getHealthMetrics();
  }
}
