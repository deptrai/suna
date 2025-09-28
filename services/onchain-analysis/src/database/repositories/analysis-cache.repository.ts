/**
 * T2.1.1c: Analysis Cache Repository
 * Repository for managing analysis cache operations
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan } from 'typeorm';
import { AnalysisCacheEntity } from '../entities/analysis-cache.entity';

@Injectable()
export class AnalysisCacheRepository {
  constructor(
    @InjectRepository(AnalysisCacheEntity)
    private readonly repository: Repository<AnalysisCacheEntity>,
  ) {}

  async findByCacheKey(cacheKey: string): Promise<AnalysisCacheEntity | null> {
    return this.repository.findOne({
      where: { cacheKey },
    });
  }

  async findValidCache(cacheKey: string): Promise<AnalysisCacheEntity | null> {
    return this.repository.findOne({
      where: {
        cacheKey,
        expiresAt: MoreThan(new Date()),
      },
    });
  }

  async findByProjectId(
    projectId: string,
    analysisType?: string,
  ): Promise<AnalysisCacheEntity[]> {
    const where: any = {
      projectId,
      expiresAt: MoreThan(new Date()),
    };

    if (analysisType) {
      where.analysisType = analysisType;
    }

    return this.repository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async save(cacheData: Partial<AnalysisCacheEntity>): Promise<AnalysisCacheEntity> {
    const entity = this.repository.create(cacheData);
    return this.repository.save(entity);
  }

  async upsert(cacheData: Partial<AnalysisCacheEntity>): Promise<AnalysisCacheEntity> {
    const existing = await this.findByCacheKey(cacheData.cacheKey!);
    
    if (existing) {
      await this.repository.update(
        { cacheKey: cacheData.cacheKey! },
        {
          ...cacheData,
          updatedAt: new Date(),
        },
      );
      return this.findByCacheKey(cacheData.cacheKey!);
    }

    return this.save(cacheData);
  }

  async deleteExpired(): Promise<number> {
    const result = await this.repository.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected || 0;
  }

  async deleteByProjectId(projectId: string): Promise<number> {
    const result = await this.repository.delete({ projectId });
    return result.affected || 0;
  }

  async deleteByCacheKey(cacheKey: string): Promise<boolean> {
    const result = await this.repository.delete({ cacheKey });
    return (result.affected || 0) > 0;
  }

  async getStatistics(): Promise<{
    total: number;
    expired: number;
    valid: number;
    byAnalysisType: Record<string, number>;
  }> {
    const now = new Date();
    
    const [total, expired, byTypeResults] = await Promise.all([
      this.repository.count(),
      this.repository.count({
        where: { expiresAt: LessThan(now) },
      }),
      this.repository
        .createQueryBuilder('cache')
        .select('cache.analysisType', 'analysisType')
        .addSelect('COUNT(*)', 'count')
        .groupBy('cache.analysisType')
        .getRawMany(),
    ]);

    const byAnalysisType = byTypeResults.reduce((acc, item) => {
      acc[item.analysisType] = parseInt(item.count, 10);
      return acc;
    }, {});

    return {
      total,
      expired,
      valid: total - expired,
      byAnalysisType,
    };
  }

  async cleanup(olderThanHours: number = 24): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    
    const result = await this.repository.delete({
      createdAt: LessThan(cutoffDate),
    });
    
    return result.affected || 0;
  }
}
