import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AggregatedMetrics } from '../entities/aggregated-metrics.entity';

@Injectable()
export class AggregatedMetricsRepository {
  constructor(
    @InjectRepository(AggregatedMetrics)
    private repository: Repository<AggregatedMetrics>,
  ) {}

  async findBySymbolAndTimeframe(symbol: string, timeframe: string): Promise<AggregatedMetrics | null> {
    return this.repository.findOne({
      where: { symbol, timeframe },
      order: { createdAt: 'DESC' },
    });
  }

  async findBySymbol(symbol: string): Promise<AggregatedMetrics[]> {
    return this.repository.find({
      where: { symbol },
      order: { timeframe: 'ASC', createdAt: 'DESC' },
    });
  }

  async save(metrics: Partial<AggregatedMetrics>): Promise<AggregatedMetrics> {
    return this.repository.save(metrics);
  }

  async findTrending(limit: number = 10): Promise<AggregatedMetrics[]> {
    return this.repository.find({
      where: { timeframe: '24h' },
      order: { overallSentiment: 'DESC' },
      take: limit,
    });
  }
}
