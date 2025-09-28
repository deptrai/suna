/**
 * T1.3.5: OrchestrationQueueService Unit Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { OrchestrationQueueService } from './orchestration-queue.service';
import { LoggerService } from '../../common/services/logger.service';
import { MetricsService } from '../../metrics/metrics.service';
import { AnalysisRequestDto } from '../../analysis/dto/analysis-request.dto';
import { User } from '../../auth/auth.service';
import { JobPriority, JobStatus } from '../interfaces/queue.interfaces';

describe('OrchestrationQueueService', () => {
  let service: OrchestrationQueueService;
  let mockQueue: jest.Mocked<any>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockLoggerService: jest.Mocked<LoggerService>;
  let mockMetricsService: jest.Mocked<MetricsService>;

  const mockUser: User = {
    id: 'test-user-123',
    email: 'test@example.com',
    tier: 'pro',
    permissions: ['analysis:read', 'analysis:write'],
  };

  const mockRequest: AnalysisRequestDto = {
    projectId: 'bitcoin',
    analysisType: 'full',
    tokenAddress: '0x123...',
    chainId: 1,
    options: {
      timeframe: '24h',
      includeHistorical: false,
      enableDetailedAnalysis: true,
    },
  };

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn(),
      getJob: jest.fn(),
      getWaiting: jest.fn(),
      getActive: jest.fn(),
      getCompleted: jest.fn(),
      getFailed: jest.fn(),
      getDelayed: jest.fn(),
      isPaused: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      clean: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const configs = {
          'queue.orchestration.concurrency': 5,
          'queue.orchestration.maxRetries': 3,
          'queue.orchestration.retryDelay': 5000,
          'queue.orchestration.timeout': 300000,
          'queue.orchestration.removeOnComplete': 100,
          'queue.orchestration.removeOnFail': 50,
          'queue.orchestration.rateLimit.max': 100,
          'queue.orchestration.rateLimit.duration': 60000,
          'queue.monitoring.metricsInterval': 30000,
          'queue.monitoring.healthCheckInterval': 60000,
          'queue.monitoring.maxQueueLength': 1000,
          'queue.monitoring.maxProcessingTime': 300000,
          'queue.monitoring.minSuccessRate': 0.95,
          'queue.monitoring.maxErrorRate': 0.05,
          'queue.deadLetter.enabled': true,
          'queue.deadLetter.maxRetries': 5,
          'queue.deadLetter.retryDelay': 300000,
          'queue.deadLetter.cleanupInterval': 3600000,
        };
        return configs[key] || defaultValue;
      }),
    } as any;

    mockLoggerService = {
      log: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    } as any;

    mockMetricsService = {
      recordQueueOperation: jest.fn(),
      recordQueueMetrics: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrchestrationQueueService,
        { provide: getQueueToken('orchestration'), useValue: mockQueue },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: MetricsService, useValue: mockMetricsService },
      ],
    }).compile();

    service = module.get<OrchestrationQueueService>(OrchestrationQueueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('addJob', () => {
    it('should add job to queue with correct priority', async () => {
      const mockJob = { id: 'job-123', opts: { priority: JobPriority.NORMAL } };
      mockQueue.add.mockResolvedValue(mockJob);
      mockQueue.getWaiting.mockResolvedValue([]);

      const jobId = await service.addJob(mockRequest, mockUser, 'correlation-123');

      expect(jobId).toBeDefined();
      expect(mockQueue.add).toHaveBeenCalledWith(
        'process-orchestration',
        expect.objectContaining({
          jobId,
          request: mockRequest,
          user: mockUser,
          correlationId: 'correlation-123',
          priority: JobPriority.NORMAL, // Pro tier user
        }),
        expect.objectContaining({
          priority: JobPriority.NORMAL,
          attempts: 3,
          timeout: 300000,
        }),
      );
      expect(mockMetricsService.recordQueueOperation).toHaveBeenCalledWith('job_added', 'orchestration');
    });

    it('should calculate priority based on user tier', async () => {
      const enterpriseUser: User = { ...mockUser, tier: 'enterprise' };
      const freeUser: User = { ...mockUser, tier: 'free' };

      mockQueue.add.mockResolvedValue({ id: 'job-123' });
      mockQueue.getWaiting.mockResolvedValue([]);

      // Test enterprise user (high priority)
      await service.addJob(mockRequest, enterpriseUser, 'correlation-123');
      expect(mockQueue.add).toHaveBeenLastCalledWith(
        'process-orchestration',
        expect.objectContaining({ priority: JobPriority.HIGH }),
        expect.objectContaining({ priority: JobPriority.HIGH }),
      );

      // Test free user (low priority)
      await service.addJob(mockRequest, freeUser, 'correlation-123');
      expect(mockQueue.add).toHaveBeenLastCalledWith(
        'process-orchestration',
        expect.objectContaining({ priority: JobPriority.LOW }),
        expect.objectContaining({ priority: JobPriority.LOW }),
      );
    });
  });

  describe('getJobStatus', () => {
    it('should return job status and progress', async () => {
      const mockJob = {
        finishedOn: null,
        processedOn: Date.now(),
        failedReason: null,
        delay: null,
      };
      mockQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.getJobStatus('job-123');

      expect(result.status).toBe(JobStatus.ACTIVE);
      expect(mockQueue.getJob).toHaveBeenCalledWith('job-123');
    });

    it('should return failed status when job not found', async () => {
      mockQueue.getJob.mockResolvedValue(null);

      const result = await service.getJobStatus('non-existent-job');

      expect(result.status).toBe(JobStatus.FAILED);
    });

    it('should return completed status for finished job', async () => {
      const mockJob = {
        finishedOn: Date.now(),
        processedOn: Date.now() - 1000,
        failedReason: null,
      };
      mockQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.getJobStatus('job-123');

      expect(result.status).toBe(JobStatus.COMPLETED);
    });

    it('should return failed status for job with error', async () => {
      const mockJob = {
        finishedOn: Date.now(),
        processedOn: Date.now() - 1000,
        failedReason: 'Processing error',
      };
      mockQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.getJobStatus('job-123');

      expect(result.status).toBe(JobStatus.FAILED);
    });
  });

  describe('getMetrics', () => {
    it('should return current queue metrics', () => {
      const metrics = service.getMetrics();

      expect(metrics).toHaveProperty('totalJobs');
      expect(metrics).toHaveProperty('activeJobs');
      expect(metrics).toHaveProperty('waitingJobs');
      expect(metrics).toHaveProperty('completedJobs');
      expect(metrics).toHaveProperty('failedJobs');
      expect(metrics).toHaveProperty('successRate');
      expect(metrics).toHaveProperty('lastUpdated');
    });
  });

  describe('getHealth', () => {
    it('should return queue health status', async () => {
      mockQueue.set = jest.fn().mockResolvedValue(undefined);
      mockQueue.get = jest.fn().mockResolvedValue({ timestamp: Date.now() });
      mockQueue.del = jest.fn().mockResolvedValue(undefined);

      const health = await service.getHealth();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('details');
      expect(health).toHaveProperty('lastCheck');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
    });
  });

  describe('getStatistics', () => {
    it('should return queue statistics', async () => {
      const stats = await service.getStatistics();

      expect(stats).toHaveProperty('summary');
      expect(stats).toHaveProperty('performance');
      expect(stats).toHaveProperty('resources');
      expect(stats).toHaveProperty('trends');
      expect(stats.summary).toHaveProperty('totalProcessed');
      expect(stats.summary).toHaveProperty('successfulJobs');
      expect(stats.summary).toHaveProperty('currentQueueLength');
    });
  });

  describe('queue management', () => {
    it('should pause queue', async () => {
      await service.pauseQueue();
      expect(mockQueue.pause).toHaveBeenCalled();
    });

    it('should resume queue', async () => {
      await service.resumeQueue();
      expect(mockQueue.resume).toHaveBeenCalled();
    });

    it('should clean queue', async () => {
      await service.cleanQueue();
      expect(mockQueue.clean).toHaveBeenCalledTimes(2); // completed and failed
    });
  });

  describe('dead letter queue', () => {
    it('should return empty dead letter queue initially', () => {
      const deadLetterEntries = service.getDeadLetterQueue();
      expect(deadLetterEntries).toEqual([]);
    });

    it('should retry job from dead letter queue', async () => {
      // This would require setting up a dead letter entry first
      // For now, test the failure case
      const result = await service.retryDeadLetterJob('non-existent-job');
      expect(result).toBe(false);
    });
  });
});
