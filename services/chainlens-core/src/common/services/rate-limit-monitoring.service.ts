import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

export interface RateLimitStats {
  userId?: string;
  ip?: string;
  endpoint: string;
  method: string;
  timestamp: Date;
  tier: string;
  requestCount: number;
  limitExceeded: boolean;
  resetTime: Date;
}

export interface RateLimitSummary {
  totalRequests: number;
  totalBlocked: number;
  blockRate: number;
  topUsers: Array<{
    userId: string;
    requestCount: number;
    blockedCount: number;
  }>;
  topEndpoints: Array<{
    endpoint: string;
    requestCount: number;
    blockedCount: number;
  }>;
  tierBreakdown: Record<string, {
    requests: number;
    blocked: number;
    blockRate: number;
  }>;
}

@Injectable()
export class RateLimitMonitoringService {
  constructor(private redisService: RedisService) {}

  /**
   * Log rate limit event for monitoring
   */
  async logRateLimitEvent(stats: RateLimitStats): Promise<void> {
    try {
      const timestamp = Date.now();
      const key = `rate_limit_log:${timestamp}:${Math.random().toString(36).substr(2, 9)}`;
      
      await this.redisService.set(
        key,
        JSON.stringify(stats),
        3600 * 24 * 7, // Keep logs for 7 days
      );

      // Update counters for quick stats
      await this.updateCounters(stats);
    } catch (error) {
      console.error('Failed to log rate limit event:', error);
    }
  }

  /**
   * Get rate limit statistics for a time period
   */
  async getRateLimitStats(
    startTime: Date,
    endTime: Date,
  ): Promise<RateLimitSummary> {
    try {
      const logs = await this.getRateLimitLogs(startTime, endTime);
      return this.calculateSummary(logs);
    } catch (error) {
      console.error('Failed to get rate limit stats:', error);
      return this.getEmptySummary();
    }
  }

