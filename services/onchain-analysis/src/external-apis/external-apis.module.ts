/**
 * T2.1.2a: External APIs Module
 * Module for all external API services
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MoralisService } from './moralis.service';
import { DeFiLlamaService } from './defillama.service';
import { YieldFarmingService } from './yield-farming.service';
import { DexScreenerService } from './dexscreener.service';
import { CacheModule } from '../cache/cache.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 3,
    }),
    CacheModule,
    MetricsModule,
  ],
  providers: [MoralisService, DeFiLlamaService, YieldFarmingService, DexScreenerService],
  exports: [MoralisService, DeFiLlamaService, YieldFarmingService, DexScreenerService],
})
export class ExternalApisModule {}
