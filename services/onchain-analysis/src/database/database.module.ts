/**
 * T2.1.1c: Database Module
 * Database configuration and entity registration
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

// Entities
import { AnalysisCacheEntity } from './entities/analysis-cache.entity';
import { RateLimitEntity } from './entities/rate-limit.entity';
import { ErrorLogEntity } from './entities/error-log.entity';

// Repositories
import { AnalysisCacheRepository } from './repositories/analysis-cache.repository';
import { RateLimitRepository } from './repositories/rate-limit.repository';
import { ErrorLogRepository } from './repositories/error-log.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AnalysisCacheEntity,
      RateLimitEntity,
      ErrorLogEntity,
    ]),
  ],
  providers: [
    AnalysisCacheRepository,
    RateLimitRepository,
    ErrorLogRepository,
  ],
  exports: [
    TypeOrmModule,
    AnalysisCacheRepository,
    RateLimitRepository,
    ErrorLogRepository,
  ],
})
export class DatabaseModule {
  constructor(private readonly configService: ConfigService) {
    console.log('🗄️  OnChain Analysis - Database Module Initialized');
  }
}
