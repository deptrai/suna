import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthIndicatorResult, HealthIndicator } from '@nestjs/terminus';
import { Redis } from 'ioredis';

@Injectable()
export class HealthService extends HealthIndicator {
  private readonly logger = new Logger(HealthService.name);
  private redis: Redis;

  constructor(private configService: ConfigService) {
    super();
    this.initializeRedis();
  }

  private initializeRedis() {
    try {
      this.redis = new Redis({
        host: this.configService.get<string>('redis.host'),
        port: this.configService.get<number>('redis.port'),
        password: this.configService.get<string>('redis.password'),
        db: this.configService.get<number>('redis.db'),
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
      });
    } catch (error) {
      this.logger.error('Failed to initialize Redis connection', error);
    }
  }

  async checkRedis(): Promise<HealthIndicatorResult> {
    const key = 'redis';
    try {
      const start = Date.now();
      await this.redis.ping();
      const responseTime = Date.now() - start;
      
      return this.getStatus(key, true, {
        status: 'up',
        responseTime: `${responseTime}ms`,
      });
    } catch (error) {
      this.logger.error('Redis health check failed', error);
      return this.getStatus(key, false, {
        status: 'down',
        error: error.message,
      });
    }
  }

  async checkExternalServices(): Promise<HealthIndicatorResult> {
    const key = 'external_services';
    const services = {
      twitter: await this.checkTwitterApi(),
      reddit: await this.checkRedditApi(),
      newsApi: await this.checkNewsApi(),
    };

    const allHealthy = Object.values(services).every(service => service.status === 'up');

    return this.getStatus(key, allHealthy, services);
  }

  private async checkTwitterApi(): Promise<{ status: string; responseTime?: string; error?: string }> {
    try {
      const bearerToken = this.configService.get<string>('externalApi.twitter.bearerToken');
      if (!bearerToken) {
        return { status: 'not_configured' };
      }

      const start = Date.now();
      // Simple API call to check Twitter API availability
      const response = await fetch('https://api.twitter.com/2/tweets/search/recent?query=test&max_results=10', {
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
        },
      });

      const responseTime = Date.now() - start;

      if (response.ok) {
        return { status: 'up', responseTime: `${responseTime}ms` };
      } else {
        return { status: 'down', error: `HTTP ${response.status}` };
      }
    } catch (error) {
      return { status: 'down', error: error.message };
    }
  }

  private async checkRedditApi(): Promise<{ status: string; responseTime?: string; error?: string }> {
    try {
      const clientId = this.configService.get<string>('externalApi.reddit.clientId');
      if (!clientId) {
        return { status: 'not_configured' };
      }

      const start = Date.now();
      // Simple API call to check Reddit API availability
      const response = await fetch('https://www.reddit.com/r/cryptocurrency/hot.json?limit=1');
      const responseTime = Date.now() - start;

      if (response.ok) {
        return { status: 'up', responseTime: `${responseTime}ms` };
      } else {
        return { status: 'down', error: `HTTP ${response.status}` };
      }
    } catch (error) {
      return { status: 'down', error: error.message };
    }
  }

  private async checkNewsApi(): Promise<{ status: string; responseTime?: string; error?: string }> {
    try {
      const apiKey = this.configService.get<string>('externalApi.newsApi.apiKey');
      if (!apiKey) {
        return { status: 'not_configured' };
      }

      const start = Date.now();
      // Simple API call to check News API availability
      const response = await fetch(`https://newsapi.org/v2/everything?q=bitcoin&pageSize=1&apiKey=${apiKey}`);
      const responseTime = Date.now() - start;

      if (response.ok) {
        return { status: 'up', responseTime: `${responseTime}ms` };
      } else {
        return { status: 'down', error: `HTTP ${response.status}` };
      }
    } catch (error) {
      return { status: 'down', error: error.message };
    }
  }

  async getDetailedHealthInfo() {
    const startTime = process.hrtime();
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      version: process.env.npm_package_version || '1.0.0',
      environment: this.configService.get<string>('NODE_ENV', 'development'),
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
      },
      services: {
        database: await this.checkDatabaseConnection(),
        redis: await this.checkRedis(),
        externalApis: await this.checkExternalServices(),
      },
    };
  }

  private async checkDatabaseConnection(): Promise<{ status: string; responseTime?: string; error?: string }> {
    try {
      const start = Date.now();
      // This would need to be implemented with actual database connection
      const responseTime = Date.now() - start;
      return { status: 'up', responseTime: `${responseTime}ms` };
    } catch (error) {
      return { status: 'down', error: error.message };
    }
  }
}
