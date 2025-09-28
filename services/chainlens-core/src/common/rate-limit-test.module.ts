import { Module } from '@nestjs/common';
import { RateLimitTestController } from './controllers/rate-limit-test.controller';
import { RateLimitMetricsService } from './services/rate-limit-metrics.service';
import { CommonModule } from './common.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [CommonModule, AuthModule],
  controllers: [RateLimitTestController],
  providers: [],
})
export class RateLimitTestModule {}
