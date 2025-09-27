import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LoggerService } from '../services/logger.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;
    let error: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exception.name;
      } else {
        message = (exceptionResponse as any).message || exception.message;
        error = (exceptionResponse as any).error || exception.name;
      }
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = exception.message;
      error = 'Internal Server Error';
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'An unexpected error occurred';
      error = 'Internal Server Error';
    }

    const errorResponse = {
      success: false,
      data: null,
      errors: [
        {
          code: this.getErrorCode(status),
          message,
          timestamp: new Date().toISOString(),
          path: request.url,
          method: request.method,
        },
      ],
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
        requestId: request.headers['x-correlation-id'] || 'unknown',
      },
    };

    // Log the error
    this.logger.logError(
      exception instanceof Error ? exception : new Error(String(exception)),
      'AllExceptionsFilter',
      {
        url: request.url,
        method: request.method,
        statusCode: status,
        userAgent: request.headers['user-agent'],
        ip: request.ip,
        userId: (request as any).user?.id,
        correlationId: request.headers['x-correlation-id'],
      },
    );

    // Send security alert for suspicious errors
    if (this.isSuspiciousError(status, request)) {
      this.logger.logSecurity(
        'suspicious_error',
        (request as any).user?.id,
        request.ip,
        {
          statusCode: status,
          url: request.url,
          userAgent: request.headers['user-agent'],
        },
      );
    }

    response.status(status).json(errorResponse);
  }

  private getErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.METHOD_NOT_ALLOWED:
        return 'METHOD_NOT_ALLOWED';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'VALIDATION_ERROR';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMIT_EXCEEDED';
      case HttpStatus.INTERNAL_SERVER_ERROR:
        return 'INTERNAL_SERVER_ERROR';
      case HttpStatus.BAD_GATEWAY:
        return 'BAD_GATEWAY';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'SERVICE_UNAVAILABLE';
      case HttpStatus.GATEWAY_TIMEOUT:
        return 'GATEWAY_TIMEOUT';
      default:
        return 'UNKNOWN_ERROR';
    }
  }

  private isSuspiciousError(status: number, request: Request): boolean {
    // Check for suspicious patterns
    const suspiciousPatterns = [
      // SQL injection attempts
      /(\bUNION\b|\bSELECT\b|\bINSERT\b|\bDELETE\b|\bDROP\b)/i,
      // XSS attempts
      /<script|javascript:|on\w+=/i,
      // Path traversal
      /\.\.\//,
      // Command injection
      /[;&|`$]/,
    ];

    const url = request.url.toLowerCase();
    const userAgent = (request.headers['user-agent'] || '').toLowerCase();

    // Check for suspicious patterns in URL
    if (suspiciousPatterns.some(pattern => pattern.test(url))) {
      return true;
    }

    // Check for suspicious user agents
    const suspiciousUserAgents = [
      'sqlmap',
      'nikto',
      'nmap',
      'masscan',
      'burp',
      'owasp',
    ];

    if (suspiciousUserAgents.some(agent => userAgent.includes(agent))) {
      return true;
    }

    // Multiple 401/403 errors might indicate brute force
    if ([HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN].includes(status)) {
      return true;
    }

    return false;
  }
}
