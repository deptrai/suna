import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseDto<T = any> {
  @ApiProperty({ description: 'Indicates if the request was successful' })
  success: boolean;

  @ApiProperty({ description: 'Response data' })
  data?: T;

  @ApiProperty({ description: 'Response metadata' })
  meta?: {
    timestamp: string;
    version: string;
    requestId?: string;
    processingTime?: number;
    [key: string]: any;
  };

  @ApiProperty({ description: 'Array of errors if any occurred' })
  errors?: Array<{
    code?: string;
    message: string;
    field?: string;
    details?: any;
  }>;
}
