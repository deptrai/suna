import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('sentiment_cache')
@Index(['symbol', 'source'])
@Index(['createdAt'])
export class SentimentCache {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  symbol: string;

  @Column({ type: 'varchar', length: 50 })
  source: string;

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  sentimentScore: number;

  @Column({ type: 'varchar', length: 20 })
  sentiment: string; // positive, negative, neutral

  @Column({ type: 'decimal', precision: 3, scale: 2 })
  confidence: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  @Column({ type: 'jsonb', nullable: true })
  breakdown: any;

  @Column({ type: 'int', default: 0 })
  sampleSize: number;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Computed properties
  get isExpired(): boolean {
    return this.expiresAt && this.expiresAt < new Date();
  }

  get age(): number {
    return Date.now() - this.createdAt.getTime();
  }
}
