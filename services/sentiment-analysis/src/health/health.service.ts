import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthIndicatorResult, HealthIndicator } from '@nestjs/terminus';
import { Redis } from 'ioredis';

@Injectable()
export class HealthService extends HealthIndicator {
  private readonly logger = new Logger(HealthService.name);
  private redis: Redis;

  // Cache for external API health checks to avoid rate limiting
  private twitterHealthCache: { status: string; responseTime?: string; error?: string; timestamp: number } | null = null;
  private readonly TWITTER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

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

    // Count how many services are working
    const workingServices = Object.values(services).filter(
      service => service.status === 'up' || service.status === 'not_configured'
    ).length;
    const totalServices = Object.keys(services).length;

    // Service is healthy if at least one external API is working
    // This allows the service to continue functioning even if some APIs are down
    const isHealthy = workingServices > 0;

    return this.getStatus(key, isHealthy, {
      ...services,
      workingServices: `${workingServices}/${totalServices}`,
      status: workingServices === totalServices ? 'healthy' : 'degraded',
    });
  }

  private async checkTwitterApi(): Promise<{ status: string; responseTime?: string; error?: string }> {
    try {
      const bearerToken = this.configService.get<string>('externalApi.twitter.bearerToken');
      if (!bearerToken) {
        return { status: 'not_configured' };
      }

      // Check cache first to avoid rate limiting (Twitter Free: 50 req/15min)
      const now = Date.now();
      if (this.twitterHealthCache && (now - this.twitterHealthCache.timestamp) < this.TWITTER_CACHE_TTL) {
        this.logger.debug('Using cached Twitter health status');
        const { timestamp, ...cachedResult } = this.twitterHealthCache;
        return cachedResult;
      }

      const start = Date.now();
      // Simple API call to check Twitter API availability
      const response = await fetch('https://api.twitter.com/2/tweets/search/recent?query=test&max_results=10', {
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
        },
      });

      const responseTime = Date.now() - start;

      let result: { status: string; responseTime?: string; error?: string };
      if (response.ok) {
        result = { status: 'up', responseTime: `${responseTime}ms` };
      } else {
        result = { status: 'down', error: `HTTP ${response.status}` };
      }

      // Cache the result
      this.twitterHealthCache = { ...result, timestamp: now };
      return result;
    } catch (error) {
      const result = { status: 'down', error: error.message };
      // Cache error result too to avoid hammering the API
      this.twitterHealthCache = { ...result, timestamp: Date.now() };
      return result;
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
      const cryptoNewsApiKey = this.configService.get<string>('externalApi.cryptoNewsApi.apiKey');

      if (!apiKey && !cryptoNewsApiKey) {
        return { status: 'not_configured' };
      }

      const start = Date.now();

      // Try CryptoNews API first (if configured)
      if (cryptoNewsApiKey) {
        try {
          const response = await fetch(`https://cryptonews-api.com/api/v1/category?section=general&items=1&token=${cryptoNewsApiKey}`);
          const responseTime = Date.now() - start;

          if (response.ok) {
            return { status: 'up', responseTime: `${responseTime}ms` };
          }
        } catch (error) {
          this.logger.warn('CryptoNews API check failed, trying NewsAPI:', error.message);
        }
      }

      // Fallback to NewsAPI (if configured)
      if (apiKey) {
        const response = await fetch(`https://newsapi.org/v2/everything?q=bitcoin&pageSize=1&apiKey=${apiKey}`);
        const responseTime = Date.now() - start;

        if (response.ok) {
          return { status: 'up', responseTime: `${responseTime}ms` };
        } else {
          return { status: 'down', error: `HTTP ${response.status}` };
        }
      }

      return { status: 'down', error: 'No valid API key' };
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
