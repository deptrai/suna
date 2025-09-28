/**
 * T2.1.1c: Error Log Entity
 * Database entity for logging errors and failures
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum ErrorCategory {
  API_ERROR = 'api_error',
  VALIDATION_ERROR = 'validation_error',
  PROCESSING_ERROR = 'processing_error',
  NETWORK_ERROR = 'network_error',
  DATABASE_ERROR = 'database_error',
  RATE_LIMIT_ERROR = 'rate_limit_error',
  AUTHENTICATION_ERROR = 'authentication_error',
  EXTERNAL_SERVICE_ERROR = 'external_service_error',
}

@Entity('onchain_error_logs')
@Index(['errorCategory', 'createdAt'])
@Index(['severity', 'createdAt'])
export class ErrorLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  @Index()
  errorCategory: ErrorCategory;

  @Column({ type: 'varchar', length: 20 })
  @Index()
  severity: ErrorSeverity;

  @Column({ type: 'varchar', length: 255 })
  errorMessage: string;

  @Column({ type: 'text', nullable: true })
  errorStack?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  endpoint?: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  httpMethod?: string;

  @Column({ type: 'integer', nullable: true })
  httpStatusCode?: number;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  userId?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  projectId?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  @Index()
  correlationId?: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  externalService?: string;

  @Column({ type: 'varchar', length: 42, nullable: true })
  tokenAddress?: string;

  @Column({ type: 'integer', nullable: true })
  chainId?: number;

  @Column({ type: 'jsonb', default: '{}' })
  requestData: any;

  @Column({ type: 'jsonb', default: '{}' })
  responseData: any;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: any;

  @Column({ type: 'integer', nullable: true })
  processingTime?: number; // milliseconds

  @Column({ type: 'boolean', default: false })
  @Index()
  resolved: boolean;

  @Column({ type: 'text', nullable: true })
  resolution?: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  resolvedAt?: Date;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  // Computed properties
  get ageInMinutes(): number {
    return Math.floor((Date.now() - this.createdAt.getTime()) / (1000 * 60));
  }

  get isRecent(): boolean {
    return this.ageInMinutes < 60; // Less than 1 hour
  }

  get isCritical(): boolean {
    return this.severity === ErrorSeverity.CRITICAL;
  }
}
