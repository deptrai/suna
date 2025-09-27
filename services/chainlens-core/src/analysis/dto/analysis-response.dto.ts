import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ServiceResponseDto {
  @ApiProperty({
    description: 'Service execution status',
    enum: ['success', 'error', 'timeout'],
    example: 'success',
  })
  status: string;

  @ApiProperty({
    description: 'Service response data',
    example: {
      price: { current: 12.45, change24h: 2.3 },
      liquidity: { totalLiquidity: 850000000 },
    },
  })
  data: any;

  @ApiProperty({
    description: 'Service response time in milliseconds',
    example: 1250,
  })
  responseTime: number;

  @ApiPropertyOptional({
    description: 'Error message if service failed',
    example: 'External API timeout',
  })
  error?: string;
}

export class AnalysisResponseDto {
  @ApiProperty({
    description: 'Project identifier',
    example: 'uniswap',
  })
  projectId: string;

  @ApiProperty({
    description: 'Type of analysis performed',
    example: 'full',
  })
  analysisType: string;

  @ApiProperty({
    description: 'Overall analysis score (0-100)',
    example: 85,
  })
  overallScore: number;

  @ApiProperty({
    description: 'Confidence level of the analysis (0-1)',
    example: 0.92,
  })
  confidence: number;

  @ApiProperty({
    description: 'Risk level assessment',
    enum: ['very-low', 'low', 'medium', 'high', 'very-high'],
    example: 'low',
  })
  riskLevel: string;

  @ApiProperty({
    description: 'Analysis timestamp',
    example: '2025-01-27T10:00:00Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'Total processing time in milliseconds',
    example: 3247,
  })
  processingTime: number;

  @ApiProperty({
    description: 'Individual service responses',
    type: 'object',
    additionalProperties: {
      $ref: '#/components/schemas/ServiceResponseDto',
    },
    example: {
      onchain: {
        status: 'success',
        data: { price: { current: 12.45 } },
        responseTime: 1250,
      },
      sentiment: {
        status: 'success',
        data: { overallSentiment: 0.65 },
        responseTime: 1850,
      },
    },
  })
  services: Record<string, ServiceResponseDto>;

  @ApiPropertyOptional({
    description: 'Analysis warnings',
    type: [String],
    example: ['limited_data_availability', 'high_volatility_detected'],
  })
  warnings?: string[];

  @ApiPropertyOptional({
    description: 'Analysis recommendations',
    type: [String],
    example: ['low_risk_positive_indicators', 'strong_community_support'],
  })
  recommendations?: string[];

  @ApiPropertyOptional({
    description: 'Cached result indicator',
    example: false,
  })
  cached?: boolean;

  @ApiPropertyOptional({
    description: 'Analysis correlation ID for tracking',
    example: 'corr_abc123',
  })
  correlationId?: string;

  @ApiPropertyOptional({
    description: 'Analysis metadata',
    example: {
      dataQuality: 'high',
      sourcesUsed: ['moralis', 'dexscreener', 'twitter'],
      lastUpdated: '2025-01-27T09:30:00Z',
    },
  })
  metadata?: any;
}
