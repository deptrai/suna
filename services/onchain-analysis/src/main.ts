/**
 * T2.1.1a: OnChain Analysis Service - Main Bootstrap
 * NestJS microservice initialization on port 3001
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import * as compression from 'compression';
import * as helmet from 'helmet';

import { AppModule } from './app.module';

async function bootstrap() {
  // Create Winston logger
  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.printf(({ timestamp, level, message, context, trace, ...meta }) => {
        return JSON.stringify({
          timestamp,
          level,
          message,
          context,
          service: 'onchain-analysis',
          ...(trace && { trace }),
          ...meta,
        });
      }),
    ),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple(),
        ),
      }),
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
      }),
    ],
  });

  // Create NestJS application
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      instance: logger,
    }),
  });

  // Get configuration service
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3001);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // Security middleware
  app.use(helmet.default({
    contentSecurityPolicy: nodeEnv === 'production' ? undefined : false,
  }));

  // Compression middleware
  app.use(compression());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // API prefix
  app.setGlobalPrefix('api/v1');

  // CORS configuration
  app.enableCors({
    origin: nodeEnv === 'production' 
      ? ['https://chainlens.com', 'https://api.chainlens.com']
      : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
  });

  // Swagger documentation
  if (nodeEnv !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('OnChain Analysis Service')
      .setDescription('Blockchain data analysis and risk assessment API')
      .setVersion('1.0.0')
      .addTag('onchain', 'OnChain analysis endpoints')
      .addTag('health', 'Health check endpoints')
      .addTag('metrics', 'Metrics and monitoring endpoints')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addApiKey(
        {
          type: 'apiKey',
          name: 'X-API-Key',
          in: 'header',
          description: 'API Key for service-to-service communication',
        },
        'API-Key',
      )
      .addServer(`http://localhost:${port}`, 'Development server')
      .addServer('https://api-onchain.chainlens.com', 'Production server')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });

    logger.info(`📚 Swagger documentation available at http://localhost:${port}/api/docs`);
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('🛑 SIGTERM received, shutting down gracefully...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('🛑 SIGINT received, shutting down gracefully...');
    await app.close();
    process.exit(0);
  });

  // Start the application
  await app.listen(port, '0.0.0.0');
  
  logger.info(`🚀 OnChain Analysis Service is running on port ${port}`);
  logger.info(`🌍 Environment: ${nodeEnv}`);
  logger.info(`📊 Health check: http://localhost:${port}/health`);
  logger.info(`📈 Metrics: http://localhost:${port}/metrics`);
  
  if (nodeEnv !== 'production') {
    logger.info(`📚 API Documentation: http://localhost:${port}/api/docs`);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

bootstrap().catch((error) => {
  console.error('Failed to start OnChain Analysis Service:', error);
  process.exit(1);
});
