import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OrchestrationService } from './orchestration.service';
import { OrchestrationCacheService } from './services/orchestration-cache.service';
import { CacheService } from '../cache/cache.service';
import { LoggerService } from '../common/services/logger.service';
import { MetricsService } from '../metrics/metrics.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ServiceClientService } from './service-client.service';
import { ServiceClientFactoryService } from './services/service-client-factory.service';
import { AnalysisRequestDto } from '../analysis/dto/analysis-request.dto';

describe('OrchestrationService with Caching Integration', () => {
  let orchestrationService: OrchestrationService;
  let cacheService: jest.Mocked<CacheService>;
  let serviceClientService: jest.Mocked<ServiceClientService>;

  const mockUser = {
    id: 'test-user-123',
    email: 'test@example.com',
    tier: 'pro' as const,
    permissions: ['analysis:read', 'analysis:write'],
  };

  beforeEach(async () => {
    const mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      invalidatePattern: jest.fn(),
    };

    const mockServiceClientService = {
      callService: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const configs = {
          'services.onchain.url': 'http://localhost:3001',
          'services.sentiment.url': 'http://localhost:3002',
          'services.tokenomics.url': 'http://localhost:3003',
          'services.team.url': 'http://localhost:3004',
          'orchestration.maxConcurrency': 4,
          'orchestration.timeout': 30000,
          'orchestration.retryAttempts': 2,
          'orchestration.failFast': false,
          'orchestration.aggregationStrategy': 'best_effort',
          'orchestration.requiredServices': ['onchain'],
          'orchestration.optionalServices': ['sentiment', 'tokenomics', 'team'],
          'cache.warming.enabled': true,
          'cache.warming.popularTokens': ['bitcoin', 'ethereum'],
        };
        return configs[key] || defaultValue;
      }),
    };

    const mockLoggerService = {
      log: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      logCacheOperation: jest.fn(),
    };

    const mockMetricsService = {
      recordExternalApiCall: jest.fn(),
      recordCacheOperation: jest.fn(),
    };

    const mockCircuitBreakerService = {
      executeWithBreaker: jest.fn().mockImplementation((serviceName, fn) => fn()),
    };

    const mockServiceClientFactoryService = {
      createClient: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrchestrationService,
        OrchestrationCacheService,
        { provide: CacheService, useValue: mockCacheService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: CircuitBreakerService, useValue: mockCircuitBreakerService },
        { provide: ServiceClientService, useValue: mockServiceClientService },
        { provide: ServiceClientFactoryService, useValue: mockServiceClientFactoryService },
      ],
    }).compile();

    orchestrationService = module.get<OrchestrationService>(OrchestrationService);
    cacheService = module.get(CacheService);
    serviceClientService = module.get(ServiceClientService);
  });

  describe('orchestrateAnalysis with caching', () => {
    it('should return cached result when available', async () => {
      const request: AnalysisRequestDto = {
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

      const cachedResult = {
        services: {
          onchain: {
            status: 'success',
            data: { riskScore: 75 },
            responseTime: 100,
            serviceName: 'onchain',
          },
        },
        warnings: [],
        recommendations: [],
        executionTime: 150,
        successRate: 1,
        parallelExecutionStats: {
          totalServices: 1,
          successfulServices: 1,
          failedServices: 0,
          timeoutServices: 0,
          fallbackServices: 0,
          averageResponseTime: 100,
        },
      };

      // Mock cache hit
      cacheService.get.mockResolvedValue(cachedResult);

      const result = await orchestrationService.orchestrateAnalysis(
        request,
        mockUser,
        'test-correlation-id',
      );

      expect(result).toEqual(cachedResult);
      expect(cacheService.get).toHaveBeenCalled();
      expect(serviceClientService.callService).not.toHaveBeenCalled();
    });

    it('should call services and cache result when cache miss', async () => {
      const request: AnalysisRequestDto = {
        projectId: 'ethereum',
        analysisType: 'onchain',
        tokenAddress: '0x456...',
        chainId: 1,
      };

      const serviceResponse = {
        riskScore: 85,
        liquidityScore: 90,
        holderCount: 1000,
      };

      // Mock cache miss
      cacheService.get.mockResolvedValue(null);
      
      // Mock service response
      serviceClientService.callService.mockResolvedValue(serviceResponse);

      const result = await orchestrationService.orchestrateAnalysis(
        request,
        mockUser,
        'test-correlation-id',
      );

      expect(result.services.onchain.status).toBe('success');
      expect(result.services.onchain.data).toEqual(serviceResponse);
      expect(cacheService.set).toHaveBeenCalled();
    });
  });

  describe('cache management methods', () => {
    it('should provide cache statistics', async () => {
      const stats = await orchestrationService.getCacheStatistics();
      
      expect(stats).toHaveProperty('metrics');
      expect(stats).toHaveProperty('serviceConfigs');
      expect(stats).toHaveProperty('warmingStrategy');
    });

    it('should invalidate project cache', async () => {
      await orchestrationService.invalidateProjectCache('bitcoin', 'test');
      
      expect(cacheService.invalidatePattern).toHaveBeenCalled();
    });

    it('should provide cache health status', async () => {
      cacheService.set.mockResolvedValue(undefined);
      cacheService.get.mockResolvedValue({ timestamp: Date.now() });
      cacheService.del.mockResolvedValue(undefined);

      const health = await orchestrationService.getCacheHealth();
      
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('details');
    });

    it('should provide cache performance report', () => {
      const report = orchestrationService.getCachePerformanceReport();
      
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('recommendations');
      expect(report.summary).toHaveProperty('hitRate');
      expect(report.summary).toHaveProperty('avgResponseTime');
    });
  });
});
