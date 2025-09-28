import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('news_articles')
@Index(['source', 'symbol'])
@Index(['createdAt'])
@Index(['source', 'articleId'], { unique: true })
export class NewsArticle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  source: string; // coindesk, cointelegraph, newsapi, etc.

  @Column({ type: 'varchar', length: 200 })
  articleId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  symbol: string;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  author: string;

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  sentimentScore: number;

  @Column({ type: 'varchar', length: 20 })
  sentiment: string; // positive, negative, neutral

  @Column({ type: 'decimal', precision: 3, scale: 2 })
  confidence: number;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  imageUrl: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string;

  @Column({ type: 'jsonb', nullable: true })
  keywords: string[];

  @Column({ type: 'jsonb', nullable: true })
  entities: any; // extracted entities (people, organizations, etc.)

  @Column({ type: 'timestamp' })
  publishedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  rawData: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Computed properties
  get isRecent(): boolean {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.publishedAt > dayAgo;
  }

  get wordCount(): number {
    if (!this.content) return 0;
    return this.content.split(/\s+/).length;
  }

  get readingTime(): number {
    // Assuming 200 words per minute reading speed
    return Math.ceil(this.wordCount / 200);
  }
}
