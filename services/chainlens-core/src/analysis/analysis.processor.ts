import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable } from '@nestjs/common';
import { AnalysisService } from './analysis.service';
import { LoggerService } from '../common/services/logger.service';
import { MetricsService } from '../metrics/metrics.service';
import { AnalysisRequestDto } from './dto/analysis-request.dto';
import { User } from '../auth/auth.service';

interface AnalysisJob {
  analysisId: string;
  request: AnalysisRequestDto;
  user: User;
  correlationId: string;
}

@Injectable()
@Processor('analysis')
export class AnalysisProcessor {
  constructor(
    private analysisService: AnalysisService,
    private logger: LoggerService,
    private metricsService: MetricsService,
  ) {}

  @Process('process-analysis')
  async processAnalysis(job: Job<AnalysisJob>): Promise<void> {
    const { analysisId, request, user, correlationId } = job.data;
    const startTime = Date.now();

    this.logger.log('Processing queued analysis', {
      analysisId,
      projectId: request.projectId,
      userId: user.id,
      correlationId,
    });

    try {
      // Update status to processing
      this.analysisService.updateAnalysisStatus(analysisId, {
        status: 'processing',
        progress: 10,
        currentStage: 'initialization',
        startedAt: new Date().toISOString(),
      });

      // Update job progress
      await job.progress(10);

      // Process the analysis
      const result = await this.analysisService.processAnalysis(request, user, correlationId);

      // Update progress through stages
      await job.progress(50);
      this.analysisService.updateAnalysisStatus(analysisId, {
        progress: 50,
        currentStage: 'data_aggregation',
      });

      await job.progress(80);
      this.analysisService.updateAnalysisStatus(analysisId, {
        progress: 80,
        currentStage: 'final_scoring',
      });

      // Complete the analysis
      await job.progress(100);
      this.analysisService.updateAnalysisStatus(analysisId, {
        status: 'completed',
        progress: 100,
        currentStage: 'completed',
        completedAt: new Date().toISOString(),
        result,
      });

      const processingTime = Date.now() - startTime;
      
      this.logger.log('Queued analysis completed', {
        analysisId,
        projectId: request.projectId,
        userId: user.id,
        processingTime,
        overallScore: result.overallScore,
        correlationId,
      });

      // Record success metrics
      this.metricsService.recordAnalysis(
        request.projectId,
        request.analysisType,
        processingTime,
        true,
        user.id,
        user.tier,
      );

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error('Queued analysis failed', error.stack, 'AnalysisProcessor', {
        analysisId,
        projectId: request.projectId,
        userId: user.id,
        processingTime,
        correlationId,
      });

      // Update status to failed
      this.analysisService.updateAnalysisStatus(analysisId, {
        status: 'failed',
        currentStage: 'error',
        completedAt: new Date().toISOString(),
        error: error.message,
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
}
