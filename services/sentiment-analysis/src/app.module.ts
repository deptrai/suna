import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

// Core modules
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { DatabaseModule } from './database/database.module';
import { CacheModule } from './cache/cache.module';
import { LoggerModule } from './common/logger/logger.module';

// Feature modules
import { SentimentModule } from './sentiment/sentiment.module';
import { SocialMediaModule } from './social-media/social-media.module';
import { NewsModule } from './news/news.module';
import { ExternalApisModule } from './external-apis/external-apis.module';

// Configuration
import { databaseConfig } from './config/database.config';
import { redisConfig } from './config/redis.config';
import { externalApiConfig } from './config/external-api.config';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, redisConfig, externalApiConfig],
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
        defaultMeta: { service: 'sentiment-analysis' },
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
        host: configService.get<string>('database.host'),
        port: configService.get<number>('database.port'),
        username: configService.get<string>('database.username'),
        password: configService.get<string>('database.password'),
        database: configService.get<string>('database.name'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: configService.get<string>('NODE_ENV') !== 'production',
        logging: configService.get<string>('NODE_ENV') === 'development',
        ssl: configService.get<string>('NODE_ENV') === 'production' ? {
          rejectUnauthorized: false,
        } : false,
        retryAttempts: 3,
        retryDelay: 3000,
        autoLoadEntities: true,
      }),
      inject: [ConfigService],
    }),

    // Task scheduling
    ScheduleModule.forRoot(),

    // Core modules
    DatabaseModule,
    CacheModule,
    LoggerModule,
    HealthModule,
    MetricsModule,

    // Feature modules
    SentimentModule,
    SocialMediaModule,
    NewsModule,
    ExternalApisModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {
  constructor(private configService: ConfigService) {
    const environment = this.configService.get<string>('NODE_ENV', 'development');
    const port = this.configService.get<number>('PORT', 3002);
    
    console.log(`🔧 Sentiment Analysis Service Configuration:`);
    console.log(`   Environment: ${environment}`);
    console.log(`   Port: ${port}`);
    console.log(`   Database: ${this.configService.get<string>('database.host')}:${this.configService.get<number>('database.port')}`);
    console.log(`   Redis: ${this.configService.get<string>('redis.host')}:${this.configService.get<number>('redis.port')}`);
  }
}
