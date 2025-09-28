/**
 * T2.1.1a: Health Service
 * Health check logic and monitoring
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HealthService {
  constructor(private readonly configService: ConfigService) {}

  async getBasicHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      service: 'onchain-analysis',
      environment: this.configService.get('NODE_ENV', 'development'),
    };
  }

  async getDetailedHealth() {
    const basic = await this.getBasicHealth();
    
    return {
      ...basic,
      memory: process.memoryUsage(),
      dependencies: {
        database: await this.checkDatabase(),
        redis: await this.checkRedis(),
        externalApis: await this.checkExternalApis(),
      },
    };
  }

  async getReadinessCheck() {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const allHealthy = checks.every(check => 
      check.status === 'fulfilled' && check.value.status === 'ok'
    );

    return {
      status: allHealthy ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      checks: checks.map((check, index) => ({
        name: ['database', 'redis'][index],
        status: check.status === 'fulfilled' ? check.value.status : 'error',
        ...(check.status === 'rejected' && { error: check.reason.message }),
      })),
    };
  }

  async getLivenessCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  private async checkDatabase() {
    try {
      // TODO: Implement actual database health check
      return {
        status: 'ok',
        responseTime: 10,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async checkRedis() {
    try {
      // TODO: Implement actual Redis health check
      return {
        status: 'ok',
        responseTime: 5,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async checkExternalApis() {
    const apis = ['moralis', 'defillama', 'dexscreener'];
    const results = {};

    for (const api of apis) {
      try {
        // TODO: Implement actual API health checks
        results[api] = {
          status: 'ok',
          responseTime: Math.floor(Math.random() * 100) + 50,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        results[api] = {
          status: 'error',
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    }

    return results;
  }
}
