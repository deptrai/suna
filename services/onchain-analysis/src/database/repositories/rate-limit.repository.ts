/**
 * T2.1.1c: Rate Limit Repository
 * Repository for managing rate limit operations
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { RateLimitEntity } from '../entities/rate-limit.entity';

@Injectable()
export class RateLimitRepository {
  constructor(
    @InjectRepository(RateLimitEntity)
    private readonly repository: Repository<RateLimitEntity>,
  ) {}

  async findCurrentWindow(
    userId: string,
    endpoint: string,
  ): Promise<RateLimitEntity | null> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    return this.repository.findOne({
      where: {
        userId,
        endpoint,
        windowStart: MoreThan(oneHourAgo),
      },
      order: { windowStart: 'DESC' },
    });
  }

  async incrementRequestCount(
    userId: string,
    endpoint: string,
    userTier?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RateLimitEntity> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - (now.getTime() % (60 * 60 * 1000))); // Start of current hour

    let entity = await this.repository.findOne({
      where: { userId, endpoint, windowStart },
    });

    if (entity) {
      entity.requestCount += 1;
      entity.updatedAt = now;
      if (userTier) entity.userTier = userTier;
      if (ipAddress) entity.ipAddress = ipAddress;
      if (userAgent) entity.userAgent = userAgent;
    } else {
      entity = this.repository.create({
        userId,
        endpoint,
        windowStart,
        requestCount: 1,
        userTier,
        ipAddress,
        userAgent,
        maxRequests: this.getMaxRequestsForTier(userTier),
      });
    }

    return this.repository.save(entity);
  }

  async checkRateLimit(
    userId: string,
    endpoint: string,
    userTier?: string,
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: Date;
    current: number;
    limit: number;
  }> {
    const entity = await this.findCurrentWindow(userId, endpoint);
    const maxRequests = this.getMaxRequestsForTier(userTier);

    if (!entity) {
      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetTime: this.getNextWindowStart(),
        current: 0,
        limit: maxRequests,
      };
    }

    const allowed = entity.requestCount < maxRequests;
    const remaining = Math.max(0, maxRequests - entity.requestCount);

    return {
      allowed,
      remaining,
      resetTime: entity.windowEndTime,
      current: entity.requestCount,
      limit: maxRequests,
    };
  }

  async getUserStats(userId: string): Promise<{
    totalRequests: number;
    endpointStats: Record<string, { requests: number; lastUsed: Date }>;
  }> {
    const entities = await this.repository.find({
      where: { userId },
      order: { windowStart: 'DESC' },
      take: 100, // Last 100 windows
    });

    const totalRequests = entities.reduce((sum, entity) => sum + entity.requestCount, 0);
    const endpointStats: Record<string, { requests: number; lastUsed: Date }> = {};

    entities.forEach(entity => {
      if (!endpointStats[entity.endpoint]) {
        endpointStats[entity.endpoint] = {
          requests: 0,
          lastUsed: entity.updatedAt,
        };
      }
      endpointStats[entity.endpoint].requests += entity.requestCount;
      if (entity.updatedAt > endpointStats[entity.endpoint].lastUsed) {
        endpointStats[entity.endpoint].lastUsed = entity.updatedAt;
      }
    });

    return { totalRequests, endpointStats };
  }

  async cleanup(olderThanHours: number = 24): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    
    const result = await this.repository.delete({
      windowStart: MoreThan(cutoffDate),
    });
    
    return result.affected || 0;
  }

  private getMaxRequestsForTier(userTier?: string): number {
    switch (userTier?.toLowerCase()) {
      case 'enterprise':
        return 1000;
      case 'pro':
        return 500;
      case 'free':
      default:
        return 100;
    }
  }

  private getNextWindowStart(): Date {
    const now = new Date();
    const nextHour = new Date(now.getTime() + 60 * 60 * 1000);
    return new Date(nextHour.getTime() - (nextHour.getTime() % (60 * 60 * 1000)));
  }
}
