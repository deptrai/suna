import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  recordMetric(name: string, value: number): void {
    // Metrics implementation
  }

  incrementCacheHits(service: string): void {
    // Cache hits metric
  }

  recordAnalysisTime(service: string, time: number): void {
    // Analysis time metric
  }

  incrementAnalysisCount(service: string, status: string): void {
    // Analysis count metric
  }
}

