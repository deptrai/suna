import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain')
  @ApiOperation({ summary: 'Get Prometheus metrics' })
  @ApiResponse({ 
    status: 200, 
    description: 'Prometheus metrics in text format',
    content: {
      'text/plain': {
        schema: {
          type: 'string',
          example: '# HELP sentiment_analysis_requests_total Total number of sentiment analysis requests\n# TYPE sentiment_analysis_requests_total counter\nsentiment_analysis_requests_total 42'
        }
      }
    }
  })
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }

  @Get('custom')
  @ApiOperation({ summary: 'Get custom application metrics' })
  @ApiResponse({ status: 200, description: 'Custom metrics in JSON format' })
  async getCustomMetrics() {
    return this.metricsService.getCustomMetrics();
  }
}
