/**
 * T2.1.1c: Rate Limit Entity
 * Database entity for tracking API rate limits
 */

import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('onchain_rate_limits')
@Index(['userId', 'endpoint', 'windowStart'])
@Index(['windowStart'])
@Index(['endpoint'])
export class RateLimitEntity {
  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @PrimaryColumn({ type: 'varchar', length: 100 })
  endpoint: string;

  @PrimaryColumn({ type: 'timestamp with time zone' })
  windowStart: Date;

  @Column({ type: 'integer', default: 0 })
  requestCount: number;

  @Column({ type: 'interval', default: '1 hour' })
  windowDuration: string;

  @Column({ type: 'integer', default: 100 })
  maxRequests: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  userTier?: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  @Index()
  ipAddress?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent?: string;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: any;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;

  // Computed properties
  get isWindowExpired(): boolean {
    const windowEnd = new Date(this.windowStart.getTime() + this.getWindowDurationMs());
    return new Date() > windowEnd;
  }

  get remainingRequests(): number {
    return Math.max(0, this.maxRequests - this.requestCount);
  }

  get windowEndTime(): Date {
    return new Date(this.windowStart.getTime() + this.getWindowDurationMs());
  }

  get timeToReset(): number {
    return Math.max(0, this.windowEndTime.getTime() - Date.now());
  }

  private getWindowDurationMs(): number {
    // Parse interval string to milliseconds
    // Default to 1 hour if parsing fails
    const match = this.windowDuration.match(/(\d+)\s*(minute|hour|day)s?/i);
    if (!match) return 3600000; // 1 hour

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 'minute':
        return value * 60 * 1000;
      case 'hour':
        return value * 60 * 60 * 1000;
      case 'day':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 3600000; // 1 hour
    }
  }
}
