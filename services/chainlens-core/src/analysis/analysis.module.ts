import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bull';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { AnalysisProcessor } from './analysis.processor';
import { AuthModule } from '../auth/auth.module';
import { CacheModule } from '../cache/cache.module';
import { MetricsModule } from '../metrics/metrics.module';
import { OrchestrationModule } from '../orchestration/orchestration.module';

@Module({
  imports: [
    HttpModule,
    AuthModule,
    CacheModule,
    MetricsModule,
    OrchestrationModule,
    BullModule.registerQueue({
      name: 'analysis',
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    }),
  ],
  controllers: [AnalysisController],
  providers: [AnalysisService, AnalysisProcessor],
  exports: [AnalysisService],
})
export class AnalysisModule {}
