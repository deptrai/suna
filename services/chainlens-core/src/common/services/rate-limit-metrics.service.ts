import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';
import { UserContext } from '../../auth/interfaces/user-context.interface';

export interface RateLimitMetrics {
  totalRequests: number;
  blockedRequests: number;
  allowedRequests: number;
  blockRate: number;
  topUsers: Array<{
    userId: string;
    tier: string;
    requests: number;
    blocked: number;
  }>;
  tierBreakdown: Record<string, {
    requests: number;
    blocked: number;
    users: number;
  }>;
}

export interface UserRateLimitStats {
  userId: string;
  tier: string;
  totalRequests: number;
  blockedRequests: number;
  lastRequest: Date;
  currentWindowUsage: number;
  currentWindowLimit: number;
  usagePercentage: number;
}

@Injectable()
export class RateLimitMetricsService {
  private readonly logger = new Logger(RateLimitMetricsService.name);
  private readonly METRICS_KEY_PREFIX = 'rate_limit_metrics';
  private readonly USER_STATS_KEY_PREFIX = 'rate_limit_user_stats';

  constructor(private redisService: RedisService) {}

  /**
   * Record a rate limit event for metrics
   */
  async recordRateLimitEvent(
    user: UserContext | undefined,
    path: string,
    method: string,
    blocked: boolean,
    currentUsage: number,
    limit: number,
  ): Promise<void> {
    try {
      const timestamp = Date.now();
      const hour = Math.floor(timestamp / (1000 * 60 * 60)); // Current hour
      const day = Math.floor(timestamp / (1000 * 60 * 60 * 24)); // Current day
      
      // Record global metrics
      await this.recordGlobalMetrics(hour, day, blocked);
      
      // Record tier-specific metrics
      const tier = user?.tier || 'anonymous';
      await this.recordTierMetrics(tier, hour, day, blocked);
      
      // Record user-specific metrics
      if (user?.id) {
        await this.recordUserMetrics(user, path, method, blocked, currentUsage, limit, timestamp);
      }
      
      // Record endpoint-specific metrics
      await this.recordEndpointMetrics(path, method, tier, hour, blocked);
      
    } catch (error) {
      this.logger.error('Failed to record rate limit metrics', error.stack);
    }
  }

  /**
   * Get comprehensive rate limit metrics
   */
  async getRateLimitMetrics(timeRange: 'hour' | 'day' = 'hour'): Promise<RateLimitMetrics> {
    try {
      const timestamp = Date.now();
      const period = timeRange === 'hour' 
        ? Math.floor(timestamp / (1000 * 60 * 60))
        : Math.floor(timestamp / (1000 * 60 * 60 * 24));
      
      const globalKey = `${this.METRICS_KEY_PREFIX}:global:${period}`;
      const globalMetrics = await this.redisService.get(globalKey);
      
      let totalRequests = 0;
      let blockedRequests = 0;
      
      if (globalMetrics) {
        const parsed = JSON.parse(globalMetrics);
        totalRequests = parsed.total || 0;
        blockedRequests = parsed.blocked || 0;
      }
      
      const allowedRequests = totalRequests - blockedRequests;
      const blockRate = totalRequests > 0 ? (blockedRequests / totalRequests) * 100 : 0;
      
      // Get tier breakdown
      const tierBreakdown = await this.getTierBreakdown(period);
      
      // Get top users
      const topUsers = await this.getTopUsers(period);
      
      return {
        totalRequests,
        blockedRequests,
        allowedRequests,
        blockRate: Math.round(blockRate * 100) / 100,
        topUsers,
        tierBreakdown,
      };
      
    } catch (error) {
      this.logger.error('Failed to get rate limit metrics', error.stack);
      return {
        totalRequests: 0,
        blockedRequests: 0,
        allowedRequests: 0,
        blockRate: 0,
        topUsers: [],
        tierBreakdown: {},
      };
    }
  }

  /**
   * Get user-specific rate limit statistics
   */
  async getUserRateLimitStats(userId: string): Promise<UserRateLimitStats | null> {
    try {
      const userKey = `${this.USER_STATS_KEY_PREFIX}:${userId}`;
      const userStats = await this.redisService.get(userKey);
      
      if (!userStats) {
        return null;
      }
      
      const parsed = JSON.parse(userStats);
      const usagePercentage = parsed.currentWindowLimit > 0 
        ? (parsed.currentWindowUsage / parsed.currentWindowLimit) * 100 
        : 0;
      
      return {
        userId: parsed.userId,
        tier: parsed.tier,
        totalRequests: parsed.totalRequests || 0,
        blockedRequests: parsed.blockedRequests || 0,
        lastRequest: new Date(parsed.lastRequest),
        currentWindowUsage: parsed.currentWindowUsage || 0,
        currentWindowLimit: parsed.currentWindowLimit || 0,
        usagePercentage: Math.round(usagePercentage * 100) / 100,
      };
      
    } catch (error) {
      this.logger.error(`Failed to get user rate limit stats for ${userId}`, error.stack);
      return null;
    }
  }

