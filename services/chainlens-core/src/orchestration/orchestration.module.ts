import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OrchestrationService } from './orchestration.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ServiceClientService } from './service-client.service';
import { LoggerModule } from '../common/logger/logger.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [
    LoggerModule,
    MetricsModule,
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 30000,
        maxRedirects: 5,
        retries: 3,
        retryDelay: 1000,
      }),
    }),
  ],
  providers: [OrchestrationService, CircuitBreakerService, ServiceClientService],
  exports: [OrchestrationService],
})
export class OrchestrationModule {}
