import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

import { User } from '../auth/auth.service';
import { CacheService } from '../cache/cache.service';
import { MetricsService } from '../metrics/metrics.service';
import { OrchestrationService } from '../orchestration/orchestration.service';
import { LoggerService } from '../common/services/logger.service';

import { AnalysisRequestDto } from './dto/analysis-request.dto';
import { AnalysisResponseDto } from './dto/analysis-response.dto';
import { AnalysisStatusDto } from './dto/analysis-status.dto';

interface QueuedAnalysis {
  analysisId: string;
  estimatedCompletion: number;
}

interface AnalysisHistory {
  analyses: AnalysisResponseDto[];
  total: number;
  limit: number;
  offset: number;
}

interface PopularProjects {
  projects: Array<{
    projectId: string;
    analysisCount: number;
    lastAnalysis: string;
    averageScore: number;
  }>;
}

@Injectable()
export class AnalysisService {
  private readonly analysisStatuses = new Map<string, AnalysisStatusDto>();
  private readonly analysisHistory = new Map<string, AnalysisResponseDto[]>();

  constructor(
    @InjectQueue('analysis') private analysisQueue: Queue,
    private configService: ConfigService,
    private cacheService: CacheService,
    private metricsService: MetricsService,
    private orchestrationService: OrchestrationService,
    private logger: LoggerService,
  ) {}

  async canProcessImmediately(
    request: AnalysisRequestDto,
    user: User,
  ): Promise<boolean> {
    // Check system load
    const queueSize = await this.analysisQueue.getWaiting();
    const maxImmediateProcessing = this.configService.get<number>('analysis.maxImmediateProcessing', 5);
    
    if (queueSize.length >= maxImmediateProcessing) {
      return false;
    }

    // Check user tier limits
    if (user.tier === 'free') {
      // Free tier always goes to queue for rate limiting
      return false;
    }

    // Pro and Enterprise can process immediately if system load allows
    return true;
  }

  async processAnalysis(
    request: AnalysisRequestDto,
    user: User,
    correlationId: string,
  ): Promise<AnalysisResponseDto> {
    const startTime = Date.now();

    try {
      // Check cache first
      const cacheKey = CacheService.buildAnalysisKey(request.projectId, request.analysisType);
      const cached = await this.cacheService.get<AnalysisResponseDto>(cacheKey);
      
      if (cached && request.options?.enableCaching !== false) {
        this.logger.log('Analysis served from cache', {
          projectId: request.projectId,
          userId: user.id,
          correlationId,
        });

        // Record cache hit
        this.metricsService.recordCacheOperation('hit', 'analysis');
        
        return {
          ...cached,
          cached: true,
          correlationId,
        };
      }

      // Record cache miss
      this.metricsService.recordCacheOperation('miss', 'analysis');

      // Validate request
      await this.validateAnalysisRequest(request, user);

      // Orchestrate analysis across microservices
      const result = await this.orchestrationService.orchestrateAnalysis(request, user, correlationId);

      // Calculate overall metrics
      const overallScore = this.calculateOverallScore(result.services);
      const confidence = this.calculateConfidence(result.services);
      const riskLevel = this.calculateRiskLevel(overallScore);

      const analysisResponse: AnalysisResponseDto = {
        projectId: request.projectId,
        analysisType: request.analysisType,
        overallScore,
        confidence,
        riskLevel,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - startTime,
        services: result.services,
        warnings: result.warnings,
        recommendations: result.recommendations,
        cached: false,
        correlationId,
        metadata: {
          dataQuality: this.assessDataQuality(result.services),
          sourcesUsed: this.extractSourcesUsed(result.services),
          lastUpdated: new Date().toISOString(),
        },
      };

      // Cache the result
      if (request.options?.enableCaching !== false) {
        await this.cacheService.set(cacheKey, analysisResponse, {
          confidence,
          ttl: this.calculateCacheTtl(confidence),
          tags: ['analysis', request.projectId, request.analysisType],
        });
      }

      // Store in history
      await this.storeAnalysisHistory(user.id, analysisResponse);

      // Record metrics
      this.metricsService.recordAnalysis(
        request.projectId,
        request.analysisType,
        analysisResponse.processingTime,
        true,
        user.id,
        user.tier,
      );

      return analysisResponse;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error('Analysis processing failed', error.stack, 'AnalysisService', {
        projectId: request.projectId,
        userId: user.id,
        correlationId,
        processingTime,
      });

      // Record failure metrics
      this.metricsService.recordAnalysis(
        request.projectId,
        request.analysisType,
        processingTime,
        false,
        user.id,
        user.tier,
      );

      throw error;
    }
  }

