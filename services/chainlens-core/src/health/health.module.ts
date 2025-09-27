import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { LoggerModule } from '../common/logger/logger.module';

@Module({
  imports: [
    TerminusModule,
    HttpModule,
    LoggerModule,
  ],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
