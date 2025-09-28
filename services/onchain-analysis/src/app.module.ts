/**
 * T2.1.1a: OnChain Analysis Service - Main Application Module
 * Basic module structure with configuration and core modules
 */

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';

// Configuration
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import externalApiConfig from './config/external-api.config';

// Core modules
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { AnalysisModule } from './analysis/analysis.module';
import { DatabaseModule } from './database/database.module';
import { CacheModule } from './cache/cache.module';
import { LoggerModule } from './common/logger/logger.module';

// Controllers
import { AppController } from './app.controller';

// Services
import { AppService } from './app.service';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, redisConfig, externalApiConfig],
      envFilePath: ['.env.local', '.env'],
      cache: true,
      expandVariables: true,
    }),

    // Database
    TypeOrmModule.forRootAsync({
      useFactory: (configService) => configService.get('database'),
      inject: [ConfigService],
    }),

    // Scheduling
    ScheduleModule.forRoot(),

    // HTTP client
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 3,
    }),

    // Core modules
    LoggerModule,
    DatabaseModule,
    CacheModule,
    HealthModule,
    MetricsModule,
    AnalysisModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  constructor() {
    console.log('🔧 OnChain Analysis Service - Application Module Initialized');
  }
}
