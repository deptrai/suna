import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisConfigService } from './config/redis.config';
import { RedisService } from './services/redis.service';
import { RateLimitMonitoringService } from './services/rate-limit-monitoring.service';
import { RateLimitMetricsService } from './services/rate-limit-metrics.service';
import { RateLimitGuard } from './guards/rate-limit.guard';
// import { RateLimitController } from './controllers/rate-limit.controller'; // Temporarily disabled to avoid circular dependency
// import { RateLimitTestController } from './controllers/rate-limit-test.controller'; // Moved to separate module
import { LoggerModule } from './logger/logger.module';

@Global()
@Module({
  imports: [ConfigModule, LoggerModule],
  controllers: [], // Controllers temporarily disabled to avoid circular dependency
  providers: [
    RedisConfigService,
    RedisService,
    RateLimitMonitoringService,
    RateLimitMetricsService,
    RateLimitGuard,
  ],
  exports: [
    RedisConfigService,
    RedisService,
    RateLimitMonitoringService,
    RateLimitMetricsService,
    RateLimitGuard,
    LoggerModule,
  ],
})
export class CommonModule {}
