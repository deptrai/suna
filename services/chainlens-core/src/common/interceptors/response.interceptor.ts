import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta: {
    timestamp: string;
    version: string;
    requestId: string;
    processingTime?: number;
  };
  errors: any[];
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<Request>();
    const startTime = Date.now();

    return next.handle().pipe(
      map((data) => {
        const processingTime = Date.now() - startTime;
        
        return {
          success: true,
          data,
          meta: {
            timestamp: new Date().toISOString(),
            version: '1.0',
            requestId: request.headers['x-correlation-id'] as string || this.generateRequestId(),
            processingTime,
          },
          errors: [],
        };
      }),
    );
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
