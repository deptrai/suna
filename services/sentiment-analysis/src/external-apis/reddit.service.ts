import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class RedditService {
  private readonly logger = new Logger(RedditService.name);
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    private metricsService: MetricsService,
  ) {
    this.baseUrl = this.configService.get<string>('externalApi.reddit.baseUrl');
    this.clientId = this.configService.get<string>('externalApi.reddit.clientId');
    this.clientSecret = this.configService.get<string>('externalApi.reddit.clientSecret');
  }

  async getSubredditPosts(subreddit: string, limit: number = 25): Promise<any> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Getting posts from subreddit: ${subreddit}`);
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const result = {
        data: {
          children: Array.from({ length: Math.min(limit, 25) }, (_, i) => ({
            data: {
              id: `post_${i}`,
              title: `Sample post about crypto #${i}`,
              selftext: `This is a sample post content about cryptocurrency and blockchain technology. Post number ${i}.`,
              author: `user_${i}`,
              created_utc: Math.floor(Date.now() / 1000) - Math.random() * 86400,
              score: Math.floor(Math.random() * 1000),
              upvote_ratio: Math.random() * 0.5 + 0.5,
              num_comments: Math.floor(Math.random() * 100),
              subreddit,
              permalink: `/r/${subreddit}/comments/sample_${i}/`,
            },
          })),
        },
      };

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('reddit', 'subreddit_posts', 'success');
      this.metricsService.recordApiResponseTime('reddit', 'subreddit_posts', duration);

      return result;
    } catch (error) {
      this.logger.error(`Error getting posts from subreddit ${subreddit}:`, error);
      this.metricsService.incrementApiRequests('reddit', 'subreddit_posts', 'error');
      this.metricsService.incrementErrors('external_api', 'reddit');
      throw error;
    }
  }

  async searchPosts(query: string, subreddit?: string, limit: number = 25): Promise<any> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Searching Reddit posts for query: ${query}`);
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const result = {
        data: {
          children: Array.from({ length: Math.min(limit, 25) }, (_, i) => ({
            data: {
              id: `search_${i}`,
              title: `Search result for ${query} #${i}`,
              selftext: `This post mentions ${query} and discusses related topics. Result number ${i}.`,
              author: `search_user_${i}`,
              created_utc: Math.floor(Date.now() / 1000) - Math.random() * 86400,
              score: Math.floor(Math.random() * 500),
              upvote_ratio: Math.random() * 0.5 + 0.5,
              num_comments: Math.floor(Math.random() * 50),
              subreddit: subreddit || 'cryptocurrency',
              permalink: `/r/${subreddit || 'cryptocurrency'}/comments/search_${i}/`,
            },
          })),
        },
      };

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('reddit', 'search', 'success');
      this.metricsService.recordApiResponseTime('reddit', 'search', duration);

      return result;
    } catch (error) {
      this.logger.error(`Error searching Reddit posts for query ${query}:`, error);
      this.metricsService.incrementApiRequests('reddit', 'search', 'error');
      this.metricsService.incrementErrors('external_api', 'reddit');
      throw error;
    }
  }

  async getPostComments(postId: string, subreddit: string): Promise<any> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Getting comments for post: ${postId}`);
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 600));
      
      const result = [
        {
          data: {
            children: Array.from({ length: Math.floor(Math.random() * 20) + 5 }, (_, i) => ({
              data: {
                id: `comment_${i}`,
                body: `This is a sample comment about the post. Comment number ${i}.`,
                author: `commenter_${i}`,
                created_utc: Math.floor(Date.now() / 1000) - Math.random() * 3600,
                score: Math.floor(Math.random() * 100),
                ups: Math.floor(Math.random() * 100),
                downs: Math.floor(Math.random() * 10),
              },
            })),
          },
        },
      ];

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('reddit', 'comments', 'success');
      this.metricsService.recordApiResponseTime('reddit', 'comments', duration);

      return result;
    } catch (error) {
      this.logger.error(`Error getting comments for post ${postId}:`, error);
      this.metricsService.incrementApiRequests('reddit', 'comments', 'error');
      this.metricsService.incrementErrors('external_api', 'reddit');
      throw error;
    }
  }
}
