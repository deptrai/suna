import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../common/services/logger.service';

interface MetricData {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp: number;
}

interface PerformanceMetrics {
  httpRequests: {
    total: number;
    byStatus: Record<string, number>;
    byMethod: Record<string, number>;
    averageResponseTime: number;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  externalApis: {
    calls: number;
    failures: number;
    averageResponseTime: number;
    byService: Record<string, {
      calls: number;
      failures: number;
      averageResponseTime: number;
    }>;
  };
  analysis: {
    total: number;
    successful: number;
    failed: number;
    averageProcessingTime: number;
    byType: Record<string, number>;
  };
  system: {
    uptime: number;
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
    };
  };
}

@Injectable()
export class MetricsService {
  private metrics: Map<string, MetricData[]> = new Map();
  private readonly maxMetricsAge = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
  ) {
    // Clean up old metrics every hour
    setInterval(() => this.cleanupOldMetrics(), 60 * 60 * 1000);
  }

  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    responseTime: number,
    userId?: string,
  ): void {
    this.recordMetric('http_requests_total', 1, {
      method,
      route,
      status_code: statusCode.toString(),
      user_tier: userId ? 'authenticated' : 'anonymous',
    });

    this.recordMetric('http_request_duration_seconds', responseTime / 1000, {
      method,
      route,
      status_code: statusCode.toString(),
    });
  }

  recordCacheOperation(operation: 'hit' | 'miss' | 'set' | 'delete', cacheType: string): void {
    this.recordMetric('cache_operations_total', 1, {
      operation,
      cache_type: cacheType,
    });

    if (operation === 'hit' || operation === 'miss') {
      this.recordMetric('cache_hit_rate', operation === 'hit' ? 1 : 0, {
        cache_type: cacheType,
      });
    }
  }

  recordExternalApiCall(
    service: string,
    endpoint: string,
    statusCode: number,
    responseTime: number,
    success: boolean,
  ): void {
    this.recordMetric('external_api_calls_total', 1, {
      service,
      endpoint,
      status_code: statusCode.toString(),
      success: success.toString(),
    });

    this.recordMetric('external_api_duration_seconds', responseTime / 1000, {
      service,
      endpoint,
    });
  }

  recordAnalysis(
    projectId: string,
    analysisType: string,
    duration: number,
    success: boolean,
    userId?: string,
    userTier?: string,
  ): void {
    this.recordMetric('analysis_requests_total', 1, {
      analysis_type: analysisType,
      success: success.toString(),
      user_tier: userTier || 'unknown',
    });

    this.recordMetric('analysis_duration_seconds', duration / 1000, {
      analysis_type: analysisType,
      success: success.toString(),
    });

    if (success) {
      this.recordMetric('analysis_success_total', 1, {
        analysis_type: analysisType,
        user_tier: userTier || 'unknown',
      });
    } else {
      this.recordMetric('analysis_failures_total', 1, {
        analysis_type: analysisType,
        user_tier: userTier || 'unknown',
      });
    }
  }

  recordRateLimitHit(userId: string, userTier: string, resource: string): void {
    this.recordMetric('rate_limit_hits_total', 1, {
      user_tier: userTier,
      resource,
    });
  }

  recordError(errorType: string, service?: string, endpoint?: string): void {
    this.recordMetric('errors_total', 1, {
      error_type: errorType,
      service: service || 'core',
      endpoint: endpoint || 'unknown',
    });
  }

  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    // Get metrics from the last hour
    const recentMetrics = this.getMetricsInTimeRange(oneHourAgo, now);

    return {
      httpRequests: this.calculateHttpMetrics(recentMetrics),
      cache: this.calculateCacheMetrics(recentMetrics),
      externalApis: this.calculateExternalApiMetrics(recentMetrics),
      analysis: this.calculateAnalysisMetrics(recentMetrics),
      system: this.calculateSystemMetrics(),
    };
  }

  async getPrometheusMetrics(): Promise<string> {
    const metrics = await this.getPerformanceMetrics();
    
    // Convert to Prometheus format
    let prometheusOutput = '';

    // HTTP metrics
    prometheusOutput += `# HELP http_requests_total Total number of HTTP requests\n`;
    prometheusOutput += `# TYPE http_requests_total counter\n`;
    prometheusOutput += `http_requests_total ${metrics.httpRequests.total}\n\n`;

    prometheusOutput += `# HELP http_request_duration_seconds HTTP request duration in seconds\n`;
    prometheusOutput += `# TYPE http_request_duration_seconds histogram\n`;
    prometheusOutput += `http_request_duration_seconds_sum ${metrics.httpRequests.averageResponseTime}\n`;
    prometheusOutput += `http_request_duration_seconds_count ${metrics.httpRequests.total}\n\n`;

    // Cache metrics
    prometheusOutput += `# HELP cache_hit_rate Cache hit rate\n`;
    prometheusOutput += `# TYPE cache_hit_rate gauge\n`;
    prometheusOutput += `cache_hit_rate ${metrics.cache.hitRate}\n\n`;

    // External API metrics
    prometheusOutput += `# HELP external_api_calls_total Total number of external API calls\n`;
    prometheusOutput += `# TYPE external_api_calls_total counter\n`;
    prometheusOutput += `external_api_calls_total ${metrics.externalApis.calls}\n\n`;

    // Analysis metrics
    prometheusOutput += `# HELP analysis_requests_total Total number of analysis requests\n`;
    prometheusOutput += `# TYPE analysis_requests_total counter\n`;
    prometheusOutput += `analysis_requests_total ${metrics.analysis.total}\n\n`;

    // System metrics
    prometheusOutput += `# HELP system_memory_usage_bytes System memory usage in bytes\n`;
    prometheusOutput += `# TYPE system_memory_usage_bytes gauge\n`;
    prometheusOutput += `system_memory_usage_bytes ${metrics.system.memory.used}\n\n`;

    prometheusOutput += `# HELP system_uptime_seconds System uptime in seconds\n`;
    prometheusOutput += `# TYPE system_uptime_seconds counter\n`;
    prometheusOutput += `system_uptime_seconds ${metrics.system.uptime}\n\n`;

    return prometheusOutput;
  }

  private recordMetric(name: string, value: number, labels: Record<string, string> = {}): void {
    const metric: MetricData = {
      name,
      value,
      labels,
      timestamp: Date.now(),
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    this.metrics.get(name).push(metric);
  }

  private getMetricsInTimeRange(startTime: number, endTime: number): MetricData[] {
    const result: MetricData[] = [];

    for (const [name, metrics] of this.metrics.entries()) {
      const filteredMetrics = metrics.filter(
        metric => metric.timestamp >= startTime && metric.timestamp <= endTime
      );
      result.push(...filteredMetrics);
    }

    return result;
  }

  private calculateHttpMetrics(metrics: MetricData[]): PerformanceMetrics['httpRequests'] {
    const httpMetrics = metrics.filter(m => m.name === 'http_requests_total');
    const durationMetrics = metrics.filter(m => m.name === 'http_request_duration_seconds');

    const total = httpMetrics.length;
    const byStatus: Record<string, number> = {};
    const byMethod: Record<string, number> = {};

    httpMetrics.forEach(metric => {
      const status = metric.labels?.status_code || 'unknown';
      const method = metric.labels?.method || 'unknown';
      
      byStatus[status] = (byStatus[status] || 0) + 1;
      byMethod[method] = (byMethod[method] || 0) + 1;
    });

    const averageResponseTime = durationMetrics.length > 0
      ? durationMetrics.reduce((sum, m) => sum + m.value, 0) / durationMetrics.length
      : 0;

    return { total, byStatus, byMethod, averageResponseTime };
  }

  private calculateCacheMetrics(metrics: MetricData[]): PerformanceMetrics['cache'] {
    const cacheMetrics = metrics.filter(m => m.name === 'cache_operations_total');
    
    const hits = cacheMetrics.filter(m => m.labels?.operation === 'hit').length;
    const misses = cacheMetrics.filter(m => m.labels?.operation === 'miss').length;
    const total = hits + misses;
    const hitRate = total > 0 ? hits / total : 0;

    return { hits, misses, hitRate };
  }

  private calculateExternalApiMetrics(metrics: MetricData[]): PerformanceMetrics['externalApis'] {
    const apiMetrics = metrics.filter(m => m.name === 'external_api_calls_total');
    const durationMetrics = metrics.filter(m => m.name === 'external_api_duration_seconds');

    const calls = apiMetrics.length;
    const failures = apiMetrics.filter(m => m.labels?.success === 'false').length;
    const averageResponseTime = durationMetrics.length > 0
      ? durationMetrics.reduce((sum, m) => sum + m.value, 0) / durationMetrics.length
      : 0;

    const byService: Record<string, any> = {};
    apiMetrics.forEach(metric => {
      const service = metric.labels?.service || 'unknown';
      if (!byService[service]) {
        byService[service] = { calls: 0, failures: 0, averageResponseTime: 0 };
      }
      byService[service].calls++;
      if (metric.labels?.success === 'false') {
        byService[service].failures++;
      }
    });

    return { calls, failures, averageResponseTime, byService };
  }

  private calculateAnalysisMetrics(metrics: MetricData[]): PerformanceMetrics['analysis'] {
    const analysisMetrics = metrics.filter(m => m.name === 'analysis_requests_total');
    const durationMetrics = metrics.filter(m => m.name === 'analysis_duration_seconds');

    const total = analysisMetrics.length;
    const successful = analysisMetrics.filter(m => m.labels?.success === 'true').length;
    const failed = total - successful;
    const averageProcessingTime = durationMetrics.length > 0
      ? durationMetrics.reduce((sum, m) => sum + m.value, 0) / durationMetrics.length
      : 0;

    const byType: Record<string, number> = {};
    analysisMetrics.forEach(metric => {
      const type = metric.labels?.analysis_type || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
    });

    return { total, successful, failed, averageProcessingTime, byType };
  }

  private calculateSystemMetrics(): PerformanceMetrics['system'] {
    const memoryUsage = process.memoryUsage();
    
    return {
      uptime: process.uptime(),
      memory: {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        percentage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
      },
      cpu: {
        usage: process.cpuUsage().user / 1000000, // Convert to seconds
      },
    };
  }

  private cleanupOldMetrics(): void {
    const cutoffTime = Date.now() - this.maxMetricsAge;
    let totalRemoved = 0;

    for (const [name, metrics] of this.metrics.entries()) {
      const originalLength = metrics.length;
      const filteredMetrics = metrics.filter(metric => metric.timestamp > cutoffTime);
      this.metrics.set(name, filteredMetrics);
      totalRemoved += originalLength - filteredMetrics.length;
    }

    if (totalRemoved > 0) {
      this.logger.log(`Cleaned up ${totalRemoved} old metrics`, 'MetricsService');
    }
  }
}
