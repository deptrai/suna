import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Get correlation ID from header or generate new one
    const correlationId = req.headers['x-correlation-id'] as string || uuidv4();
    
    // Set correlation ID in request headers
    req.headers['x-correlation-id'] = correlationId;
    
    // Set correlation ID in response headers
    res.setHeader('X-Correlation-ID', correlationId);
    
    next();
  }
}
