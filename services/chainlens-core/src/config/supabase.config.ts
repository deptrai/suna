import { registerAs } from '@nestjs/config';

export default registerAs('supabase', () => ({
  url: process.env.SUPABASE_URL || 'https://your-project.supabase.co',
  anonKey: process.env.SUPABASE_ANON_KEY || 'your-anon-key-here',
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key-here',
  
  // Database configuration
  database: {
    host: process.env.SUPABASE_DB_HOST || 'db.your-project.supabase.co',
    port: parseInt(process.env.SUPABASE_DB_PORT, 10) || 5432,
    database: process.env.SUPABASE_DB_NAME || 'postgres',
    username: process.env.SUPABASE_DB_USER || 'postgres',
    password: process.env.SUPABASE_DB_PASSWORD || 'your-db-password',
    ssl: process.env.NODE_ENV === 'production',
  },

  // Auth configuration
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },

  // JWT configuration
  jwt: {
    secret: process.env.SUPABASE_JWT_SECRET || 'your-jwt-secret',
    expiresIn: '24h',
  },

  // API configuration
  api: {
    timeout: 30000,
    retries: 3,
    retryDelay: 1000,
  },

  // Rate limiting per tier
  rateLimits: {
    free: {
      requests: 10,
      window: 3600, // 1 hour
    },
    pro: {
      requests: 100,
      window: 3600, // 1 hour
    },
    enterprise: {
      requests: 1000,
      window: 3600, // 1 hour
    },
  },

  // Feature flags
  features: {
    realtime: true,
    storage: true,
    edge_functions: true,
  },
}));
