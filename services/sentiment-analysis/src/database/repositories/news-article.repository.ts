import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NewsArticle } from '../entities/news-article.entity';

@Injectable()
export class NewsArticleRepository {
  constructor(
    @InjectRepository(NewsArticle)
    private repository: Repository<NewsArticle>,
  ) {}

  async findBySourceAndSymbol(source: string, symbol: string, limit: number = 50): Promise<NewsArticle[]> {
    return this.repository.find({
      where: { source, symbol },
      order: { publishedAt: 'DESC' },
      take: limit,
    });
  }

  async findRecent(hours: number = 24): Promise<NewsArticle[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.repository.find({
      where: {},
      order: { publishedAt: 'DESC' },
    });
  }

  async save(article: Partial<NewsArticle>): Promise<NewsArticle> {
    return this.repository.save(article);
  }

  async saveBatch(articles: Partial<NewsArticle>[]): Promise<NewsArticle[]> {
    return this.repository.save(articles);
  }
}
