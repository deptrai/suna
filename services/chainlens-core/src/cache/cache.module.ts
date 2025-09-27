import { Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-redis-store';
import { CacheService } from './cache.service';

@Module({
  imports: [
    NestCacheModule.registerAsync({
      useFactory: async (configService: ConfigService) => {
        const redisConfig = configService.get('redis');
        
        return {
          store: redisStore,
          host: redisConfig.host,
          port: redisConfig.port,
          password: redisConfig.password,
          db: redisConfig.db,
          ttl: configService.get('services.cache.defaultTtl', 300),
          max: 1000, // Maximum number of items in cache
          keyPrefix: configService.get('services.cache.keyPrefix', 'chainlens:'),
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [CacheService],
  exports: [CacheService, NestCacheModule],
})
export class CacheModule {}
