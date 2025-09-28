import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { RedisService } from '../services/redis.service';
import { RateLimitMetricsService } from '../services/rate-limit-metrics.service';
import { UserContext } from '../../auth/interfaces/user-context.interface';
import { JWT_CONSTANTS } from '../../auth/constants/jwt.constants';

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
  private readonly logger = new Logger(RateLimitGuard.name);

  private readonly defaultLimits: TierRateLimits = {
    free: {
      requests: JWT_CONSTANTS.RATE_LIMITS.FREE.requests,
      windowMs: JWT_CONSTANTS.RATE_LIMITS.FREE.window * 1000, // Convert to milliseconds
    },
    pro: {
      requests: JWT_CONSTANTS.RATE_LIMITS.PRO.requests,
      windowMs: JWT_CONSTANTS.RATE_LIMITS.PRO.window * 1000, // Convert to milliseconds
    },
    enterprise: {
      requests: JWT_CONSTANTS.RATE_LIMITS.ENTERPRISE.requests,
      windowMs: JWT_CONSTANTS.RATE_LIMITS.ENTERPRISE.window * 1000, // Convert to milliseconds
    },
    admin: {
      requests: JWT_CONSTANTS.RATE_LIMITS.ENTERPRISE.requests * 10, // 10x enterprise for admin
      windowMs: JWT_CONSTANTS.RATE_LIMITS.ENTERPRISE.window * 1000, // Convert to milliseconds
    },
  };

  constructor(
    private reflector: Reflector,
    private redisService: RedisService,
    private rateLimitMetricsService: RateLimitMetricsService,
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
      this.setRateLimitHeaders(response, result, rateLimit, user);

      // Log rate limit usage for monitoring
      this.logRateLimitUsage(user, request, result, rateLimit);

      // Record metrics for monitoring and analytics
      await this.rateLimitMetricsService.recordRateLimitEvent(
        user,
        request.path,
        request.method,
        result.exceeded,
        result.count,
        rateLimit.requests,
      );

      if (result.exceeded) {
        this.logger.warn(`Rate limit exceeded for ${user?.tier || 'anonymous'} user`, {
          userId: user?.id,
          tier: user?.tier,
          path: request.path,
          limit: rateLimit.requests,
          current: result.count,
          resetTime: new Date(Date.now() + result.resetTime),
        });

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
                retryAfter: Math.ceil(result.resetTime / 1000),
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
      this.logger.error('Rate limiting error - allowing request', error.stack);
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
    user?: UserContext,
  ): void {
    const remaining = Math.max(0, options.requests - result.count);
    const resetTimestamp = Math.ceil((Date.now() + result.resetTime) / 1000);

    // Standard rate limit headers
    response.setHeader('X-RateLimit-Limit', options.requests);
    response.setHeader('X-RateLimit-Remaining', remaining);
    response.setHeader('X-RateLimit-Reset', resetTimestamp);
    response.setHeader('X-RateLimit-Window', Math.ceil(options.windowMs / 1000));

    // Additional headers for better client experience
    response.setHeader('X-RateLimit-Used', result.count);
    response.setHeader('X-RateLimit-Tier', user?.tier || 'free');

    // Add retry-after header if close to limit
    if (remaining <= 5) {
      response.setHeader('Retry-After', Math.ceil(result.resetTime / 1000));
    }
  }

  private logRateLimitUsage(
    user: UserContext | undefined,
    request: Request,
    result: { count: number; resetTime: number },
    options: RateLimitOptions,
  ): void {
    const remaining = Math.max(0, options.requests - result.count);
    const usagePercent = (result.count / options.requests) * 100;

    // Log high usage for monitoring
    if (usagePercent >= 80) {
      this.logger.warn(`High rate limit usage detected`, {
        userId: user?.id,
        tier: user?.tier,
        path: request.path,
        method: request.method,
        usage: `${result.count}/${options.requests}`,
        usagePercent: usagePercent.toFixed(1),
        remaining,
        resetTime: new Date(Date.now() + result.resetTime),
      });
    } else if (usagePercent >= 50) {
      this.logger.debug(`Moderate rate limit usage`, {
        userId: user?.id,
        tier: user?.tier,
        usage: `${result.count}/${options.requests}`,
        usagePercent: usagePercent.toFixed(1),
      });
    }
  }
}
