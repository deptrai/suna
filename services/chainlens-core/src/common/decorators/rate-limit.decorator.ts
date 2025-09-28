import { SetMetadata } from '@nestjs/common';
import { RateLimitOptions } from '../guards/rate-limit.guard';

export const RATE_LIMIT_KEY = 'rateLimit';

/**
 * Custom rate limit decorator for specific endpoints
 * @param options Rate limit configuration
 */
export const RateLimit = (options: RateLimitOptions) => 
  SetMetadata(RATE_LIMIT_KEY, options);

/**
 * Predefined rate limit decorators for common use cases
 */

// Very strict rate limiting for expensive operations
export const StrictRateLimit = () => 
  RateLimit({
    requests: 5,
    windowMs: 60000, // 1 minute
  });

// Moderate rate limiting for API endpoints
export const ModerateRateLimit = () => 
  RateLimit({
    requests: 30,
    windowMs: 60000, // 1 minute
  });

// Lenient rate limiting for basic operations
export const LenientRateLimit = () => 
  RateLimit({
    requests: 100,
    windowMs: 60000, // 1 minute
  });

// Analysis-specific rate limits
export const AnalysisRateLimit = () => 
  RateLimit({
    requests: 20,
    windowMs: 300000, // 5 minutes
  });

// Export-specific rate limits
export const ExportRateLimit = () => 
  RateLimit({
    requests: 10,
    windowMs: 600000, // 10 minutes
  });

// Search-specific rate limits
export const SearchRateLimit = () => 
  RateLimit({
    requests: 50,
    windowMs: 60000, // 1 minute
  });

// Admin operations rate limits
export const AdminRateLimit = () => 
  RateLimit({
    requests: 100,
    windowMs: 60000, // 1 minute
  });

// Public API rate limits (for unauthenticated requests)
export const PublicRateLimit = () => 
  RateLimit({
    requests: 10,
    windowMs: 300000, // 5 minutes
  });

// Tier-specific rate limit overrides
export const FreeUserRateLimit = () => 
  RateLimit({
    requests: 5,
    windowMs: 3600000, // 1 hour
  });

export const ProUserRateLimit = () => 
  RateLimit({
    requests: 100,
    windowMs: 3600000, // 1 hour
  });

export const EnterpriseUserRateLimit = () => 
  RateLimit({
    requests: 1000,
    windowMs: 3600000, // 1 hour
  });

// Burst rate limits for specific operations
export const BurstRateLimit = () => 
  RateLimit({
    requests: 10,
    windowMs: 10000, // 10 seconds
  });

// Long-term rate limits
export const DailyRateLimit = () => 
  RateLimit({
    requests: 1000,
    windowMs: 86400000, // 24 hours
  });

export const WeeklyRateLimit = () => 
  RateLimit({
    requests: 5000,
    windowMs: 604800000, // 7 days
  });

// Feature-specific rate limits
export const WebhookRateLimit = () => 
  RateLimit({
    requests: 100,
    windowMs: 3600000, // 1 hour
  });

export const NotificationRateLimit = () => 
  RateLimit({
    requests: 50,
    windowMs: 3600000, // 1 hour
  });

export const ReportRateLimit = () => 
  RateLimit({
    requests: 5,
    windowMs: 3600000, // 1 hour
  });
