/**
 * T1.3.5a: Orchestration Queue Processor
 * Processes orchestration jobs from the queue
 */

import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable } from '@nestjs/common';

import { LoggerService } from '../../common/services/logger.service';
import { MetricsService } from '../../metrics/metrics.service';
import { OrchestrationService } from '../orchestration.service';

import {
  OrchestrationJobData,
  OrchestrationJobResult,
} from '../interfaces/queue.interfaces';

@Injectable()
@Processor('orchestration')
export class OrchestrationQueueProcessor {
  constructor(
    private orchestrationService: OrchestrationService,
    private logger: LoggerService,
    private metricsService: MetricsService,
  ) {}

  /**
   * T1.3.5a: Process orchestration job from queue
   */
  @Process('process-orchestration')
  async processOrchestration(job: Job<OrchestrationJobData>): Promise<OrchestrationJobResult> {
    const { jobId, request, user, correlationId, priority, createdAt } = job.data;
    const startTime = Date.now();
    const waitTime = startTime - createdAt.getTime();

    this.logger.log('Processing queued orchestration request', {
      jobId,
      projectId: request.projectId,
      analysisType: request.analysisType,
      userId: user.id,
      userTier: user.tier,
      priority,
      waitTime,
      correlationId,
    });

    try {
      // Update job progress - initialization
      await job.progress(10);

      // Process the orchestration request
      const result = await this.orchestrationService.orchestrateAnalysis(
        request,
        user,
        correlationId,
      );

      // Update job progress - processing
      await job.progress(50);

      // Validate result
      if (!result || !result.services) {
        throw new Error('Invalid orchestration result');
      }

      // Update job progress - finalizing
      await job.progress(90);

      const processingTime = Date.now() - startTime;
      const totalTime = Date.now() - createdAt.getTime();

      // Create job result
      const jobResult: OrchestrationJobResult = {
        jobId,
        result,
        processingTime,
        completedAt: new Date(),
        success: true,
        retryCount: job.attemptsMade,
      };

      // Update job progress - completed
      await job.progress(100);

      this.logger.log('Queued orchestration completed successfully', {
        jobId,
        projectId: request.projectId,
        analysisType: request.analysisType,
        userId: user.id,
        userTier: user.tier,
        priority,
        waitTime,
        processingTime,
        totalTime,
        successRate: result.successRate,
        servicesCount: Object.keys(result.services).length,
        correlationId,
      });

      // Record success metrics
      this.metricsService.recordQueueOperation('job_completed', 'orchestration');
      this.metricsService.recordAnalysis(
        request.projectId,
        request.analysisType,
        processingTime,
        true,
        user.id,
        user.tier,
      );

      return jobResult;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const totalTime = Date.now() - createdAt.getTime();

      this.logger.error('Queued orchestration failed', error.stack, 'OrchestrationQueueProcessor', {
        jobId,
        projectId: request.projectId,
        analysisType: request.analysisType,
        userId: user.id,
        userTier: user.tier,
        priority,
        waitTime,
        processingTime,
        totalTime,
        attemptsMade: job.attemptsMade,
        correlationId,
      });

      // Create error result
      const jobResult: OrchestrationJobResult = {
        jobId,
        result: null,
        processingTime,
        completedAt: new Date(),
        success: false,
        error: error.message,
        retryCount: job.attemptsMade,
      };

      // Record failure metrics
      this.metricsService.recordQueueOperation('job_failed', 'orchestration');
      this.metricsService.recordAnalysis(
        request.projectId,
        request.analysisType,
        processingTime,
        false,
        user.id,
        user.tier,
      );

      // Re-throw error for Bull to handle retries
      throw error;
    }
  }

  /**
   * Handle job completion
   */
  @Process('job-completed')
  async handleJobCompleted(job: Job<OrchestrationJobResult>): Promise<void> {
    const { jobId, success, processingTime } = job.data;

    this.logger.debug('Job completion handler triggered', {
      jobId,
      success,
      processingTime,
    });

    // Additional cleanup or notification logic can be added here
    // For example: send notifications, update databases, trigger webhooks, etc.
  }

  /**
   * Handle job failure
   */
  @Process('job-failed')
  async handleJobFailed(job: Job<{ jobId: string; error: string; retryCount: number }>): Promise<void> {
    const { jobId, error, retryCount } = job.data;

    this.logger.warn('Job failure handler triggered', {
      jobId,
      error,
      retryCount,
    });

    // Additional failure handling logic can be added here
    // For example: send alerts, update monitoring systems, etc.
  }
}
