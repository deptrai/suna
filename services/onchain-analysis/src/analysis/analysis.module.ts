/**
 * T2.1.1a: Analysis Module
 * Core analysis functionality (placeholder for T2.1.2+)
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { TokenAnalysisService } from './services/token-analysis.service';
import { TransactionAnalysisService } from './services/transaction-analysis.service';
import { RiskAssessmentService } from './services/risk-assessment.service';
import { DexScreenerService } from '../external-apis/dexscreener.service';
import { DatabaseModule } from '../database/database.module';
import { CacheModule } from '../cache/cache.module';
import { MetricsModule } from '../metrics/metrics.module';
import { ExternalApisModule } from '../external-apis/external-apis.module';

@Module({
  imports: [HttpModule, DatabaseModule, CacheModule, MetricsModule, ExternalApisModule],
  controllers: [AnalysisController],
  providers: [AnalysisService, TokenAnalysisService, TransactionAnalysisService, RiskAssessmentService, DexScreenerService],
  exports: [AnalysisService, TokenAnalysisService, TransactionAnalysisService, RiskAssessmentService, DexScreenerService],
})
export class AnalysisModule {}
