import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bull';
import { OrchestrationService } from './orchestration.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ServiceClientService } from './service-client.service';
import { EnhancedHttpClientService } from './services/enhanced-http-client.service';
import { ServiceClientFactoryService } from './services/service-client-factory.service';
import { ServiceDiscoveryService } from './services/service-discovery.service';
import { ParallelExecutionService } from './services/parallel-execution.service';
import { OrchestrationCacheService } from './services/orchestration-cache.service';
import { OrchestrationQueueService } from './services/orchestration-queue.service';
import { OrchestrationQueueProcessor } from './services/orchestration-queue.processor';
import { RequestInterceptorService } from './interceptors/request.interceptor';
import { MetricsInterceptorService } from './interceptors/metrics.interceptor';
import { HttpClientConfigService } from './config/http-client.config';
import { LoggerModule } from '../common/logger/logger.module';
import { MetricsModule } from '../metrics/metrics.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [
    LoggerModule,
    MetricsModule,
    CacheModule,
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 30000,
        maxRedirects: 5,
        retries: 3,
        retryDelay: 1000,
      }),
    }),
    BullModule.registerQueue({
      name: 'orchestration',
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        timeout: 300000, // 5 minutes
      },
    }),
  ],
  providers: [
    HttpClientConfigService,
    RequestInterceptorService,
    MetricsInterceptorService,
    EnhancedHttpClientService,
    ServiceClientFactoryService,
    ServiceDiscoveryService,
    ParallelExecutionService,
    OrchestrationCacheService,
    OrchestrationQueueService,
    OrchestrationQueueProcessor,
    OrchestrationService,
    CircuitBreakerService,
    ServiceClientService, // Keep for backward compatibility
  ],
  exports: [
    OrchestrationService,
    ParallelExecutionService,
    ServiceClientFactoryService,
    ServiceDiscoveryService,
    EnhancedHttpClientService,
    OrchestrationCacheService,
    OrchestrationQueueService,
    CircuitBreakerService,
  ],
})
export class OrchestrationModule {}
