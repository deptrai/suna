/**
 * T1.3.5: Queue Management Interfaces
 * Interfaces for orchestration queue management and monitoring
 */

import { User } from '../../auth/auth.service';
import { AnalysisRequestDto } from '../../analysis/dto/analysis-request.dto';
import { OrchestrationResult } from '../orchestration.service';

/**
 * Priority levels for queue jobs based on user tier
 */
export enum JobPriority {
  LOW = 1,      // Free tier users
  NORMAL = 5,   // Pro tier users  
  HIGH = 10,    // Enterprise tier users
  CRITICAL = 15 // System/admin jobs
}

/**
 * Job status for tracking
 */
export enum JobStatus {
  WAITING = 'waiting',
  ACTIVE = 'active', 
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELAYED = 'delayed',
  PAUSED = 'paused',
  STUCK = 'stuck'
}

/**
 * Orchestration job data structure
 */
export interface OrchestrationJobData {
  jobId: string;
  request: AnalysisRequestDto;
  user: User;
  correlationId: string;
  priority: JobPriority;
  createdAt: Date;
  estimatedDuration?: number;
  retryCount?: number;
  metadata?: Record<string, any>;
}

/**
 * Job result structure
 */
export interface OrchestrationJobResult {
  jobId: string;
  result: OrchestrationResult;
  processingTime: number;
  completedAt: Date;
  success: boolean;
  error?: string;
  retryCount: number;
}

/**
 * Queue configuration options
 */
export interface QueueConfig {
  name: string;
  concurrency: number;
  maxRetries: number;
  retryDelay: number;
  jobTimeout: number;
  removeOnComplete: number;
  removeOnFail: number;
  defaultPriority: JobPriority;
  rateLimiting?: {
    max: number;
    duration: number;
  };
}

/**
 * Queue metrics for monitoring
 */
export interface QueueMetrics {
  totalJobs: number;
  activeJobs: number;
  waitingJobs: number;
  completedJobs: number;
  failedJobs: number;
  delayedJobs: number;
  pausedJobs: number;
  stuckJobs: number;
  
  // Performance metrics
  averageProcessingTime: number;
  averageWaitTime: number;
  throughputPerMinute: number;
  successRate: number;
  
  // Resource metrics
  memoryUsage: number;
  cpuUsage: number;
  
  // Time-based metrics
  lastUpdated: Date;
  uptime: number;
}

/**
 * Queue health status
 */
export interface QueueHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  details: {
    isProcessing: boolean;
    hasStuckJobs: boolean;
    errorRate: number;
    avgResponseTime: number;
    queueLength: number;
    workerCount: number;
  };
  recommendations?: string[];
  lastCheck: Date;
}

/**
 * Dead letter queue entry
 */
export interface DeadLetterEntry {
  originalJobId: string;
  jobData: OrchestrationJobData;
  failureReason: string;
  failureCount: number;
  lastFailureAt: Date;
  originalQueueName: string;
  canRetry: boolean;
  metadata?: Record<string, any>;
}

/**
 * Queue monitoring configuration
 */
export interface QueueMonitoringConfig {
  metricsInterval: number; // milliseconds
  healthCheckInterval: number; // milliseconds
  alertThresholds: {
    maxQueueLength: number;
    maxProcessingTime: number;
    minSuccessRate: number;
    maxErrorRate: number;
  };
  deadLetterConfig: {
    enabled: boolean;
    maxRetries: number;
    retryDelay: number;
    cleanupInterval: number;
  };
}

/**
 * Job progress tracking
 */
export interface JobProgress {
  jobId: string;
  progress: number; // 0-100
  stage: string;
  message?: string;
  estimatedTimeRemaining?: number;
  updatedAt: Date;
}

/**
 * Queue statistics for reporting
 */
export interface QueueStatistics {
  summary: {
    totalProcessed: number;
    successfulJobs: number;
    failedJobs: number;
    averageProcessingTime: number;
    peakQueueLength: number;
    currentQueueLength: number;
  };
  
  performance: {
    throughput: {
      lastHour: number;
      lastDay: number;
      lastWeek: number;
    };
    responseTime: {
      p50: number;
      p95: number;
      p99: number;
    };
    errorRates: {
      lastHour: number;
      lastDay: number;
      lastWeek: number;
    };
  };
  
  resources: {
    memoryUsage: number;
    cpuUsage: number;
    activeWorkers: number;
    maxWorkers: number;
  };
  
  trends: {
    jobVolumeGrowth: number;
    performanceChange: number;
    errorRateChange: number;
  };
}

/**
 * Priority calculation options
 */
export interface PriorityCalculationOptions {
  userTier: 'free' | 'pro' | 'enterprise';
  analysisType: string;
  isRetry: boolean;
  queueLength: number;
  userRequestCount: number;
  timeOfDay?: Date;
}
