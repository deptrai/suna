import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('rate_limits')
@Index(['identifier', 'endpoint'])
@Index(['windowStart'])
export class RateLimit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  identifier: string; // IP address, user ID, API key, etc.

  @Column({ type: 'varchar', length: 200 })
  endpoint: string;

  @Column({ type: 'int', default: 0 })
  requestCount: number;

  @Column({ type: 'int' })
  maxRequests: number;

  @Column({ type: 'int' })
  windowDuration: number; // in seconds

  @Column({ type: 'timestamp' })
  windowStart: Date;

  @Column({ type: 'timestamp' })
  windowEnd: Date;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status: string; // active, blocked, expired

  @Column({ type: 'timestamp', nullable: true })
  blockedUntil: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  userTier: string; // free, premium, enterprise

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Computed properties
  get remainingRequests(): number {
    return Math.max(0, this.maxRequests - this.requestCount);
  }

  get isExpired(): boolean {
    return new Date() > this.windowEnd;
  }

  get isBlocked(): boolean {
    return this.status === 'blocked' && this.blockedUntil && new Date() < this.blockedUntil;
  }

  get resetTime(): Date {
    return this.windowEnd;
  }

  get usagePercentage(): number {
    return (this.requestCount / this.maxRequests) * 100;
  }

  get timeUntilReset(): number {
    return Math.max(0, this.windowEnd.getTime() - Date.now());
  }
}
