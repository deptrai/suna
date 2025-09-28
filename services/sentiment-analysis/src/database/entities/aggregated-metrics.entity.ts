import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('aggregated_metrics')
@Index(['symbol', 'timeframe', 'createdAt'])
@Index(['symbol', 'timeframe'], { unique: true })
export class AggregatedMetrics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  symbol: string;

  @Column({ type: 'varchar', length: 20 })
  timeframe: string; // 1h, 4h, 24h, 7d, 30d

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  overallSentiment: number;

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  twitterSentiment: number;

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  redditSentiment: number;

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  newsSentiment: number;

  @Column({ type: 'int', default: 0 })
  twitterVolume: number;

  @Column({ type: 'int', default: 0 })
  redditVolume: number;

  @Column({ type: 'int', default: 0 })
  newsVolume: number;

  @Column({ type: 'decimal', precision: 3, scale: 2 })
  confidence: number;

  @Column({ type: 'jsonb', nullable: true })
  trendingHashtags: string[];

  @Column({ type: 'jsonb', nullable: true })
  topKeywords: string[];

  @Column({ type: 'jsonb', nullable: true })
  sourceBreakdown: any;

  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  sentimentChange: number; // Change from previous period

  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  volatility: number; // Sentiment volatility

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Computed properties
  get totalVolume(): number {
    return this.twitterVolume + this.redditVolume + this.newsVolume;
  }

  get dominantSource(): string {
    const volumes = {
      twitter: this.twitterVolume,
      reddit: this.redditVolume,
      news: this.newsVolume,
    };
    
    return Object.entries(volumes).reduce((a, b) => 
      volumes[a[0]] > volumes[b[0]] ? a : b
    )[0];
  }

  get sentimentCategory(): string {
    if (this.overallSentiment > 0.1) return 'positive';
    if (this.overallSentiment < -0.1) return 'negative';
    return 'neutral';
  }

  get isHighVolume(): boolean {
    return this.totalVolume > 100; // Threshold for high volume
  }
}
