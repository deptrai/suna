import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisConfigService } from './config/redis.config';
import { RedisService } from './services/redis.service';
import { RateLimitMonitoringService } from './services/rate-limit-monitoring.service';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RateLimitController } from './controllers/rate-limit.controller';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [RateLimitController],
  providers: [
    RedisConfigService,
    RedisService,
    RateLimitMonitoringService,
    RateLimitGuard,
  ],
  exports: [
    RedisConfigService,
    RedisService,
    RateLimitMonitoringService,
    RateLimitGuard,
  ],
})
export class CommonModule {}