  async queueAnalysis(
    request: AnalysisRequestDto,
    user: User,
    correlationId: string,
  ): Promise<QueuedAnalysis> {
    const analysisId = uuidv4();
    
    // Create initial status
    const status: AnalysisStatusDto = {
      analysisId,
      status: 'queued',
      progress: 0,
      currentStage: 'initialization',
      estimatedCompletion: this.calculateEstimatedCompletion(request, user),
      createdAt: new Date().toISOString(),
      metadata: {
        projectId: request.projectId,
        analysisType: request.analysisType,
        priority: request.priority,
        userId: user.id,
        correlationId,
      },
    };

    this.analysisStatuses.set(analysisId, status);

    // Add to queue
    const priority = this.calculateJobPriority(request.priority, user.tier);
    await this.analysisQueue.add(
      'process-analysis',
      {
        analysisId,
        request,
        user,
        correlationId,
      },
      {
        priority,
        delay: user.tier === 'free' ? 5000 : 0, // 5 second delay for free tier
      },
    );

    return {
      analysisId,
      estimatedCompletion: status.estimatedCompletion,
    };
  }

  async getAnalysisStatus(analysisId: string, userId: string): Promise<AnalysisStatusDto> {
    const status = this.analysisStatuses.get(analysisId);
    
    if (!status) {
      throw new NotFoundException('Analysis not found');
    }

    // Verify user owns this analysis
    if (status.metadata?.userId !== userId) {
      throw new NotFoundException('Analysis not found');
    }

    return status;
  }

  async getAnalysisHistory(
    userId: string,
    options: { limit: number; offset: number; projectId?: string },
  ): Promise<AnalysisHistory> {
    const userHistory = this.analysisHistory.get(userId) || [];
    
    let filteredHistory = userHistory;
    if (options.projectId) {
      filteredHistory = userHistory.filter(analysis => analysis.projectId === options.projectId);
    }

    // Sort by timestamp (newest first)
    filteredHistory.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const total = filteredHistory.length;
    const analyses = filteredHistory.slice(options.offset, options.offset + options.limit);

    return {
      analyses,
      total,
      limit: options.limit,
      offset: options.offset,
    };
  }

  async getPopularProjects(limit: number): Promise<PopularProjects> {
    // This would typically come from a database
    // For now, return mock data
    const mockProjects = [
      {
        projectId: 'bitcoin',
        analysisCount: 1250,
        lastAnalysis: new Date(Date.now() - 60000).toISOString(),
        averageScore: 88,
      },
      {
        projectId: 'ethereum',
        analysisCount: 980,
        lastAnalysis: new Date(Date.now() - 120000).toISOString(),
        averageScore: 85,
      },
      {
        projectId: 'uniswap',
        analysisCount: 750,
        lastAnalysis: new Date(Date.now() - 180000).toISOString(),
        averageScore: 82,
      },
    ];

    return {
      projects: mockProjects.slice(0, limit),
    };
  }

  // Update analysis status (called by processor)
  updateAnalysisStatus(analysisId: string, updates: Partial<AnalysisStatusDto>): void {
    const currentStatus = this.analysisStatuses.get(analysisId);
    if (currentStatus) {
      this.analysisStatuses.set(analysisId, { ...currentStatus, ...updates });
    }
  }

