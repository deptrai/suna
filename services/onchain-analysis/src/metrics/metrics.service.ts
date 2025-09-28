/**
 * T2.1.1a: Metrics Service
 * Prometheus metrics collection and reporting
 */

import { Injectable } from '@nestjs/common';
import { register, Counter, Histogram, Gauge } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly requestCounter: Counter<string>;
  private readonly responseTimeHistogram: Histogram<string>;
  private readonly errorCounter: Counter<string>;
  private readonly activeRequestsGauge: Gauge<string>;
  private readonly externalApiCounter: Counter<string>;
  private readonly externalApiDuration: Histogram<string>;
  private readonly cacheCounter: Counter<string>;

  constructor() {
    // Request metrics
    this.requestCounter = new Counter({
      name: 'onchain_requests_total',
      help: 'Total number of requests',
      labelNames: ['method', 'endpoint', 'status_code'],
    });

    this.responseTimeHistogram = new Histogram({
      name: 'onchain_request_duration_seconds',
      help: 'Request duration in seconds',
      labelNames: ['method', 'endpoint'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
    });

    this.errorCounter = new Counter({
      name: 'onchain_errors_total',
      help: 'Total number of errors',
      labelNames: ['type', 'endpoint'],
    });

    this.activeRequestsGauge = new Gauge({
      name: 'onchain_active_requests',
      help: 'Number of active requests',
    });

    // External API metrics
    this.externalApiCounter = new Counter({
      name: 'onchain_external_api_requests_total',
      help: 'Total number of external API requests',
      labelNames: ['service', 'endpoint', 'status'],
    });

    this.externalApiDuration = new Histogram({
      name: 'onchain_external_api_duration_seconds',
      help: 'External API request duration in seconds',
      labelNames: ['service', 'endpoint'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
    });

    this.cacheCounter = new Counter({
      name: 'onchain_cache_operations_total',
      help: 'Total number of cache operations',
      labelNames: ['operation', 'type'],
    });

    register.registerMetric(this.requestCounter);
    register.registerMetric(this.responseTimeHistogram);
    register.registerMetric(this.errorCounter);
    register.registerMetric(this.activeRequestsGauge);
    register.registerMetric(this.externalApiCounter);
    register.registerMetric(this.externalApiDuration);
    register.registerMetric(this.cacheCounter);
  }

  incrementRequest(method: string, endpoint: string, statusCode: number) {
    this.requestCounter.inc({
      method,
      endpoint,
      status_code: statusCode.toString(),
    });
  }

  recordResponseTime(method: string, endpoint: string, duration: number) {
    this.responseTimeHistogram.observe(
      { method, endpoint },
      duration / 1000, // Convert to seconds
    );
  }

  incrementError(type: string, endpoint: string) {
    this.errorCounter.inc({ type, endpoint });
  }

  setActiveRequests(count: number) {
    this.activeRequestsGauge.set(count);
  }

  incrementActiveRequests() {
    this.activeRequestsGauge.inc();
  }

  decrementActiveRequests() {
    this.activeRequestsGauge.dec();
  }

  recordExternalApiCall(
    service: string,
    endpoint: string,
    status: 'success' | 'error',
    duration: number,
  ) {
    this.externalApiCounter.inc({ service, endpoint, status });
    this.externalApiDuration.observe(
      { service, endpoint },
      duration / 1000, // Convert to seconds
    );
  }

  incrementCacheHits(type: string) {
    this.cacheCounter.inc({ operation: 'hit', type });
  }

  incrementCacheMisses(type: string) {
    this.cacheCounter.inc({ operation: 'miss', type });
  }

  async getPrometheusMetrics(): Promise<string> {
    return register.metrics();
  }

  async getJsonMetrics() {
    const metrics = await register.getMetricsAsJSON();
    
    return {
      timestamp: new Date().toISOString(),
      service: 'onchain-analysis',
      metrics: metrics.reduce((acc, metric) => {
        acc[metric.name] = {
          help: metric.help,
          type: metric.type,
          values: metric.values,
        };
        return acc;
      }, {}),
    };
  }

  reset() {
    register.clear();
  }
}
