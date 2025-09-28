/**
 * T2.1.1a: Cache Module
 * Redis caching functionality
 */

import { Module } from '@nestjs/common';
import { CacheService } from './cache.service';

@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
