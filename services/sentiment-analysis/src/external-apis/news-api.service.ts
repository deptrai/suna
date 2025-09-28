import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class NewsApiService {
  private readonly logger = new Logger(NewsApiService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    private metricsService: MetricsService,
  ) {
    this.baseUrl = this.configService.get<string>('externalApi.newsApi.baseUrl');
    this.apiKey = this.configService.get<string>('externalApi.newsApi.apiKey');
  }

  async searchNews(query: string, pageSize: number = 20): Promise<any> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Searching news for query: ${query}`);
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      const result = {
        status: 'ok',
        totalResults: Math.floor(Math.random() * 1000) + 100,
        articles: Array.from({ length: Math.min(pageSize, 20) }, (_, i) => ({
          source: {
            id: `source_${i}`,
            name: ['CoinDesk', 'CoinTelegraph', 'Decrypt', 'The Block', 'CryptoNews'][Math.floor(Math.random() * 5)],
          },
          author: `Author ${i}`,
          title: `${query} News: Market Analysis and Trends #${i}`,
          description: `This article discusses the latest developments in ${query} and its impact on the cryptocurrency market. Article ${i}.`,
          url: `https://example.com/news/${i}`,
          urlToImage: `https://example.com/images/news_${i}.jpg`,
          publishedAt: new Date(Date.now() - Math.random() * 86400000).toISOString(),
          content: `Full content of the article about ${query}. This would contain the complete article text in a real implementation.`,
        })),
      };

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('newsapi', 'search', 'success');
      this.metricsService.recordApiResponseTime('newsapi', 'search', duration);

      return result;
    } catch (error) {
      this.logger.error(`Error searching news for query ${query}:`, error);
      this.metricsService.incrementApiRequests('newsapi', 'search', 'error');
      this.metricsService.incrementErrors('external_api', 'newsapi');
      throw error;
    }
  }

  async getTopHeadlines(category: string = 'business', country: string = 'us'): Promise<any> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Getting top headlines for category: ${category}`);
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const result = {
        status: 'ok',
        totalResults: Math.floor(Math.random() * 50) + 10,
        articles: Array.from({ length: 10 }, (_, i) => ({
          source: {
            id: `headline_source_${i}`,
            name: ['Reuters', 'Bloomberg', 'CNBC', 'Financial Times', 'Wall Street Journal'][Math.floor(Math.random() * 5)],
          },
          author: `Headline Author ${i}`,
          title: `Breaking: Cryptocurrency Market Update #${i}`,
          description: `Latest breaking news about cryptocurrency markets and blockchain technology. Headline ${i}.`,
          url: `https://example.com/headlines/${i}`,
          urlToImage: `https://example.com/images/headline_${i}.jpg`,
          publishedAt: new Date(Date.now() - Math.random() * 3600000).toISOString(),
          content: `Breaking news content about cryptocurrency markets. This would contain the complete article text.`,
        })),
      };

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('newsapi', 'headlines', 'success');
      this.metricsService.recordApiResponseTime('newsapi', 'headlines', duration);

      return result;
    } catch (error) {
      this.logger.error(`Error getting top headlines for category ${category}:`, error);
      this.metricsService.incrementApiRequests('newsapi', 'headlines', 'error');
      this.metricsService.incrementErrors('external_api', 'newsapi');
      throw error;
    }
  }

  async getEverything(query: string, sortBy: string = 'publishedAt', pageSize: number = 20): Promise<any> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Getting everything for query: ${query}`);
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const result = {
        status: 'ok',
        totalResults: Math.floor(Math.random() * 2000) + 500,
        articles: Array.from({ length: Math.min(pageSize, 20) }, (_, i) => ({
          source: {
            id: `everything_source_${i}`,
            name: ['CoinDesk', 'CoinTelegraph', 'Decrypt', 'The Block', 'CryptoNews', 'Cointelegraph'][Math.floor(Math.random() * 6)],
          },
          author: `Everything Author ${i}`,
          title: `Comprehensive ${query} Analysis and Market Outlook #${i}`,
          description: `In-depth analysis of ${query} covering market trends, technical analysis, and future predictions. Article ${i}.`,
          url: `https://example.com/everything/${i}`,
          urlToImage: `https://example.com/images/everything_${i}.jpg`,
          publishedAt: new Date(Date.now() - Math.random() * 172800000).toISOString(), // Last 2 days
          content: `Comprehensive content about ${query} including market analysis, price predictions, and expert opinions.`,
        })),
      };

      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.incrementApiRequests('newsapi', 'everything', 'success');
      this.metricsService.recordApiResponseTime('newsapi', 'everything', duration);

      return result;
    } catch (error) {
      this.logger.error(`Error getting everything for query ${query}:`, error);
      this.metricsService.incrementApiRequests('newsapi', 'everything', 'error');
      this.metricsService.incrementErrors('external_api', 'newsapi');
      throw error;
    }
  }
}
