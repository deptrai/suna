import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Sentiment Analysis (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('/api/v1/health (GET)', () => {
    it('should return health status', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBeDefined();
          expect(res.body.info).toBeDefined();
        });
    });
  });

  describe('/api/v1/sentiment/analyze (POST)', () => {
    it('should analyze positive sentiment', () => {
      return request(app.getHttpServer())
        .post('/api/v1/sentiment/analyze')
        .send({
          text: 'Bitcoin is going to the moon! 🚀💎 HODL strong!',
          source: 'test'
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.sentiment).toBe('positive');
          expect(res.body.score).toBeGreaterThan(0);
          expect(res.body.confidence).toBeGreaterThan(0);
          expect(res.body.breakdown).toBeDefined();
          expect(res.body.preprocessing).toBeDefined();
          expect(res.body.biasDetection).toBeDefined();
        });
    });

    it('should analyze negative sentiment', () => {
      return request(app.getHttpServer())
        .post('/api/v1/sentiment/analyze')
        .send({
          text: 'This crypto crash is terrible 😭 Getting rekt',
          source: 'test'
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.sentiment).toBe('negative');
          expect(res.body.score).toBeLessThan(0);
          expect(res.body.confidence).toBeGreaterThan(0);
        });
    });

    it('should analyze neutral sentiment', () => {
      return request(app.getHttpServer())
        .post('/api/v1/sentiment/analyze')
        .send({
          text: 'Blockchain technology analysis report',
          source: 'test'
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.sentiment).toBe('neutral');
          expect(Math.abs(res.body.score)).toBeLessThan(0.1);
        });
    });

    it('should handle crypto slang', () => {
      return request(app.getHttpServer())
        .post('/api/v1/sentiment/analyze')
        .send({
          text: 'HODL your coins, avoid FUD and FOMO',
          source: 'test'
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.preprocessing.slangTerms).toContain('hodl');
          expect(res.body.preprocessing.slangTerms).toContain('fud');
          expect(res.body.preprocessing.slangTerms).toContain('fomo');
        });
    });

    it('should detect emoji sentiment', () => {
      return request(app.getHttpServer())
        .post('/api/v1/sentiment/analyze')
        .send({
          text: 'Crypto market today 🚀📈💰',
          source: 'test'
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.preprocessing.emojis).toContain('🚀');
          expect(res.body.preprocessing.emojis).toContain('📈');
          expect(res.body.preprocessing.emojis).toContain('💰');
          expect(res.body.breakdown.emoji.score).toBeGreaterThan(0);
        });
    });

    it('should detect bias', () => {
      return request(app.getHttpServer())
        .post('/api/v1/sentiment/analyze')
        .send({
          text: 'Short 😭😭😭',
          source: 'twitter'
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.biasDetection.hasBias).toBe(true);
          expect(res.body.biasDetection.biasType).toContain('emoji');
          expect(res.body.biasDetection.biasType).toContain('source_social_media');
        });
    });

    it('should validate input', () => {
      return request(app.getHttpServer())
        .post('/api/v1/sentiment/analyze')
        .send({})
        .expect(400);
    });
  });

  describe('/api/v1/sentiment/symbol/:symbol (GET)', () => {
    it('should get aggregated sentiment for BTC', () => {
      return request(app.getHttpServer())
        .get('/api/v1/sentiment/symbol/BTC')
        .expect(200)
        .expect((res) => {
          expect(res.body.symbol).toBe('BTC');
          expect(res.body.overallSentiment).toBeDefined();
          expect(res.body.weightedSentiment).toBeDefined();
          expect(res.body.sources).toBeDefined();
          expect(res.body.sources.twitter).toBeDefined();
          expect(res.body.sources.reddit).toBeDefined();
          expect(res.body.sources.news).toBeDefined();
          expect(res.body.confidence).toBeGreaterThan(0);
          expect(res.body.timeDecayFactor).toBeGreaterThan(0);
          expect(res.body.outliers).toBeDefined();
        });
    });

    it('should handle different symbols', () => {
      return request(app.getHttpServer())
        .get('/api/v1/sentiment/symbol/ETH')
        .expect(200)
        .expect((res) => {
          expect(res.body.symbol).toBe('ETH');
        });
    });
  });

  describe('/api/v1/sentiment/batch (POST)', () => {
    it('should analyze multiple texts', () => {
      return request(app.getHttpServer())
        .post('/api/v1/sentiment/batch')
        .send({
          texts: [
            'Bitcoin is great! 🚀',
            'Crypto crash is bad 😭',
            'Neutral blockchain analysis'
          ],
          source: 'batch_test'
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveLength(3);
          expect(res.body[0].sentiment).toBe('positive');
          expect(res.body[1].sentiment).toBe('negative');
          expect(res.body[2].sentiment).toBe('neutral');
        });
    });

    it('should validate batch input', () => {
      return request(app.getHttpServer())
        .post('/api/v1/sentiment/batch')
        .send({})
        .expect(400);
    });
  });

  describe('/api/v1/sentiment/realtime/:symbol (GET)', () => {
    it('should get real-time sentiment', () => {
      return request(app.getHttpServer())
        .get('/api/v1/sentiment/realtime/BTC?timeWindow=3600')
        .expect(200)
        .expect((res) => {
          expect(res.body.symbol).toBe('BTC');
          expect(res.body.currentSentiment).toBeDefined();
          expect(res.body.trend).toBeDefined();
          expect(res.body.trendStrength).toBeDefined();
          expect(res.body.volatility).toBeDefined();
          expect(res.body.timeWindow).toBe(3600);
        });
    });
  });

  describe('/api/v1/sentiment/cross-platform/:symbol (GET)', () => {
    it('should get cross-platform sentiment', () => {
      return request(app.getHttpServer())
        .get('/api/v1/sentiment/cross-platform/ETH')
        .expect(200)
        .expect((res) => {
          expect(res.body.symbol).toBe('ETH');
          expect(res.body.crossPlatformScore).toBeDefined();
          expect(res.body.consensus).toBeDefined();
          expect(res.body.consensus.agreement).toBeDefined();
          expect(res.body.consensus.score).toBeDefined();
          expect(res.body.consensus.strength).toBeDefined();
        });
    });
  });

  describe('Performance Tests', () => {
    it('should handle concurrent requests', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        request(app.getHttpServer())
          .post('/api/v1/sentiment/analyze')
          .send({
            text: `Test sentiment analysis ${i}`,
            source: 'performance_test'
          })
      );

      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result.status).toBe(201);
        expect(result.body.sentiment).toBeDefined();
      });
    });

    it('should respond within acceptable time limits', () => {
      const start = Date.now();
      
      return request(app.getHttpServer())
        .post('/api/v1/sentiment/analyze')
        .send({
          text: 'Performance test for sentiment analysis response time',
          source: 'performance_test'
        })
        .expect(201)
        .expect((res) => {
          const duration = Date.now() - start;
          expect(duration).toBeLessThan(5000); // Should respond within 5 seconds
          expect(res.body.sentiment).toBeDefined();
        });
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', () => {
      return request(app.getHttpServer())
        .post('/api/v1/sentiment/analyze')
        .send('invalid json')
        .expect(400);
    });

    it('should handle very long text', () => {
      const longText = 'a'.repeat(10000);
      
      return request(app.getHttpServer())
        .post('/api/v1/sentiment/analyze')
        .send({
          text: longText,
          source: 'test'
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.sentiment).toBeDefined();
        });
    });

    it('should handle special characters', () => {
      return request(app.getHttpServer())
        .post('/api/v1/sentiment/analyze')
        .send({
          text: '!@#$%^&*()_+{}|:"<>?[]\\;\',./',
          source: 'test'
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.sentiment).toBeDefined();
        });
    });
  });
});