  /**
   * Get rate limit statistics for a specific user
   */
  async getUserRateLimitStats(
    userId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<{
    totalRequests: number;
    blockedRequests: number;
    blockRate: number;
    endpointBreakdown: Record<string, { requests: number; blocked: number }>;
    hourlyBreakdown: Array<{ hour: string; requests: number; blocked: number }>;
  }> {
    try {
      const logs = await this.getRateLimitLogs(startTime, endTime);
      const userLogs = logs.filter(log => log.userId === userId);

      const totalRequests = userLogs.length;
      const blockedRequests = userLogs.filter(log => log.limitExceeded).length;
      const blockRate = totalRequests > 0 ? (blockedRequests / totalRequests) * 100 : 0;

      // Endpoint breakdown
      const endpointBreakdown: Record<string, { requests: number; blocked: number }> = {};
      userLogs.forEach(log => {
        if (!endpointBreakdown[log.endpoint]) {
          endpointBreakdown[log.endpoint] = { requests: 0, blocked: 0 };
        }
        endpointBreakdown[log.endpoint].requests++;
        if (log.limitExceeded) {
          endpointBreakdown[log.endpoint].blocked++;
        }
      });

      // Hourly breakdown
      const hourlyBreakdown: Array<{ hour: string; requests: number; blocked: number }> = [];
      const hourlyData: Record<string, { requests: number; blocked: number }> = {};
      
      userLogs.forEach(log => {
        const hour = new Date(log.timestamp).toISOString().substr(0, 13) + ':00:00';
        if (!hourlyData[hour]) {
          hourlyData[hour] = { requests: 0, blocked: 0 };
        }
        hourlyData[hour].requests++;
        if (log.limitExceeded) {
          hourlyData[hour].blocked++;
        }
      });

      Object.entries(hourlyData).forEach(([hour, data]) => {
        hourlyBreakdown.push({ hour, ...data });
      });

      hourlyBreakdown.sort((a, b) => a.hour.localeCompare(b.hour));

      return {
        totalRequests,
        blockedRequests,
        blockRate,
        endpointBreakdown,
        hourlyBreakdown,
      };
    } catch (error) {
      console.error('Failed to get user rate limit stats:', error);
      return {
        totalRequests: 0,
        blockedRequests: 0,
        blockRate: 0,
        endpointBreakdown: {},
        hourlyBreakdown: [],
      };
    }
  }

  /**
   * Get current rate limit status for a user
   */
  async getCurrentUserStatus(userId: string): Promise<{
    currentHourRequests: number;
    hourlyLimit: number;
    remainingRequests: number;
    resetTime: Date;
    tier: string;
  }> {
    try {
      const windowStart = Math.floor(Date.now() / 3600000) * 3600000;
      const key = `rate_limit:user:${userId}:${windowStart}`;
      
      const currentCount = await this.redisService.get(key);
      const requests = currentCount ? parseInt(currentCount, 10) : 0;
      
      // Get user tier from recent logs or default to free
      const recentLogs = await this.getRateLimitLogs(
        new Date(Date.now() - 3600000),
        new Date(),
      );
      const userLog = recentLogs.find(log => log.userId === userId);
      const tier = userLog?.tier || 'free';
      
      const tierLimits = {
        free: 10,
        pro: 1000,
        enterprise: 10000,
        admin: 100000,
      };
      
      const hourlyLimit = tierLimits[tier as keyof typeof tierLimits] || tierLimits.free;
      const remainingRequests = Math.max(0, hourlyLimit - requests);
      const resetTime = new Date(windowStart + 3600000);

      return {
        currentHourRequests: requests,
        hourlyLimit,
        remainingRequests,
        resetTime,
        tier,
      };
    } catch (error) {
      console.error('Failed to get current user status:', error);
      return {
        currentHourRequests: 0,
        hourlyLimit: 10,
        remainingRequests: 10,
        resetTime: new Date(Date.now() + 3600000),
        tier: 'free',
      };
    }
  }

  /**
   * Clean up old rate limit logs
   */
  async cleanupOldLogs(olderThanDays: number = 7): Promise<number> {
    try {
      const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
      const pattern = 'rate_limit_log:*';
      const keys = await this.redisService.keys(pattern);
      
      let deletedCount = 0;
      for (const key of keys) {
        const timestamp = parseInt(key.split(':')[1]);
        if (timestamp < cutoffTime) {
          await this.redisService.del(key);
          deletedCount++;
        }
      }
      
      return deletedCount;
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
      return 0;
    }
  }

  private async updateCounters(stats: RateLimitStats): Promise<void> {
    const date = new Date().toISOString().substr(0, 10); // YYYY-MM-DD
    
    // Daily counters
    await this.redisService.incr(`rate_limit_counter:daily:${date}:total`);
    if (stats.limitExceeded) {
      await this.redisService.incr(`rate_limit_counter:daily:${date}:blocked`);
    }
    
    // Tier counters
    await this.redisService.incr(`rate_limit_counter:daily:${date}:tier:${stats.tier}`);
    if (stats.limitExceeded) {
      await this.redisService.incr(`rate_limit_counter:daily:${date}:tier:${stats.tier}:blocked`);
    }
    
    // Set expiration for counters (30 days)
    await this.redisService.expire(`rate_limit_counter:daily:${date}:total`, 30 * 24 * 3600);
    await this.redisService.expire(`rate_limit_counter:daily:${date}:blocked`, 30 * 24 * 3600);
    await this.redisService.expire(`rate_limit_counter:daily:${date}:tier:${stats.tier}`, 30 * 24 * 3600);
    await this.redisService.expire(`rate_limit_counter:daily:${date}:tier:${stats.tier}:blocked`, 30 * 24 * 3600);
  }

  private async getRateLimitLogs(startTime: Date, endTime: Date): Promise<RateLimitStats[]> {
    const pattern = 'rate_limit_log:*';
    const keys = await this.redisService.keys(pattern);
    const logs: RateLimitStats[] = [];
    
    for (const key of keys) {
      const timestamp = parseInt(key.split(':')[1]);
      if (timestamp >= startTime.getTime() && timestamp <= endTime.getTime()) {
        const logData = await this.redisService.get(key);
        if (logData) {
          try {
            logs.push(JSON.parse(logData));
          } catch (error) {
            console.error('Failed to parse log data:', error);
          }
        }
      }
    }
    
    return logs;
  }

  private calculateSummary(logs: RateLimitStats[]): RateLimitSummary {
    const totalRequests = logs.length;
    const totalBlocked = logs.filter(log => log.limitExceeded).length;
    const blockRate = totalRequests > 0 ? (totalBlocked / totalRequests) * 100 : 0;

    // Top users
    const userStats: Record<string, { requests: number; blocked: number }> = {};
    logs.forEach(log => {
      if (log.userId) {
        if (!userStats[log.userId]) {
          userStats[log.userId] = { requests: 0, blocked: 0 };
        }
        userStats[log.userId].requests++;
        if (log.limitExceeded) {
          userStats[log.userId].blocked++;
        }
      }
    });

    const topUsers = Object.entries(userStats)
      .map(([userId, stats]) => ({
        userId,
        requestCount: stats.requests,
        blockedCount: stats.blocked,
      }))
      .sort((a, b) => b.requestCount - a.requestCount)
      .slice(0, 10);

    // Top endpoints
    const endpointStats: Record<string, { requests: number; blocked: number }> = {};
    logs.forEach(log => {
      if (!endpointStats[log.endpoint]) {
        endpointStats[log.endpoint] = { requests: 0, blocked: 0 };
      }
      endpointStats[log.endpoint].requests++;
      if (log.limitExceeded) {
        endpointStats[log.endpoint].blocked++;
      }
    });

    const topEndpoints = Object.entries(endpointStats)
      .map(([endpoint, stats]) => ({
        endpoint,
        requestCount: stats.requests,
        blockedCount: stats.blocked,
      }))
      .sort((a, b) => b.requestCount - a.requestCount)
      .slice(0, 10);

    // Tier breakdown
    const tierStats: Record<string, { requests: number; blocked: number }> = {};
    logs.forEach(log => {
      if (!tierStats[log.tier]) {
        tierStats[log.tier] = { requests: 0, blocked: 0 };
      }
      tierStats[log.tier].requests++;
      if (log.limitExceeded) {
        tierStats[log.tier].blocked++;
      }
    });

    const tierBreakdown: Record<string, { requests: number; blocked: number; blockRate: number }> = {};
    Object.entries(tierStats).forEach(([tier, stats]) => {
      tierBreakdown[tier] = {
        requests: stats.requests,
        blocked: stats.blocked,
        blockRate: stats.requests > 0 ? (stats.blocked / stats.requests) * 100 : 0,
      };
    });

    return {
      totalRequests,
      totalBlocked,
      blockRate,
      topUsers,
      topEndpoints,
      tierBreakdown,
    };
  }

  private getEmptySummary(): RateLimitSummary {
    return {
      totalRequests: 0,
      totalBlocked: 0,
      blockRate: 0,
      topUsers: [],
      topEndpoints: [],
      tierBreakdown: {},
    };
  }
}
