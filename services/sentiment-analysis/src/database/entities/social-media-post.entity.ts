import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('social_media_posts')
@Index(['platform', 'symbol'])
@Index(['createdAt'])
@Index(['platform', 'postId'], { unique: true })
export class SocialMediaPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  platform: string; // twitter, reddit, telegram, discord

  @Column({ type: 'varchar', length: 100 })
  postId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  symbol: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  author: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  authorId: string;

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  sentimentScore: number;

  @Column({ type: 'varchar', length: 20 })
  sentiment: string; // positive, negative, neutral

  @Column({ type: 'decimal', precision: 3, scale: 2 })
  confidence: number;

  @Column({ type: 'jsonb', nullable: true })
  metrics: any; // likes, retweets, comments, etc.

  @Column({ type: 'jsonb', nullable: true })
  hashtags: string[];

  @Column({ type: 'jsonb', nullable: true })
  mentions: string[];

  @Column({ type: 'varchar', length: 500, nullable: true })
  url: string;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  rawData: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Computed properties
  get engagementScore(): number {
    if (!this.metrics) return 0;
    const { likes = 0, retweets = 0, comments = 0 } = this.metrics;
    return likes + (retweets * 2) + (comments * 3);
  }

  get isRecent(): boolean {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return this.publishedAt > hourAgo;
  }
}