  /**
   * Get users approaching their rate limits
   */
  async getUsersNearLimit(threshold: number = 80): Promise<UserRateLimitStats[]> {
    try {
      const pattern = `${this.USER_STATS_KEY_PREFIX}:*`;
      const keys = await this.redisService.keys(pattern);
      
      const usersNearLimit: UserRateLimitStats[] = [];
      
      for (const key of keys) {
        const userStats = await this.redisService.get(key);
        if (userStats) {
          const parsed = JSON.parse(userStats);
          const usagePercentage = parsed.currentWindowLimit > 0 
            ? (parsed.currentWindowUsage / parsed.currentWindowLimit) * 100 
            : 0;
          
          if (usagePercentage >= threshold) {
            usersNearLimit.push({
              userId: parsed.userId,
              tier: parsed.tier,
              totalRequests: parsed.totalRequests || 0,
              blockedRequests: parsed.blockedRequests || 0,
              lastRequest: new Date(parsed.lastRequest),
              currentWindowUsage: parsed.currentWindowUsage || 0,
              currentWindowLimit: parsed.currentWindowLimit || 0,
              usagePercentage: Math.round(usagePercentage * 100) / 100,
            });
          }
        }
      }
      
      return usersNearLimit.sort((a, b) => b.usagePercentage - a.usagePercentage);
      
    } catch (error) {
      this.logger.error('Failed to get users near limit', error.stack);
      return [];
    }
  }

  private async recordGlobalMetrics(hour: number, day: number, blocked: boolean): Promise<void> {
    const hourKey = `${this.METRICS_KEY_PREFIX}:global:${hour}`;
    const dayKey = `${this.METRICS_KEY_PREFIX}:global:${day}`;
    
    for (const key of [hourKey, dayKey]) {
      const current = await this.redisService.get(key);
      const metrics = current ? JSON.parse(current) : { total: 0, blocked: 0 };
      
      metrics.total += 1;
      if (blocked) {
        metrics.blocked += 1;
      }
      
      await this.redisService.set(key, JSON.stringify(metrics), 86400 * 7); // 7 days TTL
    }
  }

  private async recordTierMetrics(tier: string, hour: number, day: number, blocked: boolean): Promise<void> {
    const hourKey = `${this.METRICS_KEY_PREFIX}:tier:${tier}:${hour}`;
    const dayKey = `${this.METRICS_KEY_PREFIX}:tier:${tier}:${day}`;
    
    for (const key of [hourKey, dayKey]) {
      const current = await this.redisService.get(key);
      const metrics = current ? JSON.parse(current) : { total: 0, blocked: 0, users: new Set() };
      
      metrics.total += 1;
      if (blocked) {
        metrics.blocked += 1;
      }
      
      await this.redisService.set(key, JSON.stringify(metrics), 86400 * 7); // 7 days TTL
    }
  }

  private async recordUserMetrics(
    user: UserContext,
    path: string,
    method: string,
    blocked: boolean,
    currentUsage: number,
    limit: number,
    timestamp: number,
  ): Promise<void> {
    const userKey = `${this.USER_STATS_KEY_PREFIX}:${user.id}`;
    const current = await this.redisService.get(userKey);
    
    const stats = current ? JSON.parse(current) : {
      userId: user.id,
      tier: user.tier,
      totalRequests: 0,
      blockedRequests: 0,
      lastRequest: timestamp,
      currentWindowUsage: 0,
      currentWindowLimit: 0,
    };
    
    stats.totalRequests += 1;
    if (blocked) {
      stats.blockedRequests += 1;
    }
    stats.lastRequest = timestamp;
    stats.currentWindowUsage = currentUsage;
    stats.currentWindowLimit = limit;
    stats.tier = user.tier; // Update in case tier changed
    
    await this.redisService.set(userKey, JSON.stringify(stats), 86400); // 24 hours TTL
  }

  private async recordEndpointMetrics(
    path: string,
    method: string,
    tier: string,
    hour: number,
    blocked: boolean,
  ): Promise<void> {
    const endpointKey = `${this.METRICS_KEY_PREFIX}:endpoint:${method}:${path}:${hour}`;
    const current = await this.redisService.get(endpointKey);
    
    const metrics = current ? JSON.parse(current) : { total: 0, blocked: 0, tiers: {} };
    
    metrics.total += 1;
    if (blocked) {
      metrics.blocked += 1;
    }
    
    if (!metrics.tiers[tier]) {
      metrics.tiers[tier] = { total: 0, blocked: 0 };
    }
    metrics.tiers[tier].total += 1;
    if (blocked) {
      metrics.tiers[tier].blocked += 1;
    }
    
    await this.redisService.set(endpointKey, JSON.stringify(metrics), 86400 * 3); // 3 days TTL
  }

  private async getTierBreakdown(period: number): Promise<Record<string, any>> {
    const tiers = ['free', 'pro', 'enterprise', 'admin'];
    const breakdown: Record<string, any> = {};
    
    for (const tier of tiers) {
      const tierKey = `${this.METRICS_KEY_PREFIX}:tier:${tier}:${period}`;
      const tierMetrics = await this.redisService.get(tierKey);
      
      if (tierMetrics) {
        const parsed = JSON.parse(tierMetrics);
        breakdown[tier] = {
          requests: parsed.total || 0,
          blocked: parsed.blocked || 0,
          users: parsed.users ? parsed.users.length : 0,
        };
      } else {
        breakdown[tier] = { requests: 0, blocked: 0, users: 0 };
      }
    }
    
    return breakdown;
  }

  private async getTopUsers(period: number, limit: number = 10): Promise<Array<any>> {
    try {
      const pattern = `${this.USER_STATS_KEY_PREFIX}:*`;
      const keys = await this.redisService.keys(pattern);
      
      const users: Array<any> = [];
      
      for (const key of keys.slice(0, 50)) { // Limit to prevent performance issues
        const userStats = await this.redisService.get(key);
        if (userStats) {
          const parsed = JSON.parse(userStats);
          users.push({
            userId: parsed.userId,
            tier: parsed.tier,
            requests: parsed.totalRequests || 0,
            blocked: parsed.blockedRequests || 0,
          });
        }
      }
      
      return users
        .sort((a, b) => b.requests - a.requests)
        .slice(0, limit);
        
    } catch (error) {
      this.logger.error('Failed to get top users', error.stack);
      return [];
    }
  }
}
