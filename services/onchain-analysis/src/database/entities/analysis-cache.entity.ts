/**
 * T2.1.1c: Analysis Cache Entity
 * Database entity for caching analysis results
 */

import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('onchain_analysis_cache')
@Index(['projectId', 'analysisType'])
@Index(['createdAt'])
export class AnalysisCacheEntity {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  cacheKey: string;

  @Column({ type: 'varchar', length: 100 })
  @Index()
  projectId: string;

  @Column({ type: 'varchar', length: 42, nullable: true })
  @Index()
  tokenAddress?: string;

  @Column({ type: 'integer', nullable: true })
  @Index()
  chainId?: number;

  @Column({ type: 'varchar', length: 50, default: 'full' })
  analysisType: string;

  @Column({ type: 'jsonb' })
  analysisData: any;

  @Column({ type: 'timestamp with time zone' })
  @Index()
  expiresAt: Date;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 1.0 })
  dataFreshness: number;

  @Column({ type: 'integer', nullable: true })
  processingTime?: number; // milliseconds

  @Column({ type: 'varchar', length: 50, nullable: true })
  correlationId?: string;

  @Column({ type: 'jsonb', default: '[]' })
  dataSources: string[];

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  riskScore?: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  confidence?: number;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;

  // Computed properties
  get isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  get timeToExpiry(): number {
    return Math.max(0, this.expiresAt.getTime() - Date.now());
  }

  get ageInSeconds(): number {
    return Math.floor((Date.now() - this.createdAt.getTime()) / 1000);
  }
}
