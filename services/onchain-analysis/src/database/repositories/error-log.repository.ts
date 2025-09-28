/**
 * T2.1.1c: Error Log Repository
 * Repository for managing error log operations
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan, Between } from 'typeorm';
import { ErrorLogEntity, ErrorSeverity, ErrorCategory } from '../entities/error-log.entity';

@Injectable()
export class ErrorLogRepository {
  constructor(
    @InjectRepository(ErrorLogEntity)
    private readonly repository: Repository<ErrorLogEntity>,
  ) {}

  async logError(errorData: Partial<ErrorLogEntity>): Promise<ErrorLogEntity> {
    const entity = this.repository.create(errorData);
    return this.repository.save(entity);
  }

  async findById(id: string): Promise<ErrorLogEntity | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByCorrelationId(correlationId: string): Promise<ErrorLogEntity[]> {
    return this.repository.find({
      where: { correlationId },
      order: { createdAt: 'DESC' },
    });
  }

  async findRecentErrors(
    hours: number = 24,
    severity?: ErrorSeverity,
    category?: ErrorCategory,
  ): Promise<ErrorLogEntity[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const where: any = { createdAt: MoreThan(since) };

    if (severity) where.severity = severity;
    if (category) where.errorCategory = category;

    return this.repository.find({
      where,
      order: { createdAt: 'DESC' },
      take: 1000, // Limit to prevent memory issues
    });
  }

  async findCriticalErrors(hours: number = 1): Promise<ErrorLogEntity[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return this.repository.find({
      where: {
        severity: ErrorSeverity.CRITICAL,
        createdAt: MoreThan(since),
        resolved: false,
      },
      order: { createdAt: 'DESC' },
    });
  }

  async markResolved(id: string, resolution: string): Promise<boolean> {
    const result = await this.repository.update(
      { id },
      {
        resolved: true,
        resolution,
        resolvedAt: new Date(),
      },
    );
    return (result.affected || 0) > 0;
  }

  async getErrorStatistics(hours: number = 24): Promise<{
    total: number;
    bySeverity: Record<ErrorSeverity, number>;
    byCategory: Record<ErrorCategory, number>;
    byHour: Array<{ hour: string; count: number }>;
    topErrors: Array<{ message: string; count: number }>;
    resolved: number;
    unresolved: number;
  }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [
      total,
      resolved,
      bySeverityResults,
      byCategoryResults,
      topErrorsResults,
    ] = await Promise.all([
      this.repository.count({
        where: { createdAt: MoreThan(since) },
      }),
      this.repository.count({
        where: { createdAt: MoreThan(since), resolved: true },
      }),
      this.repository
        .createQueryBuilder('error')
        .select('error.severity', 'severity')
        .addSelect('COUNT(*)', 'count')
        .where('error.createdAt > :since', { since })
        .groupBy('error.severity')
        .getRawMany(),
      this.repository
        .createQueryBuilder('error')
        .select('error.errorCategory', 'category')
        .addSelect('COUNT(*)', 'count')
        .where('error.createdAt > :since', { since })
        .groupBy('error.errorCategory')
        .getRawMany(),
      this.repository
        .createQueryBuilder('error')
        .select('error.errorMessage', 'message')
        .addSelect('COUNT(*)', 'count')
        .where('error.createdAt > :since', { since })
        .groupBy('error.errorMessage')
        .orderBy('COUNT(*)', 'DESC')
        .limit(10)
        .getRawMany(),
    ]);

    const bySeverity = Object.values(ErrorSeverity).reduce((acc, severity) => {
      acc[severity] = 0;
      return acc;
    }, {} as Record<ErrorSeverity, number>);

    bySeverityResults.forEach(item => {
      bySeverity[item.severity as ErrorSeverity] = parseInt(item.count, 10);
    });

    const byCategory = Object.values(ErrorCategory).reduce((acc, category) => {
      acc[category] = 0;
      return acc;
    }, {} as Record<ErrorCategory, number>);

    byCategoryResults.forEach(item => {
      byCategory[item.category as ErrorCategory] = parseInt(item.count, 10);
    });

    const topErrors = topErrorsResults.map(item => ({
      message: item.message,
      count: parseInt(item.count, 10),
    }));

    // Generate hourly breakdown
    const byHour: Array<{ hour: string; count: number }> = [];
    for (let i = hours - 1; i >= 0; i--) {
      const hourStart = new Date(Date.now() - i * 60 * 60 * 1000);
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
      
      const count = await this.repository.count({
        where: {
          createdAt: Between(hourStart, hourEnd),
        },
      });

      byHour.push({
        hour: hourStart.toISOString().substring(0, 13) + ':00:00Z',
        count,
      });
    }

    return {
      total,
      bySeverity,
      byCategory,
      byHour,
      topErrors,
      resolved,
      unresolved: total - resolved,
    };
  }

  async cleanup(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    
    const result = await this.repository.delete({
      createdAt: LessThan(cutoffDate),
      resolved: true, // Only delete resolved errors
    });
    
    return result.affected || 0;
  }

  async findErrorsByUser(userId: string, hours: number = 24): Promise<ErrorLogEntity[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return this.repository.find({
      where: {
        userId,
        createdAt: MoreThan(since),
      },
      order: { createdAt: 'DESC' },
    });
  }

  async findErrorsByProject(projectId: string, hours: number = 24): Promise<ErrorLogEntity[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return this.repository.find({
      where: {
        projectId,
        createdAt: MoreThan(since),
      },
      order: { createdAt: 'DESC' },
    });
  }
}
