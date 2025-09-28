import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { RedisService } from '../services/redis.service';
import { UserContext } from '../../auth/interfaces/user-context.interface';

export interface RateLimitOptions {
  requests: number;
  windowMs: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}

export interface TierRateLimits {
  free: RateLimitOptions;
  pro: RateLimitOptions;
  enterprise: RateLimitOptions;
  admin: RateLimitOptions;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly defaultLimits: TierRateLimits = {
    free: {
      requests: 10,
      windowMs: 3600000, // 1 hour
    },
    pro: {
      requests: 1000,
      windowMs: 3600000, // 1 hour
    },
    enterprise: {
      requests: 10000,
      windowMs: 3600000, // 1 hour
    },
    admin: {
      requests: 100000,
      windowMs: 3600000, // 1 hour - effectively unlimited
    },
  };

  constructor(
    private reflector: Reflector,
    private redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const user = request.user as UserContext;

    // Skip rate limiting for health checks and docs
    if (this.shouldSkipRateLimit(request)) {
      return true;
    }

    // Get custom rate limit from decorator or use tier-based default
    const customLimit = this.reflector.getAllAndOverride<RateLimitOptions>('rateLimit', [
      context.getHandler(),
      context.getClass(),
    ]);

    const rateLimit = customLimit || this.getTierRateLimit(user?.tier || 'free');
    const key = this.generateKey(request, user);

    try {
      const result = await this.checkRateLimit(key, rateLimit);
      
      // Set rate limit headers
      this.setRateLimitHeaders(response, result, rateLimit);

      if (result.exceeded) {
        throw new HttpException(
          {
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Rate limit exceeded. Please try again later.',
              details: {
                limit: rateLimit.requests,
                windowMs: rateLimit.windowMs,
                resetTime: new Date(Date.now() + result.resetTime),
              },
            },
            meta: {
              timestamp: new Date().toISOString(),
              version: '1.0',
            },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      // If Redis is down, allow request but log error
      console.error('Rate limiting error:', error);
      return true;
    }
  }

  private shouldSkipRateLimit(request: Request): boolean {
    const skipPaths = [
      '/api/v1/health',
      '/api/docs',
      '/api/docs-json',
      '/favicon.ico',
    ];

    return skipPaths.some(path => request.path.startsWith(path));
  }

  private getTierRateLimit(tier: string): RateLimitOptions {
    return this.defaultLimits[tier as keyof TierRateLimits] || this.defaultLimits.free;
  }

  private generateKey(request: Request, user?: UserContext): string {
    if (user?.id) {
      return `rate_limit:user:${user.id}`;
    }
    
    // Fallback to IP-based rate limiting for unauthenticated requests
    const ip = request.ip || request.connection.remoteAddress || 'unknown';
    return `rate_limit:ip:${ip}`;
  }

  private async checkRateLimit(
    key: string,
    options: RateLimitOptions,
  ): Promise<{
    count: number;
    exceeded: boolean;
    resetTime: number;
  }> {
    const windowStart = Math.floor(Date.now() / options.windowMs) * options.windowMs;
    const windowKey = `${key}:${windowStart}`;

    // Get current count
    const currentCount = await this.redisService.get(windowKey);
    const count = currentCount ? parseInt(currentCount, 10) : 0;

    // Increment counter
    const newCount = await this.redisService.incr(windowKey);
    
    // Set expiration if this is the first request in the window
    if (newCount === 1) {
      await this.redisService.expire(windowKey, Math.ceil(options.windowMs / 1000));
    }

    const exceeded = newCount > options.requests;
    const resetTime = windowStart + options.windowMs - Date.now();

    return {
      count: newCount,
      exceeded,
      resetTime: Math.max(0, resetTime),
    };
  }

  private setRateLimitHeaders(
    response: Response,
    result: { count: number; resetTime: number },
    options: RateLimitOptions,
  ): void {
    response.setHeader('X-RateLimit-Limit', options.requests);
    response.setHeader('X-RateLimit-Remaining', Math.max(0, options.requests - result.count));
    response.setHeader('X-RateLimit-Reset', new Date(Date.now() + result.resetTime).toISOString());
    response.setHeader('X-RateLimit-Window', options.windowMs);
  }
}
