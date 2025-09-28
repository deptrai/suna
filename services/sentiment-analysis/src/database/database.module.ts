import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { SentimentCache } from './entities/sentiment-cache.entity';
import { SocialMediaPost } from './entities/social-media-post.entity';
import { NewsArticle } from './entities/news-article.entity';
import { AggregatedMetrics } from './entities/aggregated-metrics.entity';
import { ErrorLog } from './entities/error-log.entity';
import { RateLimit } from './entities/rate-limit.entity';

// Repositories
import { SentimentCacheRepository } from './repositories/sentiment-cache.repository';
import { SocialMediaPostRepository } from './repositories/social-media-post.repository';
import { NewsArticleRepository } from './repositories/news-article.repository';
import { AggregatedMetricsRepository } from './repositories/aggregated-metrics.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SentimentCache,
      SocialMediaPost,
      NewsArticle,
      AggregatedMetrics,
      ErrorLog,
      RateLimit,
    ]),
  ],
  providers: [
    SentimentCacheRepository,
    SocialMediaPostRepository,
    NewsArticleRepository,
    AggregatedMetricsRepository,
  ],
  exports: [
    TypeOrmModule,
    SentimentCacheRepository,
    SocialMediaPostRepository,
    NewsArticleRepository,
    AggregatedMetricsRepository,
  ],
})
export class DatabaseModule {}
