import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { WinstonModule } from 'nest-winston';
import { HttpModule } from '@nestjs/axios';
import * as winston from 'winston';

// Core modules
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { AnalysisModule } from './analysis/analysis.module';
import { OrchestrationModule } from './orchestration/orchestration.module';
import { CacheModule } from './cache/cache.module';
import { MetricsModule } from './metrics/metrics.module';

// Common modules
import { LoggerModule } from './common/logger/logger.module';
import { DatabaseModule } from './database/database.module';

// Configuration
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import authConfig from './config/auth.config';
import servicesConfig from './config/services.config';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, redisConfig, authConfig, servicesConfig],
      envFilePath: ['.env.local', '.env'],
      cache: true,
    }),

    // Winston Logger
    WinstonModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        level: configService.get<string>('LOG_LEVEL', 'info'),
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json(),
        ),
        defaultMeta: {
          service: 'chainlens-core',
          version: process.env.npm_package_version || '1.0.0',
          environment: configService.get<string>('NODE_ENV', 'development'),
        },
        transports: [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.simple(),
            ),
          }),
          new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
          }),
          new winston.transports.File({
            filename: 'logs/combined.log',
          }),
        ],
      }),
      inject: [ConfigService],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        synchronize: configService.get<string>('NODE_ENV') === 'development',
        logging: configService.get<string>('NODE_ENV') === 'development',
        ssl: configService.get<string>('NODE_ENV') === 'production' ? { rejectUnauthorized: false } : false,
        retryAttempts: 3,
        retryDelay: 3000,
        autoLoadEntities: true,
      }),
      inject: [ConfigService],
    }),

    // Rate Limiting
    ThrottlerModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        ttl: configService.get<number>('THROTTLE_TTL', 60),
        limit: configService.get<number>('THROTTLE_LIMIT', 100),
        storage: configService.get<string>('REDIS_URL') ? {
          type: 'redis',
          url: configService.get<string>('REDIS_URL'),
        } : undefined,
      }),
      inject: [ConfigService],
    }),

    // Bull Queue
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD'),
          db: configService.get<number>('REDIS_DB', 0),
        },
        defaultJobOptions: {
          removeOnComplete: 10,
          removeOnFail: 5,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      }),
      inject: [ConfigService],
    }),

    // HTTP Client
    HttpModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        timeout: configService.get<number>('HTTP_TIMEOUT', 30000),
        maxRedirects: 5,
        retries: 3,
        retryDelay: 1000,
      }),
      inject: [ConfigService],
    }),

    // Feature modules
    LoggerModule,
    DatabaseModule,
    HealthModule,
    AuthModule,
    CacheModule,
    MetricsModule,
    AnalysisModule,
    OrchestrationModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {
  constructor(private configService: ConfigService) {
    // Log startup configuration
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    const port = this.configService.get<number>('PORT', 3006);
    
    console.log(`🚀 ChainLens Core starting in ${nodeEnv} mode on port ${port}`);
    
    if (nodeEnv === 'development') {
      console.log('📊 Development mode - detailed logging enabled');
      console.log('🔧 Database synchronization enabled');
    }
  }
}
