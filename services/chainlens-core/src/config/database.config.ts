import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export default registerAs('database', (): TypeOrmModuleOptions => ({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'chainlens_core',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: process.env.NODE_ENV === 'development',
  logging: process.env.NODE_ENV === 'development',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  retryAttempts: 3,
  retryDelay: 3000,
  autoLoadEntities: true,
  extra: {
    max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
    min: parseInt(process.env.DB_POOL_MIN, 10) || 5,
    acquire: parseInt(process.env.DB_POOL_ACQUIRE, 10) || 30000,
    idle: parseInt(process.env.DB_POOL_IDLE, 10) || 10000,
    evict: parseInt(process.env.DB_POOL_EVICT, 10) || 60000,
    handleDisconnects: true,
    statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT, 10) || 30000,
    query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT, 10) || 30000,
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) || 5000,
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT, 10) || 30000,
  },
}));
