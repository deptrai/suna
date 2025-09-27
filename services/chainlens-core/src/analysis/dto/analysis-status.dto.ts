import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnalysisStatusDto {
  @ApiProperty({
    description: 'Analysis request ID',
    example: 'analysis_123456789',
  })
  analysisId: string;

  @ApiProperty({
    description: 'Current status of the analysis',
    enum: ['queued', 'processing', 'completed', 'failed', 'cancelled'],
    example: 'processing',
  })
  status: string;

  @ApiProperty({
    description: 'Progress percentage (0-100)',
    example: 65,
  })
  progress: number;

  @ApiProperty({
    description: 'Current processing stage',
    example: 'sentiment_analysis',
  })
  currentStage: string;

  @ApiProperty({
    description: 'Estimated completion time in seconds',
    example: 45,
  })
  estimatedCompletion: number;

  @ApiProperty({
    description: 'Analysis creation timestamp',
    example: '2025-01-27T10:00:00Z',
  })
  createdAt: string;

  @ApiPropertyOptional({
    description: 'Analysis start timestamp',
    example: '2025-01-27T10:01:00Z',
  })
  startedAt?: string;

  @ApiPropertyOptional({
    description: 'Analysis completion timestamp',
    example: '2025-01-27T10:05:00Z',
  })
  completedAt?: string;

  @ApiPropertyOptional({
    description: 'Error message if analysis failed',
    example: 'External API service unavailable',
  })
  error?: string;

  @ApiPropertyOptional({
    description: 'Detailed stage progress',
    example: {
      onchain: { status: 'completed', progress: 100 },
      sentiment: { status: 'processing', progress: 75 },
      tokenomics: { status: 'queued', progress: 0 },
      team: { status: 'queued', progress: 0 },
    },
  })
  stageProgress?: Record<string, { status: string; progress: number }>;

  @ApiPropertyOptional({
    description: 'Analysis result (if completed)',
  })
  result?: any;

  @ApiPropertyOptional({
    description: 'Analysis metadata',
    example: {
      projectId: 'uniswap',
      analysisType: 'full',
      priority: 'normal',
      userId: 'user_123',
    },
  })
  metadata?: any;
}
