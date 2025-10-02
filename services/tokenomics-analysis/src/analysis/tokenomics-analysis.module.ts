/**
 * Tokenomics Analysis Module
 * Provides tokenomics analysis functionality
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { TokenomicsAnalysisController } from './tokenomics-analysis.controller';
import { TokenomicsAnalysisService } from './tokenomics-analysis.service';
import { DeFiProtocolService } from './defi-protocol.service';
import { TokenomicsData } from '../entities/tokenomics-data.entity';
import { VestingSchedule } from '../entities/vesting-schedule.entity';
import { DeFiLlamaService } from '../external-apis/defillama.service';
import { CoinGeckoService } from '../external-apis/coingecko.service';
import { CacheService } from '../cache/cache.service';
import { MetricsService } from '../metrics/metrics.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      TokenomicsData,
      VestingSchedule,
    ]),
  ],
  controllers: [TokenomicsAnalysisController],
  providers: [
    TokenomicsAnalysisService,
    DeFiProtocolService,
    DeFiLlamaService,
    CoinGeckoService,
    CacheService,
    MetricsService,
  ],
  exports: [TokenomicsAnalysisService, DeFiProtocolService],
})
export class TokenomicsAnalysisModule {}

