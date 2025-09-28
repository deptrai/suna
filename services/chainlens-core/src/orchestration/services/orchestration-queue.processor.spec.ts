/**
 * T1.3.5: OrchestrationQueueProcessor Unit Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { OrchestrationQueueProcessor } from './orchestration-queue.processor';
import { OrchestrationService } from '../orchestration.service';
import { LoggerService } from '../../common/services/logger.service';
import { MetricsService } from '../../metrics/metrics.service';
import { AnalysisRequestDto } from '../../analysis/dto/analysis-request.dto';
import { User } from '../../auth/auth.service';
import { OrchestrationJobData, JobPriority } from '../interfaces/queue.interfaces';

describe('OrchestrationQueueProcessor', () => {
  let processor: OrchestrationQueueProcessor;
  let mockOrchestrationService: jest.Mocked<OrchestrationService>;
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

  const mockJobData: OrchestrationJobData = {
    jobId: 'job-123',
    request: mockRequest,
    user: mockUser,
    correlationId: 'correlation-123',
    priority: JobPriority.NORMAL,
    createdAt: new Date(),
    estimatedDuration: 120000,
    retryCount: 0,
  };

  const mockOrchestrationResult = {
    services: {
      onchain: {
        status: 'success' as const,
        data: { riskScore: 75 },
        responseTime: 1000,
        serviceName: 'onchain',
      },
      sentiment: {
        status: 'success' as const,
        data: { sentimentScore: 0.8 },
        responseTime: 800,
        serviceName: 'sentiment',
      },
    },
    warnings: [],
    recommendations: [],
    executionTime: 2000,
    successRate: 1,
    parallelExecutionStats: {
      totalServices: 2,
      successfulServices: 2,
      failedServices: 0,
      timeoutServices: 0,
      fallbackServices: 0,
      averageResponseTime: 900,
    },
  };

  beforeEach(async () => {
    mockOrchestrationService = {
      orchestrateAnalysis: jest.fn(),
    } as any;

    mockLoggerService = {
      log: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    } as any;

    mockMetricsService = {
      recordQueueOperation: jest.fn(),
      recordAnalysis: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrchestrationQueueProcessor,
        { provide: OrchestrationService, useValue: mockOrchestrationService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: MetricsService, useValue: mockMetricsService },
      ],
    }).compile();

    processor = module.get<OrchestrationQueueProcessor>(OrchestrationQueueProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processOrchestration', () => {
    it('should process orchestration job successfully', async () => {
      const mockJob = {
        data: mockJobData,
        progress: jest.fn(),
        attemptsMade: 1,
      };

      mockOrchestrationService.orchestrateAnalysis.mockResolvedValue(mockOrchestrationResult);

      const result = await processor.processOrchestration(mockJob as any);

      expect(result).toEqual(
        expect.objectContaining({
          jobId: 'job-123',
          result: mockOrchestrationResult,
          success: true,
          retryCount: 1,
        }),
      );

      expect(mockJob.progress).toHaveBeenCalledWith(10);
      expect(mockJob.progress).toHaveBeenCalledWith(50);
      expect(mockJob.progress).toHaveBeenCalledWith(90);
      expect(mockJob.progress).toHaveBeenCalledWith(100);

      expect(mockOrchestrationService.orchestrateAnalysis).toHaveBeenCalledWith(
        mockRequest,
        mockUser,
        'correlation-123',
      );

      expect(mockMetricsService.recordQueueOperation).toHaveBeenCalledWith('job_completed', 'orchestration');
      expect(mockMetricsService.recordAnalysis).toHaveBeenCalledWith(
        'bitcoin',
        'full',
        expect.any(Number),
        true,
        'test-user-123',
        'pro',
      );

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Processing queued orchestration request',
        expect.objectContaining({
          jobId: 'job-123',
          projectId: 'bitcoin',
          userId: 'test-user-123',
          userTier: 'pro',
          priority: JobPriority.NORMAL,
        }),
      );

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Queued orchestration completed successfully',
        expect.objectContaining({
          jobId: 'job-123',
          successRate: 1,
          servicesCount: 2,
        }),
      );
    });

    it('should handle orchestration failure', async () => {
      const mockJob = {
        data: mockJobData,
        progress: jest.fn(),
        attemptsMade: 2,
      };

      const error = new Error('Orchestration failed');
      mockOrchestrationService.orchestrateAnalysis.mockRejectedValue(error);

      await expect(processor.processOrchestration(mockJob as any)).rejects.toThrow('Orchestration failed');

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'Queued orchestration failed',
        error.stack,
        'OrchestrationQueueProcessor',
        expect.objectContaining({
          jobId: 'job-123',
          projectId: 'bitcoin',
          attemptsMade: 2,
        }),
      );

      expect(mockMetricsService.recordQueueOperation).toHaveBeenCalledWith('job_failed', 'orchestration');
      expect(mockMetricsService.recordAnalysis).toHaveBeenCalledWith(
        'bitcoin',
        'full',
        expect.any(Number),
        false,
        'test-user-123',
        'pro',
      );
    });

    it('should handle invalid orchestration result', async () => {
      const mockJob = {
        data: mockJobData,
        progress: jest.fn(),
        attemptsMade: 1,
      };

      // Return invalid result (no services)
      mockOrchestrationService.orchestrateAnalysis.mockResolvedValue(null as any);

      await expect(processor.processOrchestration(mockJob as any)).rejects.toThrow('Invalid orchestration result');

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'Queued orchestration failed',
        expect.any(String),
        'OrchestrationQueueProcessor',
        expect.objectContaining({
          jobId: 'job-123',
        }),
      );
    });

    it('should track processing time and wait time correctly', async () => {
      const pastDate = new Date(Date.now() - 5000); // 5 seconds ago
      const jobDataWithPastDate = { ...mockJobData, createdAt: pastDate };

      const mockJob = {
        data: jobDataWithPastDate,
        progress: jest.fn(),
        attemptsMade: 1,
      };

      // Add a small delay to ensure processing time > 0
      mockOrchestrationService.orchestrateAnalysis.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return mockOrchestrationResult;
      });

      const result = await processor.processOrchestration(mockJob as any);

      expect(result.processingTime).toBeGreaterThan(0);
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Processing queued orchestration request',
        expect.objectContaining({
          waitTime: expect.any(Number),
        }),
      );

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Queued orchestration completed successfully',
        expect.objectContaining({
          waitTime: expect.any(Number),
          processingTime: expect.any(Number),
          totalTime: expect.any(Number),
        }),
      );
    });
  });

  describe('handleJobCompleted', () => {
    it('should handle job completion', async () => {
      const mockJob = {
        data: {
          jobId: 'job-123',
          success: true,
          processingTime: 2000,
        },
      };

      await processor.handleJobCompleted(mockJob as any);

      expect(mockLoggerService.debug).toHaveBeenCalledWith(
        'Job completion handler triggered',
        expect.objectContaining({
          jobId: 'job-123',
          success: true,
          processingTime: 2000,
        }),
      );
    });
  });

  describe('handleJobFailed', () => {
    it('should handle job failure', async () => {
      const mockJob = {
        data: {
          jobId: 'job-123',
          error: 'Processing failed',
          retryCount: 2,
        },
      };

      await processor.handleJobFailed(mockJob as any);

      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        'Job failure handler triggered',
        expect.objectContaining({
          jobId: 'job-123',
          error: 'Processing failed',
          retryCount: 2,
        }),
      );
    });
  });
});
