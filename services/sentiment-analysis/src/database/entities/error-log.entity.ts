import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('error_logs')
@Index(['service', 'errorType'])
@Index(['createdAt'])
export class ErrorLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  service: string;

  @Column({ type: 'varchar', length: 100 })
  errorType: string;

  @Column({ type: 'varchar', length: 500 })
  message: string;

  @Column({ type: 'text', nullable: true })
  stackTrace: string;

  @Column({ type: 'jsonb', nullable: true })
  context: any;

  @Column({ type: 'varchar', length: 20 })
  severity: string; // low, medium, high, critical

  @Column({ type: 'varchar', length: 200, nullable: true })
  userId: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  requestId: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  endpoint: string;

  @Column({ type: 'boolean', default: false })
  resolved: boolean;

  @Column({ type: 'text', nullable: true })
  resolution: string;

  @CreateDateColumn()
  createdAt: Date;

  // Computed properties
  get age(): number {
    return Date.now() - this.createdAt.getTime();
  }

  get isRecent(): boolean {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return this.createdAt > hourAgo;
  }

  get isCritical(): boolean {
    return this.severity === 'critical';
  }
}
