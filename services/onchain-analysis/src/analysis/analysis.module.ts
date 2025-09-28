/**
 * T2.1.1a: Analysis Module
 * Core analysis functionality (placeholder for T2.1.2+)
 */

import { Module } from '@nestjs/common';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { DatabaseModule } from '../database/database.module';
import { CacheModule } from '../cache/cache.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [DatabaseModule, CacheModule, MetricsModule],
  controllers: [AnalysisController],
  providers: [AnalysisService],
  exports: [AnalysisService],
})
export class AnalysisModule {}
