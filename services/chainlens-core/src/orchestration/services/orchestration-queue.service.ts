/**
 * T1.3.5a: Orchestration Queue Service
 * Handles request queuing with priority and monitoring for high load scenarios
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

import { LoggerService } from '../../common/services/logger.service';
import { MetricsService } from '../../metrics/metrics.service';
import { User } from '../../auth/auth.service';
import { AnalysisRequestDto } from '../../analysis/dto/analysis-request.dto';

import {
  OrchestrationJobData,
  OrchestrationJobResult,
  JobPriority,
  JobStatus,
  QueueConfig,
  QueueMetrics,
  QueueHealth,
  DeadLetterEntry,
  QueueMonitoringConfig,
  JobProgress,
  QueueStatistics,
  PriorityCalculationOptions,
} from '../interfaces/queue.interfaces';

@Injectable()
export class OrchestrationQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly queueConfig: QueueConfig;
  private readonly monitoringConfig: QueueMonitoringConfig;
  private readonly deadLetterQueue = new Map<string, DeadLetterEntry>();
  private readonly jobProgress = new Map<string, JobProgress>();
  private metricsInterval: NodeJS.Timeout;
  private healthCheckInterval: NodeJS.Timeout;

  // Queue metrics tracking
  private metrics: QueueMetrics = {
    totalJobs: 0,
    activeJobs: 0,
    waitingJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    delayedJobs: 0,
    pausedJobs: 0,
    stuckJobs: 0,
    averageProcessingTime: 0,
    averageWaitTime: 0,
    throughputPerMinute: 0,
    successRate: 0,
    memoryUsage: 0,
    cpuUsage: 0,
    lastUpdated: new Date(),
    uptime: 0,
  };

  constructor(
    @InjectQueue('orchestration') private orchestrationQueue: Queue,
    private configService: ConfigService,
    private logger: LoggerService,
    private metricsService: MetricsService,
  ) {
    this.queueConfig = this.loadQueueConfig();
    this.monitoringConfig = this.loadMonitoringConfig();
  }

  async onModuleInit() {
    this.logger.log('Initializing OrchestrationQueueService', 'OrchestrationQueueService');
    
    // Setup queue event listeners
    this.setupQueueEventListeners();
    
    // Start monitoring
    this.startMonitoring();
    
    this.logger.log('OrchestrationQueueService initialized successfully', 'OrchestrationQueueService');
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down OrchestrationQueueService', 'OrchestrationQueueService');
    
    // Clear intervals
    if (this.metricsInterval) clearInterval(this.metricsInterval);
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    
    // Close queue
    await this.orchestrationQueue.close();
    
    this.logger.log('OrchestrationQueueService shutdown complete', 'OrchestrationQueueService');
  }

  /**
   * T1.3.5a: Add job to queue with priority handling
   */
  async addJob(
    request: AnalysisRequestDto,
    user: User,
    correlationId: string,
    options?: Partial<OrchestrationJobData>,
  ): Promise<string> {
    const jobId = uuidv4();
    const priority = this.calculatePriority({
      userTier: user.tier,
      analysisType: request.analysisType,
      isRetry: options?.retryCount > 0,
      queueLength: (await this.orchestrationQueue.getWaiting()).length,
      userRequestCount: await this.getUserRequestCount(user.id),
    });

    const jobData: OrchestrationJobData = {
      jobId,
      request,
      user,
      correlationId,
      priority,
      createdAt: new Date(),
      estimatedDuration: this.estimateJobDuration(request),
      retryCount: 0,
      ...options,
    };

    // Add job to queue with priority
    const job = await this.orchestrationQueue.add('process-orchestration', jobData, {
      priority,
      attempts: this.queueConfig.maxRetries,
      backoff: {
        type: 'exponential',
        delay: this.queueConfig.retryDelay,
      },
      removeOnComplete: this.queueConfig.removeOnComplete,
      removeOnFail: this.queueConfig.removeOnFail,
      timeout: this.queueConfig.jobTimeout,
      jobId,
    });

    // Initialize job progress tracking
    this.jobProgress.set(jobId, {
      jobId,
      progress: 0,
      stage: 'queued',
      message: 'Job added to queue',
      updatedAt: new Date(),
    });

    this.logger.log('Job added to orchestration queue', {
      jobId,
      priority,
      userTier: user.tier,
      analysisType: request.analysisType,
      queuePosition: (await this.orchestrationQueue.getWaiting()).length,
      correlationId,
    });

    // Update metrics
    this.metrics.totalJobs++;
    this.metrics.waitingJobs++;

    // Record metrics
    this.metricsService.recordQueueOperation('job_added', 'orchestration');

    return jobId;
  }

  /**
   * Get job status and progress
   */
  async getJobStatus(jobId: string): Promise<{ status: JobStatus; progress?: JobProgress; job?: Job }> {
    const job = await this.orchestrationQueue.getJob(jobId);
    
    if (!job) {
      return { status: JobStatus.FAILED };
    }

    const progress = this.jobProgress.get(jobId);
    let status: JobStatus;

    if (job.finishedOn) {
      status = job.failedReason ? JobStatus.FAILED : JobStatus.COMPLETED;
    } else if (job.processedOn) {
      status = JobStatus.ACTIVE;
    } else if (job.opts?.delay && job.opts.delay > Date.now()) {
      status = JobStatus.DELAYED;
    } else {
      status = JobStatus.WAITING;
    }

    return { status, progress, job };
  }

  /**
   * T1.3.5a: Calculate job priority based on user tier and other factors
   */
  private calculatePriority(options: PriorityCalculationOptions): JobPriority {
    let basePriority: JobPriority;

    // Base priority from user tier
    switch (options.userTier) {
      case 'enterprise':
        basePriority = JobPriority.HIGH;
        break;
      case 'pro':
        basePriority = JobPriority.NORMAL;
        break;
      case 'free':
      default:
        basePriority = JobPriority.LOW;
        break;
    }

    // Adjust for retry jobs (higher priority)
    if (options.isRetry) {
      basePriority = Math.min(basePriority + 2, JobPriority.CRITICAL);
    }

    // Adjust for queue length (higher priority when queue is long)
    if (options.queueLength > 100) {
      basePriority = Math.max(basePriority - 1, JobPriority.LOW);
    }

    // Adjust for user request frequency (lower priority for heavy users)
    if (options.userRequestCount > 10) {
      basePriority = Math.max(basePriority - 1, JobPriority.LOW);
    }

    return basePriority;
  }

  /**
   * Estimate job duration based on analysis type
   */
  private estimateJobDuration(request: AnalysisRequestDto): number {
    const baseTime = 30000; // 30 seconds base
    
    switch (request.analysisType) {
      case 'full':
        return baseTime * 4; // 2 minutes
      case 'onchain':
        return baseTime * 2; // 1 minute
      case 'sentiment':
        return baseTime * 1.5; // 45 seconds
      case 'tokenomics':
        return baseTime * 3; // 1.5 minutes
      case 'team':
        return baseTime * 2.5; // 1.25 minutes
      default:
        return baseTime;
    }
  }

  /**
   * Get user request count in the last hour
   */
  private async getUserRequestCount(userId: string): Promise<number> {
    // This would typically query a database or cache
    // For now, return a mock value
    return 0;
  }

  /**
   * Load queue configuration from environment
   */
  private loadQueueConfig(): QueueConfig {
    return {
      name: 'orchestration',
      concurrency: this.configService.get<number>('queue.orchestration.concurrency', 5),
      maxRetries: this.configService.get<number>('queue.orchestration.maxRetries', 3),
      retryDelay: this.configService.get<number>('queue.orchestration.retryDelay', 5000),
      jobTimeout: this.configService.get<number>('queue.orchestration.timeout', 300000), // 5 minutes
      removeOnComplete: this.configService.get<number>('queue.orchestration.removeOnComplete', 100),
      removeOnFail: this.configService.get<number>('queue.orchestration.removeOnFail', 50),
      defaultPriority: JobPriority.NORMAL,
      rateLimiting: {
        max: this.configService.get<number>('queue.orchestration.rateLimit.max', 100),
        duration: this.configService.get<number>('queue.orchestration.rateLimit.duration', 60000),
      },
    };
  }

  /**
   * Load monitoring configuration
   */
  private loadMonitoringConfig(): QueueMonitoringConfig {
    return {
      metricsInterval: this.configService.get<number>('queue.monitoring.metricsInterval', 30000), // 30 seconds
      healthCheckInterval: this.configService.get<number>('queue.monitoring.healthCheckInterval', 60000), // 1 minute
      alertThresholds: {
        maxQueueLength: this.configService.get<number>('queue.monitoring.maxQueueLength', 1000),
        maxProcessingTime: this.configService.get<number>('queue.monitoring.maxProcessingTime', 300000), // 5 minutes
        minSuccessRate: this.configService.get<number>('queue.monitoring.minSuccessRate', 0.95),
        maxErrorRate: this.configService.get<number>('queue.monitoring.maxErrorRate', 0.05),
      },
      deadLetterConfig: {
        enabled: this.configService.get<boolean>('queue.deadLetter.enabled', true),
        maxRetries: this.configService.get<number>('queue.deadLetter.maxRetries', 5),
        retryDelay: this.configService.get<number>('queue.deadLetter.retryDelay', 300000), // 5 minutes
        cleanupInterval: this.configService.get<number>('queue.deadLetter.cleanupInterval', 3600000), // 1 hour
      },
    };
  }

  /**
   * Setup queue event listeners for monitoring
   */
  private setupQueueEventListeners(): void {
    this.orchestrationQueue.on('active', (job: Job) => {
      this.metrics.activeJobs++;
      this.metrics.waitingJobs = Math.max(0, this.metrics.waitingJobs - 1);
      
      this.updateJobProgress(job.data.jobId, {
        progress: 10,
        stage: 'processing',
        message: 'Job started processing',
      });

      this.logger.debug('Job started processing', {
        jobId: job.data.jobId,
        priority: job.opts.priority,
        correlationId: job.data.correlationId,
      });
    });

    this.orchestrationQueue.on('completed', (job: Job, result: OrchestrationJobResult) => {
      this.metrics.activeJobs = Math.max(0, this.metrics.activeJobs - 1);
      this.metrics.completedJobs++;
      
      this.updateJobProgress(job.data.jobId, {
        progress: 100,
        stage: 'completed',
        message: 'Job completed successfully',
      });

      this.logger.log('Job completed successfully', {
        jobId: job.data.jobId,
        processingTime: result.processingTime,
        correlationId: job.data.correlationId,
      });

      // Clean up progress tracking
      setTimeout(() => {
        this.jobProgress.delete(job.data.jobId);
      }, 300000); // Keep for 5 minutes
    });

    this.orchestrationQueue.on('failed', (job: Job, error: Error) => {
      this.metrics.activeJobs = Math.max(0, this.metrics.activeJobs - 1);
      this.metrics.failedJobs++;

      this.updateJobProgress(job.data.jobId, {
        progress: 0,
        stage: 'failed',
        message: `Job failed: ${error.message}`,
      });

      this.logger.error('Job failed', error.stack, 'OrchestrationQueueService', {
        jobId: job.data.jobId,
        attemptsMade: job.attemptsMade,
        correlationId: job.data.correlationId,
      });

      // Handle dead letter queue
      if (job.attemptsMade >= this.queueConfig.maxRetries) {
        this.addToDeadLetterQueue(job, error.message);
      }
    });

    this.orchestrationQueue.on('stalled', (job: Job) => {
      this.metrics.stuckJobs++;
      
      this.logger.warn('Job stalled', {
        jobId: job.data.jobId,
        correlationId: job.data.correlationId,
      });
    });
  }

  /**
   * Update job progress
   */
  private updateJobProgress(jobId: string, update: Partial<JobProgress>): void {
    const current = this.jobProgress.get(jobId);
    if (current) {
      this.jobProgress.set(jobId, {
        ...current,
        ...update,
        updatedAt: new Date(),
      });
    }
  }

  /**
   * T1.3.5b: Add job to dead letter queue
   */
  private addToDeadLetterQueue(job: Job, failureReason: string): void {
    if (!this.monitoringConfig.deadLetterConfig.enabled) {
      return;
    }

    const entry: DeadLetterEntry = {
      originalJobId: job.data.jobId,
      jobData: job.data,
      failureReason,
      failureCount: job.attemptsMade,
      lastFailureAt: new Date(),
      originalQueueName: 'orchestration',
      canRetry: job.attemptsMade < this.monitoringConfig.deadLetterConfig.maxRetries,
    };

    this.deadLetterQueue.set(job.data.jobId, entry);

    this.logger.warn('Job added to dead letter queue', {
      jobId: job.data.jobId,
      failureReason,
      failureCount: job.attemptsMade,
      canRetry: entry.canRetry,
    });

    // Record dead letter metrics
    this.metricsService.recordQueueOperation('dead_letter_added', 'orchestration');
  }

  /**
   * Start monitoring intervals
   */
  private startMonitoring(): void {
    // Metrics collection interval
    this.metricsInterval = setInterval(async () => {
      await this.updateMetrics();
    }, this.monitoringConfig.metricsInterval);

    // Health check interval
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.monitoringConfig.healthCheckInterval);
  }

  /**
   * T1.3.5b: Update queue metrics
   */
  private async updateMetrics(): Promise<void> {
    try {
      const waiting = await this.orchestrationQueue.getWaiting();
      const active = await this.orchestrationQueue.getActive();
      const completed = await this.orchestrationQueue.getCompleted();
      const failed = await this.orchestrationQueue.getFailed();
      const delayed = await this.orchestrationQueue.getDelayed();
      const paused = await this.orchestrationQueue.isPaused();

      this.metrics = {
        ...this.metrics,
        waitingJobs: waiting.length,
        activeJobs: active.length,
        completedJobs: completed.length,
        failedJobs: failed.length,
        delayedJobs: delayed.length,
        pausedJobs: paused ? 1 : 0,
        lastUpdated: new Date(),
      };

      // Calculate success rate
      const total = this.metrics.completedJobs + this.metrics.failedJobs;
      this.metrics.successRate = total > 0 ? this.metrics.completedJobs / total : 1;

      // Record metrics to MetricsService
      this.metricsService.recordQueueMetrics('orchestration', {
        waiting: this.metrics.waitingJobs,
        active: this.metrics.activeJobs,
        completed: this.metrics.completedJobs,
        failed: this.metrics.failedJobs,
        successRate: this.metrics.successRate,
      });

    } catch (error) {
      this.logger.error('Failed to update queue metrics', error.stack, 'OrchestrationQueueService');
    }
  }

  /**
   * T1.3.5b: Perform health check
   */
  private async performHealthCheck(): Promise<QueueHealth> {
    try {
      const health: QueueHealth = {
        status: 'healthy',
        details: {
          isProcessing: this.metrics.activeJobs > 0,
          hasStuckJobs: this.metrics.stuckJobs > 0,
          errorRate: 1 - this.metrics.successRate,
          avgResponseTime: this.metrics.averageProcessingTime,
          queueLength: this.metrics.waitingJobs,
          workerCount: this.queueConfig.concurrency,
        },
        recommendations: [],
        lastCheck: new Date(),
      };

      // Check health conditions
      if (health.details.queueLength > this.monitoringConfig.alertThresholds.maxQueueLength) {
        health.status = 'degraded';
        health.recommendations.push('Queue length is high, consider scaling workers');
      }

      if (health.details.errorRate > this.monitoringConfig.alertThresholds.maxErrorRate) {
        health.status = 'degraded';
        health.recommendations.push('Error rate is high, investigate failed jobs');
      }

      if (health.details.avgResponseTime > this.monitoringConfig.alertThresholds.maxProcessingTime) {
        health.status = 'degraded';
        health.recommendations.push('Processing time is high, optimize job processing');
      }

      if (health.details.hasStuckJobs) {
        health.status = 'unhealthy';
        health.recommendations.push('Stuck jobs detected, restart workers');
      }

      return health;

    } catch (error) {
      this.logger.error('Health check failed', error.stack, 'OrchestrationQueueService');
      return {
        status: 'unhealthy',
        details: {
          isProcessing: false,
          hasStuckJobs: true,
          errorRate: 1,
          avgResponseTime: 0,
          queueLength: 0,
          workerCount: 0,
        },
        recommendations: ['Health check failed, investigate queue service'],
        lastCheck: new Date(),
      };
    }
  }

  /**
   * Get current queue metrics
   */
  getMetrics(): QueueMetrics {
    return { ...this.metrics };
  }

  /**
   * Get queue health status
   */
  async getHealth(): Promise<QueueHealth> {
    return this.performHealthCheck();
  }

  /**
   * Get dead letter queue entries
   */
  getDeadLetterQueue(): DeadLetterEntry[] {
    return Array.from(this.deadLetterQueue.values());
  }

  /**
   * Retry job from dead letter queue
   */
  async retryDeadLetterJob(jobId: string): Promise<boolean> {
    const entry = this.deadLetterQueue.get(jobId);
    if (!entry || !entry.canRetry) {
      return false;
    }

    try {
      // Re-add job to queue
      await this.addJob(
        entry.jobData.request,
        entry.jobData.user,
        entry.jobData.correlationId,
        {
          retryCount: entry.failureCount,
        },
      );

      // Remove from dead letter queue
      this.deadLetterQueue.delete(jobId);

      this.logger.log('Job retried from dead letter queue', {
        originalJobId: jobId,
        retryCount: entry.failureCount,
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to retry dead letter job', error.stack, 'OrchestrationQueueService', {
        jobId,
      });
      return false;
    }
  }

  /**
   * Get queue statistics for reporting
   */
  async getStatistics(): Promise<QueueStatistics> {
    // This would typically aggregate data from a time-series database
    // For now, return current metrics as statistics
    return {
      summary: {
        totalProcessed: this.metrics.completedJobs + this.metrics.failedJobs,
        successfulJobs: this.metrics.completedJobs,
        failedJobs: this.metrics.failedJobs,
        averageProcessingTime: this.metrics.averageProcessingTime,
        peakQueueLength: this.metrics.waitingJobs, // Would track peak over time
        currentQueueLength: this.metrics.waitingJobs,
      },
      performance: {
        throughput: {
          lastHour: this.metrics.throughputPerMinute * 60,
          lastDay: this.metrics.throughputPerMinute * 60 * 24,
          lastWeek: this.metrics.throughputPerMinute * 60 * 24 * 7,
        },
        responseTime: {
          p50: this.metrics.averageProcessingTime * 0.8,
          p95: this.metrics.averageProcessingTime * 1.5,
          p99: this.metrics.averageProcessingTime * 2,
        },
        errorRates: {
          lastHour: 1 - this.metrics.successRate,
          lastDay: 1 - this.metrics.successRate,
          lastWeek: 1 - this.metrics.successRate,
        },
      },
      resources: {
        memoryUsage: this.metrics.memoryUsage,
        cpuUsage: this.metrics.cpuUsage,
        activeWorkers: this.metrics.activeJobs,
        maxWorkers: this.queueConfig.concurrency,
      },
      trends: {
        jobVolumeGrowth: 0, // Would calculate from historical data
        performanceChange: 0, // Would calculate from historical data
        errorRateChange: 0, // Would calculate from historical data
      },
    };
  }

  /**
   * Pause queue processing
   */
  async pauseQueue(): Promise<void> {
    await this.orchestrationQueue.pause();
    this.logger.log('Queue paused', 'OrchestrationQueueService');
  }

  /**
   * Resume queue processing
   */
  async resumeQueue(): Promise<void> {
    await this.orchestrationQueue.resume();
    this.logger.log('Queue resumed', 'OrchestrationQueueService');
  }

  /**
   * Clean completed and failed jobs
   */
  async cleanQueue(): Promise<void> {
    await this.orchestrationQueue.clean(24 * 60 * 60 * 1000, 'completed'); // 24 hours
    await this.orchestrationQueue.clean(24 * 60 * 60 * 1000, 'failed'); // 24 hours
    this.logger.log('Queue cleaned', 'OrchestrationQueueService');
  }
}
