import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TwitterService } from './twitter.service';
import { RedditService } from './reddit.service';
import { NewsApiService } from './news-api.service';
import { MetricsModule } from '../metrics/metrics.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    MetricsModule,
    CacheModule,
  ],
  providers: [
    TwitterService,
    RedditService,
    NewsApiService,
  ],
  exports: [
    TwitterService,
    RedditService,
    NewsApiService,
  ],
})
export class ExternalApisModule {}
