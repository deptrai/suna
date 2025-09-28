import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SentimentCache } from '../entities/sentiment-cache.entity';

@Injectable()
export class SentimentCacheRepository {
  constructor(
    @InjectRepository(SentimentCache)
    private repository: Repository<SentimentCache>,
  ) {}

  async findBySymbolAndSource(symbol: string, source: string): Promise<SentimentCache | null> {
    return this.repository.findOne({
      where: { symbol, source },
      order: { createdAt: 'DESC' },
    });
  }

  async findRecentBySymbol(symbol: string, hours: number = 24): Promise<SentimentCache[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.repository.find({
      where: { symbol },
      order: { createdAt: 'DESC' },
    });
  }

  async save(sentimentCache: Partial<SentimentCache>): Promise<SentimentCache> {
    return this.repository.save(sentimentCache);
  }

  async deleteExpired(): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .delete()
      .where('expiresAt < :now', { now: new Date() })
      .execute();
  }
}
