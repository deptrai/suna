/**
 * T2.1.1c: Database Configuration
 * TypeORM configuration for OnChain Analysis Service
 */

import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions } from 'typeorm';

const databaseConfig = (): TypeOrmModuleOptions => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  const config: TypeOrmModuleOptions = {
    type: 'postgres',
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5433,
    username: process.env.DB_USERNAME || 'chainlens',
    password: process.env.DB_PASSWORD || 'chainlens_dev_password',
    database: process.env.DB_NAME || 'chainlens_microservices',
    
    // Entity configuration
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    subscribers: [__dirname + '/../**/*.subscriber{.ts,.js}'],
    
    // Development settings
    synchronize: !isProduction && process.env.DB_SYNCHRONIZE !== 'false',
    dropSchema: false,
    migrationsRun: isProduction,
    
    // Logging
    logging: !isProduction ? ['query', 'error', 'warn'] : ['error'],
    logger: 'advanced-console',
    
    // Connection pool settings
    extra: {
      connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
      acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT, 10) || 60000,
      timeout: parseInt(process.env.DB_TIMEOUT, 10) || 60000,
      reconnect: true,
      reconnectTries: parseInt(process.env.DB_RECONNECT_TRIES, 10) || 3,
      reconnectInterval: parseInt(process.env.DB_RECONNECT_INTERVAL, 10) || 2000,
    },
    
    // SSL configuration for production
    ssl: isProduction ? {
      rejectUnauthorized: false,
    } : false,
    
    // Schema
    schema: process.env.DB_SCHEMA || 'public',
    
    // Timezone
    // timezone: 'UTC', // Not supported in TypeORM
    
    // Cache
    cache: {
      type: 'redis',
      options: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB, 10) || 1,
      },
      duration: parseInt(process.env.DB_CACHE_DURATION, 10) || 30000, // 30 seconds
    },
  };

  return config;
};

// Export for TypeORM CLI
export const dataSourceOptions: DataSourceOptions = databaseConfig() as DataSourceOptions;
export const dataSource = new DataSource(dataSourceOptions);

export default registerAs('database', databaseConfig);