  private async validateAnalysisRequest(request: AnalysisRequestDto, user: User): Promise<void> {
    // Validate project ID format
    if (!request.projectId || request.projectId.length < 2) {
      throw new BadRequestException('Invalid project ID');
    }

    // Check permissions for analysis type
    if (request.analysisType === 'full' && !user.permissions.includes('crypto:analyze:premium')) {
      if (user.tier === 'free') {
        throw new BadRequestException('Full analysis requires Pro or Enterprise tier');
      }
    }

    // Validate token address format if provided
    if (request.tokenAddress && !/^0x[a-fA-F0-9]{40}$/.test(request.tokenAddress)) {
      throw new BadRequestException('Invalid token address format');
    }
  }

  private calculateOverallScore(services: Record<string, any>): number {
    const scores: number[] = [];
    
    if (services.onchain?.data?.riskScore) {
      scores.push(100 - services.onchain.data.riskScore); // Invert risk score
    }
    
    if (services.sentiment?.data?.overallSentiment) {
      scores.push(services.sentiment.data.overallSentiment * 100);
    }
    
    if (services.tokenomics?.data?.tokenomicsScore) {
      scores.push(services.tokenomics.data.tokenomicsScore);
    }
    
    if (services.team?.data?.credibilityScore) {
      scores.push(services.team.data.credibilityScore);
    }

    return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  }

  private calculateConfidence(services: Record<string, any>): number {
    const confidences: number[] = [];
    
    Object.values(services).forEach((service: any) => {
      if (service.data?.confidence) {
        confidences.push(service.data.confidence);
      }
    });

    return confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;
  }

  private calculateRiskLevel(overallScore: number): string {
    if (overallScore >= 80) return 'very-low';
    if (overallScore >= 60) return 'low';
    if (overallScore >= 40) return 'medium';
    if (overallScore >= 20) return 'high';
    return 'very-high';
  }

  private calculateCacheTtl(confidence: number): number {
    // Higher confidence = longer cache time
    if (confidence > 0.9) return 1800; // 30 minutes
    if (confidence > 0.8) return 900;  // 15 minutes
    if (confidence > 0.6) return 600;  // 10 minutes
    return 300; // 5 minutes
  }

  private calculateEstimatedCompletion(request: AnalysisRequestDto, user: User): number {
    let baseTime = 30; // 30 seconds base
    
    if (request.analysisType === 'full') {
      baseTime = 60; // 60 seconds for full analysis
    }
    
    // Add delay for free tier
    if (user.tier === 'free') {
      baseTime += 30;
    }
    
    return baseTime;
  }

  private calculateJobPriority(priority: string, tier: string): number {
    const tierPriority = {
      enterprise: 10,
      pro: 5,
      free: 1,
    };
    
    const requestPriority = {
      high: 3,
      normal: 2,
      low: 1,
    };
    
    return (tierPriority[tier] || 1) * (requestPriority[priority] || 2);
  }

  private assessDataQuality(services: Record<string, any>): string {
    const successfulServices = Object.values(services).filter(
      (service: any) => service.status === 'success'
    ).length;
    
    const totalServices = Object.keys(services).length;
    const successRate = successfulServices / totalServices;
    
    if (successRate >= 0.9) return 'high';
    if (successRate >= 0.7) return 'medium';
    return 'low';
  }

  private extractSourcesUsed(services: Record<string, any>): string[] {
    const sources = new Set<string>();
    
    Object.values(services).forEach((service: any) => {
      if (service.data?.dataSources) {
        service.data.dataSources.forEach((source: string) => sources.add(source));
      }
    });
    
    return Array.from(sources);
  }

  private async storeAnalysisHistory(userId: string, analysis: AnalysisResponseDto): Promise<void> {
    const userHistory = this.analysisHistory.get(userId) || [];
    userHistory.unshift(analysis); // Add to beginning
    
    // Keep only last 100 analyses per user
    if (userHistory.length > 100) {
      userHistory.splice(100);
    }
    
    this.analysisHistory.set(userId, userHistory);
  }
}
