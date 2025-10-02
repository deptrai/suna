import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import * as helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Get configuration service
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3003);
  const environment = configService.get<string>('NODE_ENV', 'development');

  // Use Winston logger (disabled for now - LoggerModule not configured)
  // app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  // Security middleware
  app.use(helmet.default({
    contentSecurityPolicy: environment === 'production' ? undefined : false,
  }));

  // Compression middleware
  app.use(compression());

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
  }));

  // CORS configuration
  const corsOrigins = configService.get<string>('CORS_ORIGIN', 'http://localhost:3000').split(',');
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Swagger documentation
  if (environment === 'development') {
    const config = new DocumentBuilder()
      .setTitle('ChainLens Tokenomics Analysis Service')
      .setDescription('Token economics and DeFi protocol analysis API')
      .setVersion('1.0.0')
      .addTag('tokenomics', 'Token economics analysis')
      .addTag('supply', 'Token supply analysis')
      .addTag('distribution', 'Token distribution analysis')
      .addTag('scoring', 'Tokenomics scoring')
      .addTag('health', 'Service health checks')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'none',
        filter: true,
        showRequestHeaders: true,
      },
    });
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully');
    await app.close();
    process.exit(0);
  });

  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Tokenomics Analysis Service running on port ${port}`);
  console.log(`📊 Environment: ${environment}`);
  console.log(`📖 API Documentation: http://localhost:${port}/docs`);
  console.log(`🏥 Health Check: http://localhost:${port}/api/v1/health`);
}

bootstrap().catch((error) => {
  console.error('Failed to start Tokenomics Analysis Service:', error);
  process.exit(1);
});
