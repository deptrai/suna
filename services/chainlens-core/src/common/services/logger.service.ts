import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';

@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly logger: winston.Logger;

  constructor(private configService: ConfigService) {
    const logLevel = this.configService.get<string>('LOG_LEVEL', 'info');
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');

    this.logger = winston.createLogger({
      level: logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
      defaultMeta: {
        service: 'chainlens-core',
        version: process.env.npm_package_version || '1.0.0',
        environment: nodeEnv,
      },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
          ),
        }),
      ],
    });

    // Add file transports in production
    if (nodeEnv === 'production') {
      this.logger.add(
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
        }),
      );
      this.logger.add(
        new winston.transports.File({
          filename: 'logs/combined.log',
        }),
      );
    }
  }

  log(message: any, context?: string | object) {
    if (typeof context === 'object') {
      this.logger.info(message, context);
    } else {
      this.logger.info(message, { context });
    }
  }

  error(message: any, trace?: string | object, context?: string, metadata?: object) {
    if (arguments.length === 4 && typeof metadata === 'object') {
      // Handle 4-argument case: message, trace, context, metadata
      this.logger.error(message, { trace, context, ...metadata });
    } else if (typeof trace === 'object') {
      this.logger.error(message, trace);
    } else {
      this.logger.error(message, { trace, context });
    }
  }

  warn(message: any, context?: string | object) {
    if (typeof context === 'object') {
      this.logger.warn(message, context);
    } else {
      this.logger.warn(message, { context });
    }
  }

  debug(message: any, context?: string | object) {
    if (typeof context === 'object') {
      this.logger.debug(message, context);
    } else {
      this.logger.debug(message, { context });
    }
  }

  verbose(message: any, context?: string | object) {
    if (typeof context === 'object') {
      this.logger.verbose(message, context);
    } else {
      this.logger.verbose(message, { context });
    }
  }

  // Custom methods for structured logging
  logRequest(method: string, url: string, statusCode: number, responseTime: number, userId?: string) {
    this.logger.info('HTTP Request', {
      method,
      url,
      statusCode,
      responseTime,
      userId,
      type: 'http_request',
    });
  }

  logError(error: Error, context?: string, metadata?: any) {
    this.logger.error(error.message, {
      stack: error.stack,
      context,
      metadata,
      type: 'error',
    });
  }

  logSecurity(event: string, userId?: string, ip?: string, metadata?: any) {
    this.logger.warn('Security Event', {
      event,
      userId,
      ip,
      metadata,
      type: 'security',
    });
  }

  logPerformance(operation: string, duration: number, metadata?: any) {
    this.logger.info('Performance Metric', {
      operation,
      duration,
      metadata,
      type: 'performance',
    });
  }

  logExternalApi(service: string, endpoint: string, statusCode: number, responseTime: number, success: boolean) {
    this.logger.info('External API Call', {
      service,
      endpoint,
      statusCode,
      responseTime,
      success,
      type: 'external_api',
    });
  }

  logCacheOperation(operation: 'hit' | 'miss' | 'set' | 'delete', key: string, ttl?: number) {
    this.logger.debug('Cache Operation', {
      operation,
      key,
      ttl,
      type: 'cache',
    });
  }

  logAnalysis(projectId: string, analysisType: string, duration: number, success: boolean, userId?: string) {
    this.logger.info('Analysis Completed', {
      projectId,
      analysisType,
      duration,
      success,
      userId,
      type: 'analysis',
    });
  }
}
